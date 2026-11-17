import { isHostKey, roomStore } from "@/lib/server/room-store";

/** Host: get or rotate Mez's judge-phone key (shown as a link/QR on the dashboard). */
export async function GET(req: Request) {
  if (!isHostKey(req.headers.get("x-host-key"))) return Response.json({ error: "Wrong host key." }, { status: 401 });
  return Response.json({ ok: true, key: roomStore.judgeKey() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  if (!isHostKey(req.headers.get("x-host-key"))) return Response.json({ error: "Wrong host key." }, { status: 401 });
  return Response.json({ ok: true, key: roomStore.rotateJudgeKey() }, { headers: { "Cache-Control": "no-store" } });
}
