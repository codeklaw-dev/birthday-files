import "server-only";
import { open, rm } from "node:fs/promises";
import { LIMITS } from "../config";
import type { MediaKind } from "../types";

/**
 * Upload checks. File type is decided by the bytes, never by the name or the
 * Content-Type the browser claims.
 */

export interface Sniffed {
  kind: MediaKind;
  mime: string;
  ext: string;
}

const ascii = (b: Uint8Array, start: number, end: number) => String.fromCharCode(...b.subarray(start, end));

export function sniff(head: Uint8Array): Sniffed | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return { kind: "photo", mime: "image/jpeg", ext: "jpg" };
  if (head.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => head[i] === b)) return { kind: "photo", mime: "image/png", ext: "png" };
  if (head.length >= 12 && ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 12) === "WEBP") return { kind: "photo", mime: "image/webp", ext: "webp" };
  if (head.length >= 12 && ascii(head, 4, 8) === "ftyp") {
    const brand = ascii(head, 8, 12);
    if (/^(heic|heix|hevc|mif1|msf1|avif)/.test(brand)) return null; // still images in an ISO box; browsers can't show HEIC
    return brand === "qt  " ? { kind: "video", mime: "video/quicktime", ext: "mov" } : { kind: "video", mime: "video/mp4", ext: "mp4" };
  }
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) {
    return ascii(head, 0, Math.min(head.length, 64)).includes("webm") ? { kind: "video", mime: "video/webm", ext: "webm" } : null;
  }
  return null;
}

export class UploadError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Stream a request body to disk, refusing anything over `maxBytes` as soon as it's exceeded. */
export async function streamToFile(body: ReadableStream<Uint8Array> | null, path: string, maxBytes: number): Promise<{ bytes: number; head: Uint8Array }> {
  if (!body) throw new UploadError("No file received.", 400);
  const fh = await open(path, "w", 0o600);
  const head = new Uint8Array(64);
  let headLen = 0;
  let bytes = 0;
  const reader = body.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > maxBytes) throw new UploadError(`That file is too big (limit ${Math.round(maxBytes / 1024 / 1024)} MB).`, 413);
      if (headLen < head.length) {
        const take = Math.min(head.length - headLen, value.length);
        head.set(value.subarray(0, take), headLen);
        headLen += take;
      }
      await fh.write(value);
    }
  } catch (err) {
    await reader.cancel().catch(() => {});
    await fh.close();
    await rm(path, { force: true });
    throw err;
  }
  await fh.close();
  if (bytes === 0) {
    await rm(path, { force: true });
    throw new UploadError("The file was empty.", 400);
  }
  return { bytes, head: head.subarray(0, headLen) };
}

/** Duration from an MP4/MOV `moov/mvhd` box, reading only box headers. */
export async function mp4DurationSec(path: string): Promise<number | null> {
  const fh = await open(path, "r");
  try {
    const { size } = await fh.stat();
    const buf = Buffer.alloc(32);
    const readBox = async (at: number) => {
      const { bytesRead } = await fh.read(buf, 0, 16, at);
      if (bytesRead < 8) return null;
      let len = buf.readUInt32BE(0);
      const type = buf.toString("latin1", 4, 8);
      let header = 8;
      if (len === 1) {
        len = Number(buf.readBigUInt64BE(8));
        header = 16;
      } else if (len === 0) len = size - at;
      return len >= header ? { len, type, header } : null;
    };
    for (let at = 0; at < size; ) {
      const box = await readBox(at);
      if (!box) return null;
      if (box.type === "moov") {
        for (let c = at + box.header; c < at + box.len; ) {
          const child = await readBox(c);
          if (!child) return null;
          if (child.type === "mvhd") {
            const { bytesRead } = await fh.read(buf, 0, 32, c + child.header);
            if (bytesRead < 20) return null;
            const version = buf[0];
            const timescale = version === 1 ? buf.readUInt32BE(20) : buf.readUInt32BE(12);
            const duration = version === 1 ? Number(buf.readBigUInt64BE(24)) : buf.readUInt32BE(16);
            return timescale ? duration / timescale : null;
          }
          c += child.len;
        }
        return null;
      }
      at += box.len;
    }
    return null;
  } finally {
    await fh.close();
  }
}

/** Duration from a WebM's Segment/Info. Recorders often omit it; then null. */
export async function webmDurationSec(path: string): Promise<number | null> {
  const fh = await open(path, "r");
  try {
    const buf = Buffer.alloc(256 * 1024);
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    const b = buf.subarray(0, bytesRead);
    const info = b.indexOf(Buffer.from([0x15, 0x49, 0xa9, 0x66]));
    if (info < 0) return null;
    const vint = (at: number, keepMarker: boolean) => {
      const first = b[at];
      if (first === undefined || first === 0) return null;
      const len = Math.clz32(first) - 23;
      let value = keepMarker ? first : first & (0xff >> len);
      for (let i = 1; i < len; i++) value = value * 256 + b[at + i];
      return { value, len };
    };
    const infoSize = vint(info + 4, false);
    if (!infoSize) return null;
    let scale = 1_000_000;
    let duration: number | null = null;
    const end = Math.min(b.length, info + 4 + infoSize.len + infoSize.value);
    for (let at = info + 4 + infoSize.len; at < end; ) {
      const id = vint(at, true);
      if (!id) break;
      const size = vint(at + id.len, false);
      if (!size) break;
      const data = at + id.len + size.len;
      if (id.value === 0x2ad7b1) scale = b.readUIntBE(data, Math.min(size.value, 6));
      if (id.value === 0x4489) duration = size.value === 4 ? b.readFloatBE(data) : b.readDoubleBE(data);
      at = data + size.value;
    }
    return duration === null ? null : (duration * scale) / 1e9;
  } finally {
    await fh.close();
  }
}

export function videoDurationOk(sec: number): boolean {
  return sec >= LIMITS.videoMinSec - 1 && sec <= LIMITS.videoMaxSec + 1;
}

/**
 * Remove metadata blocks (EXIF incl. GPS location, XMP, comments) from a JPEG
 * without re-encoding it. Image data is untouched.
 */
export function stripJpegMetadata(buf: Uint8Array): Uint8Array {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return buf;
  const out: Uint8Array[] = [buf.subarray(0, 2)];
  let at = 2;
  while (at + 4 <= buf.length && buf[at] === 0xff) {
    const marker = buf[at + 1];
    if (marker === 0xda) break; // start of scan: the rest is image data
    const len = (buf[at + 2] << 8) | buf[at + 3];
    const isMeta = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe; // APP1–APP15, COM
    if (!isMeta) out.push(buf.subarray(at, at + 2 + len));
    at += 2 + len;
  }
  out.push(buf.subarray(at));
  const total = out.reduce((n, p) => n + p.length, 0);
  const result = new Uint8Array(total);
  let o = 0;
  for (const p of out) {
    result.set(p, o);
    o += p.length;
  }
  return result;
}

/** Drop PNG text and EXIF chunks (tEXt, zTXt, iTXt, eXIf, tIME). */
export function stripPngMetadata(buf: Uint8Array): Uint8Array {
  const drop = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);
  const parts: Uint8Array[] = [buf.subarray(0, 8)];
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let at = 8;
  while (at + 12 <= buf.length) {
    const len = view.getUint32(at);
    const type = String.fromCharCode(...buf.subarray(at + 4, at + 8));
    const end = at + 12 + len;
    if (!drop.has(type)) parts.push(buf.subarray(at, end));
    at = end;
    if (type === "IEND") break;
  }
  const result = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    result.set(p, o);
    o += p.length;
  }
  return result;
}
