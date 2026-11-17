import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import type { NextRequest } from "next/server";
import { mediaFile } from "@/lib/invite/server/paths";
import { verifyMediaSignature } from "@/lib/invite/server/secrets";
import { inviteStore } from "@/lib/invite/server/store";

/**
 * Private media. Only reachable with a short-lived signed link, which the
 * server hands out to the host (admin views) or to the guest who owns the file.
 * Supports Range requests so videos can seek.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sp = req.nextUrl.searchParams;
  const deny = () => new Response("Not available.", { status: 403, headers: { "Cache-Control": "no-store" } });
  if (!/^[0-9a-f-]{36}$/.test(id) || !verifyMediaSignature(id, sp.get("exp"), sp.get("sig"))) return deny();
  const found = inviteStore().mediaById(id);
  if (!found) return new Response("Not found.", { status: 404, headers: { "Cache-Control": "no-store" } });
  const path = mediaFile(found.ref.id, found.ref.ext);
  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    return new Response("Not found.", { status: 404 });
  }

  const headers: Record<string, string> = {
    "Content-Type": found.ref.mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=600",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": "inline",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  let start = 0;
  let end = size - 1;
  let status = 200;
  if (range) {
    if (range[1] === "" && range[2] !== "") start = Math.max(0, size - Number(range[2]));
    else {
      start = Number(range[1] || 0);
      if (range[2]) end = Math.min(end, Number(range[2]));
    }
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    status = 206;
    headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
  }
  headers["Content-Length"] = String(end - start + 1);
  const stream = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream<Uint8Array>;
  return new Response(stream, { status, headers });
}
