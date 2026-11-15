import type { Action } from "@/lib/game/types";
import { isHostKey, roomStore } from "@/lib/server/room-store";

export async function POST(req: Request) {
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

  const result = roomStore.dispatch(action);
  return result.ok
    ? Response.json({ ok: true })
    : Response.json({ ok: false, error: result.error }, { status: 422 });
}
