import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { saveUpload, UploadError } from "@/lib/server/uploads";

/**
 * Guest photo/video upload. The phone sends the raw file as the request body
 * (no multipart), so the server can stream it to disk without buffering.
 */
export async function POST(req: Request) {
  try {
    const saved = await saveUpload(req.body as unknown as WebReadableStream<Uint8Array> | null, req.headers.get("content-type") ?? "");
    return Response.json({ ok: true, url: saved.url, kind: saved.kind });
  } catch (err) {
    const status = err instanceof UploadError ? err.status : 500;
    const error = err instanceof UploadError ? err.message : "Upload failed. Please try again.";
    return Response.json({ ok: false, error }, { status });
  }
}
