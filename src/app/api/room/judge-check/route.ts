import { isJudgeKey } from "@/lib/server/room-store";

/** Is this phone's judge key still valid? */
export async function POST(req: Request) {
  return isJudgeKey(req.headers.get("x-judge-key")) ? Response.json({ ok: true }) : Response.json({ ok: false }, { status: 401 });
}
