import type { Action } from "@/lib/game/types";
import { ensureHostService } from "@/lib/host/server/service";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";
import { isHostKey, roomStore } from "@/lib/server/room-store";

const LIMITS: Record<string, [number, number]> = {
  submitMessage: [6, 60_000],
  join: [12, 60_000],
  blow: [40, 5_000],
};

export async function POST(req: Request) {
  ensureHostService();
  let action: Action;
  try {
    action = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  const type = typeof action?.type === "string" ? action.type : "";

  // system/* actions are server-internal; host/* need the host key.
  if (type.startsWith("system/")) {
    return Response.json({ ok: false, error: "Forbidden." }, { status: 403 });
  }
  if (type.startsWith("host/") && !isHostKey(req.headers.get("x-host-key"))) {
    return Response.json({ ok: false, error: "Wrong host key." }, { status: 401 });
  }
  const limit = LIMITS[type];
  if (limit && !rateLimit(`${clientIp(req)}:${type}`, limit[0], limit[1])) {
    return Response.json({ ok: false, error: "Slow down a little and try again in a minute." }, { status: 429 });
  }

  const result = roomStore.dispatch(action);
  return result.ok
    ? Response.json({ ok: true })
    : Response.json({ ok: false, error: result.error }, { status: 422 });
}
