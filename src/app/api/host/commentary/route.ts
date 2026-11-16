import { writeCommentary, type CommentaryKind } from "@/lib/host/server/commentary";
import { AllProvidersFailed } from "@/lib/host/server/router";
import { isHostKey, roomStore } from "@/lib/server/room-store";

const KINDS: CommentaryKind[] = ["roast", "hype", "reveal", "leaderboard"];

/** Host-only: draft a line for review. Nothing is spoken until the host approves. */
export async function POST(req: Request) {
  if (!isHostKey(req.headers.get("x-host-key"))) return Response.json({ error: "Wrong host key." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { kind?: CommentaryKind; note?: string };
  const kind = KINDS.includes(body.kind as CommentaryKind) ? (body.kind as CommentaryKind) : "roast";
  try {
    const w = await writeCommentary(roomStore.getState(), kind, typeof body.note === "string" ? body.note : "");
    return Response.json({ ok: true, ...w });
  } catch (err) {
    const attempts = err instanceof AllProvidersFailed ? err.attempts : [];
    return Response.json({ ok: false, error: (err as Error).message, attempts }, { status: 503 });
  }
}
