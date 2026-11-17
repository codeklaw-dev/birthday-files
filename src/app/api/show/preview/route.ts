import { randomUUID } from "node:crypto";
import { applyAction, viewFor } from "@/lib/game/engine";
import { knowledge } from "@/lib/host/server/knowledge";
import { withMedia } from "@/lib/server/media-view";
import { isHostKey, roomStore, secureRandom } from "@/lib/server/room-store";
import { startFor } from "@/lib/show/server/build";

/**
 * Preview-before-live: runs a segment's start against a throwaway copy of
 * the room and returns what the TV would show. Nothing is dispatched, so
 * guests, the TV and the scores are untouched.
 */
export async function POST(req: Request) {
  if (!isHostKey(req.headers.get("x-host-key"))) return Response.json({ ok: false, error: "Wrong host key." }, { status: 401 });
  let body: { segmentId?: unknown; index?: unknown; revealed?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  const state = roomStore.getState();
  const seg = state.show.plan.find((s) => s.id === body.segmentId);
  if (!seg) return Response.json({ ok: false, error: "Unknown segment." }, { status: 422 });
  const now = Date.now();
  const ctx = { now, newId: () => randomUUID().slice(0, 8), random: secureRandom };
  // Preview ignores pause / emergency: it never reaches the room.
  const res = applyAction({ ...state, show: { ...state.show, paused: null, hold: null } }, { type: "host/show/go", segmentId: seg.id, start: startFor(seg, state) ?? undefined }, ctx);
  if (!res.ok) return Response.json({ ok: false, error: res.error }, { status: 422 });
  let preview = res.state;
  // Optionally step into the scene (e.g. to check item 3 and its reveal).
  const index = Number(body.index);
  if (preview.scene && Number.isInteger(index) && index >= -1 && index < preview.scene.items.length) preview = { ...preview, scene: { ...preview.scene, index, revealed: !!body.revealed } };
  const view = withMedia({ ...viewFor(preview, "display", null, now), hostName: knowledge().personality().name.en });
  return Response.json({ ok: true, view, segment: seg });
}
