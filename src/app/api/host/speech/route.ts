import type { NextRequest } from "next/server";
import type { Lang } from "@/lib/game/types";
import { AllProvidersFailed, mockAudioAllowed } from "@/lib/host/server/router";
import { ensureHostService } from "@/lib/host/server/service";
import { speech } from "@/lib/host/server/speech-cache";
import { roomStore } from "@/lib/server/room-store";

/**
 * Audio for one of the host's recent lines. Public (the TV needs it), but it
 * only ever speaks text the server itself put in the room state, so nobody
 * can use it to burn the TTS quota on arbitrary text.
 */
export async function GET(req: NextRequest) {
  ensureHostService();
  const id = req.nextUrl.searchParams.get("u");
  const lang = req.nextUrl.searchParams.get("lang") as Lang | null;
  if (lang !== "en" && lang !== "bn") return Response.json({ error: "lang must be en or bn" }, { status: 400 });
  const u = roomStore.getState().host.recent.find((x) => x.id === id);
  if (!u) return Response.json({ error: "Unknown line." }, { status: 404 });
  if (u.lang !== "both" && u.lang !== lang) return Response.json({ error: "Line is not spoken in that language." }, { status: 404 });
  try {
    const r = await speech(u.text[lang], lang);
    if (r.provider.startsWith("mock") && !mockAudioAllowed()) {
      return Response.json({ error: "No cloud voice available right now.", attempts: r.attempts }, { status: 503 });
    }
    return new Response(new Blob([r.audio.bytes], { type: r.audio.mime }), {
      headers: {
        "Content-Type": r.audio.mime,
        "Cache-Control": "private, max-age=3600",
        "X-Host-Provider": r.cached ? "cache" : r.provider,
        "X-Host-Ms": String(r.ms),
      },
    });
  } catch (err) {
    const attempts = err instanceof AllProvidersFailed ? err.attempts : [];
    return Response.json({ error: "Speech unavailable.", attempts }, { status: 503 });
  }
}
