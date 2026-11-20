import "server-only";
import { randomUUID } from "node:crypto";
import { createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { UPLOAD_NAME, type MediaKind } from "@/lib/game/media";

/**
 * Guest photo/video uploads, stored on the server's disk.
 *
 * Files live in UPLOAD_DIR (default DATA_DIR/uploads). On Railway DATA_DIR is a
 * mounted volume, so uploads survive restarts and redeploys.
 */
export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.env.DATA_DIR || path.join(process.cwd(), ".data"), "uploads");

export const UPLOAD_LIMITS = {
  imageBytes: 15 * 1024 * 1024,
  videoBytes: 150 * 1024 * 1024,
  /** Stop accepting uploads once the folder holds this much. */
  totalBytes: 4 * 1024 * 1024 * 1024,
} as const;

const TYPE_TO_EXT: Record<string, { ext: string; kind: MediaKind }> = {
  "image/jpeg": { ext: "jpg", kind: "image" },
  "image/png": { ext: "png", kind: "image" },
  "image/webp": { ext: "webp", kind: "image" },
  "video/mp4": { ext: "mp4", kind: "video" },
  "video/quicktime": { ext: "mov", kind: "video" },
  "video/webm": { ext: "webm", kind: "video" },
};
const EXT_TO_TYPE: Record<string, string> = Object.fromEntries(Object.entries(TYPE_TO_EXT).map(([t, { ext }]) => [ext, t]));

let usedBytes: number | null = null;
async function currentUsage(): Promise<number> {
  if (usedBytes !== null) return usedBytes;
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  let total = 0;
  for (const name of await fs.readdir(UPLOAD_DIR)) {
    total += (await fs.stat(path.join(UPLOAD_DIR, name)).catch(() => ({ size: 0 }))).size;
  }
  return (usedBytes = total);
}

export class UploadError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Streams a request body to disk, enforcing type and size limits. */
export async function saveUpload(body: WebReadableStream<Uint8Array> | null, contentType: string) {
  const type = TYPE_TO_EXT[contentType.split(";")[0].trim().toLowerCase()];
  if (!type) throw new UploadError("Only photos (JPEG, PNG, WebP) and videos (MP4, MOV, WebM) can be uploaded.", 415);
  if (!body) throw new UploadError("The upload was empty.", 400);

  const limit = type.kind === "video" ? UPLOAD_LIMITS.videoBytes : UPLOAD_LIMITS.imageBytes;
  if ((await currentUsage()) + limit > UPLOAD_LIMITS.totalBytes) throw new UploadError("Uploads are full for now. Send a note instead.", 507);

  const name = `${randomUUID()}.${type.ext}`;
  const file = path.join(UPLOAD_DIR, name);
  let size = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _enc, done) {
      size += chunk.length;
      if (size > limit) done(new UploadError(`That ${type.kind} is too big (max ${Math.round(limit / 1024 / 1024)} MB).`, 413));
      else done(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(body), counter, createWriteStream(file, { flags: "wx" }));
  } catch (err) {
    await fs.rm(file, { force: true });
    throw err instanceof UploadError ? err : new UploadError("The upload was interrupted. Please try again.", 400);
  }
  if (size === 0) {
    await fs.rm(file, { force: true });
    throw new UploadError("The upload was empty.", 400);
  }
  usedBytes = (usedBytes ?? 0) + size;
  return { url: `/api/uploads/${name}`, kind: type.kind, size };
}

/** Resolves a stored upload by file name, or null if it is not one of ours. */
export async function findUpload(name: string) {
  if (!UPLOAD_NAME.test(name)) return null;
  const file = path.join(UPLOAD_DIR, name);
  const stat = await fs.stat(file).catch(() => null);
  if (!stat?.isFile()) return null;
  return { file, size: stat.size, type: EXT_TO_TYPE[name.split(".").pop()!] };
}
