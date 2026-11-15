import { isHostKey } from "@/lib/server/room-store";

export async function POST(req: Request) {
  return isHostKey(req.headers.get("x-host-key"))
    ? Response.json({ ok: true })
    : Response.json({ ok: false, error: "Wrong host key." }, { status: 401 });
}
