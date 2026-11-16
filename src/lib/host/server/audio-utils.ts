import type { Lang } from "@/lib/game/types";
import type { Audio } from "./types";

/** Wrap raw 16-bit little-endian mono PCM in a WAV header so browsers can play it. */
export function pcmToWav(pcm: Uint8Array, sampleRate: number, channels = 1): Audio {
  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const write = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  write(0, "RIFF");
  v.setUint32(4, 36 + pcm.length, true);
  write(8, "WAVE");
  write(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * channels * 2, true);
  v.setUint16(32, channels * 2, true);
  v.setUint16(34, 16, true);
  write(36, "data");
  v.setUint32(40, pcm.length, true);
  const out = new Uint8Array(44 + pcm.length);
  out.set(new Uint8Array(header), 0);
  out.set(pcm, 44);
  return { bytes: out, mime: "audio/wav" };
}

/** Parse "audio/L16;codec=pcm;rate=24000" style MIME types. */
export function pcmRate(mime: string, fallback = 24000): number {
  const m = /rate=(\d+)/i.exec(mime);
  return m ? Number(m[1]) : fallback;
}

/** Bangla script → bn, Latin → en. Used when an API doesn't report language. */
export function detectLang(text: string): Lang | null {
  const bn = (text.match(/[ঀ-৿]/g) ?? []).length;
  const en = (text.match(/[A-Za-z]/g) ?? []).length;
  if (bn === 0 && en === 0) return null;
  return bn >= en ? "bn" : "en";
}

export function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const buf = Buffer.from(b64, "base64");
  const out = new Uint8Array(new ArrayBuffer(buf.length));
  out.set(buf);
  return out;
}

export function audioDurationMs(audio: Audio): number | null {
  if (audio.mime !== "audio/wav" || audio.bytes.length < 44) return null;
  const v = new DataView(audio.bytes.buffer, audio.bytes.byteOffset);
  const byteRate = v.getUint32(28, true);
  return byteRate ? Math.round(((audio.bytes.length - 44) / byteRate) * 1000) : null;
}

/** Pull the first JSON object out of an LLM reply (tolerates code fences and chatter). */
export function extractJson<T>(text: string): T | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

/** Make LLM text safe and pleasant to speak: no markdown, emoji, links or runaway length. */
export function speakable(text: unknown, max = 280): string {
  if (typeof text !== "string") return "";
  return text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_`#>~|]/g, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
