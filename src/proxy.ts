import { NextResponse, type NextRequest } from "next/server";
import { publicAllowed, viaCloudflare } from "@/lib/server/public-gate";

/** Internet visitors (through the Cloudflare Tunnel) only ever reach the invitation. */
export function proxy(req: NextRequest) {
  if (!viaCloudflare(req.headers) || publicAllowed(req.method, req.nextUrl.pathname)) return NextResponse.next();
  return new NextResponse("Not found.", { status: 404, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
}

export const config = {
  // Photo/video uploads skip the proxy entirely: Next buffers bodies that pass
  // through a proxy (10 MB by default), which would cut large videos short.
  // Those two routes are allowed publicly anyway and need a guest's edit token.
  // Static build assets are skipped too (public by nature, no data).
  matcher: ["/((?!_next/static|_next/image|api/invite/media/photo|api/invite/media/video).*)"],
};
