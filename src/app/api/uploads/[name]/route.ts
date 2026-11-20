import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { findUpload } from "@/lib/server/uploads";

/** Serves an uploaded photo/video. Supports byte ranges, which iPhones need to play video. */
export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const upload = await findUpload(name);
  if (!upload) return new Response("Not found", { status: 404 });

  const headers = new Headers({
    "Content-Type": upload.type,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": "inline",
  });

  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : upload.size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : upload.size - 1;
    start = Math.max(0, start);
    end = Math.min(end, upload.size - 1);
    if (start > end) {
      headers.set("Content-Range", `bytes */${upload.size}`);
      return new Response(null, { status: 416, headers });
    }
    headers.set("Content-Range", `bytes ${start}-${end}/${upload.size}`);
    headers.set("Content-Length", String(end - start + 1));
    const body = Readable.toWeb(createReadStream(upload.file, { start, end })) as ReadableStream<Uint8Array>;
    return new Response(body, { status: 206, headers });
  }

  headers.set("Content-Length", String(upload.size));
  return new Response(Readable.toWeb(createReadStream(upload.file)) as ReadableStream<Uint8Array>, { status: 200, headers });
}
