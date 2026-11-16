import type { Lang } from "@/lib/game/types";
import { AllProvidersFailed } from "@/lib/host/server/router";
import { speech } from "@/lib/host/server/speech-cache";
import { isHostKey } from "@/lib/server/room-store";

/** Host-only voice preview: speak any short text in the admin's own speakers. */
export async function POST(req: Request) {
  if (!isHostKey(req.headers.get("x-host-key"))) return Response.json({ error: "Wrong host key." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { text?: string; lang?: Lang };
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 400) : "";
  if (!text || (body.lang !== "en" && body.lang !== "bn")) return Response.json({ error: "Send text and lang (en|bn)." }, { status: 400 });
  try {
    const r = await speech(text, body.lang);
    return new Response(new Blob([r.audio.bytes], { type: r.audio.mime }), {
      headers: { "Content-Type": r.audio.mime, "X-Host-Provider": r.cached ? "cache" : r.provider, "X-Host-Ms": String(r.ms) },
    });
  } catch (err) {
    return Response.json({ error: "Speech unavailable.", attempts: err instanceof AllProvidersFailed ? err.attempts : [] }, { status: 503 });
  }
}
