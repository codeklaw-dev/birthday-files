import { isDisplayKey } from "@/lib/server/room-store";

export async function POST(req: Request) {
  return isDisplayKey(req.headers.get("x-host-key"))
    ? Response.json({ ok: true })
    : Response.json({ ok: false, error: "Wrong TV key." }, { status: 401 });
}
