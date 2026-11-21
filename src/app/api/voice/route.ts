import type { NextRequest } from "next/server";
import { roomStore } from "@/lib/server/room-store";
import { recorded, speak, voiceConfigured } from "@/lib/server/voice";

/**
 * Audio for Casper's current line. Only the line the room is on right now can
 * be spoken, so the open TV link can't be used to spend ElevenLabs credits on
 * arbitrary text.
 */
export async function GET(req: NextRequest) {
  const lang = req.nextUrl.searchParams.get("lang");
  const text = req.nextUrl.searchParams.get("text") ?? "";
  if (lang !== "en" && lang !== "bn") return Response.json({ error: "Unknown language." }, { status: 400 });
  if (text !== roomStore.getState().hostLine[lang]) return Response.json({ error: "Not the current line." }, { status: 409 });
  // No key: only lines recorded ahead of time can be played; anything else falls back to the browser voice.
  if (!voiceConfigured() && !(await recorded(text))) return Response.json({ error: "Voice not configured." }, { status: 503 });
  try {
    const audio = await speak(text);
    return new Response(new Uint8Array(audio), {
      headers: { "Content-Type": "audio/mpeg", "Content-Length": String(audio.length), "Cache-Control": "private, max-age=3600" },
    });
  } catch (err) {
    console.error("voice:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Voice unavailable." }, { status: 502 });
  }
}
