import type { Lang } from "@/lib/game/types";
import { writeReply } from "@/lib/host/server/commentary";
import { AllProvidersFailed, routeStt } from "@/lib/host/server/router";
import { ensureHostService } from "@/lib/host/server/service";
import { isHostKey, roomStore } from "@/lib/server/room-store";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Push-to-talk: audio from the host laptop's mic → cloud speech-to-text →
 * LLM reply in the guest's language → (optionally) spoken on the TV at once.
 */
export async function POST(req: Request) {
  ensureHostService();
  if (!isHostKey(req.headers.get("x-host-key"))) return Response.json({ error: "Wrong host key." }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("audio");
  if (!(file instanceof Blob) || file.size === 0) return Response.json({ error: "No audio received." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "Recording too long; keep it under a minute." }, { status: 413 });
  const hint = form?.get("lang");
  const langHint = hint === "en" || hint === "bn" ? (hint as Lang) : undefined;
  const autoSpeak = form?.get("speak") !== "0";

  const t0 = Date.now();
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const heard = await routeStt({ bytes, mime: file.type || "audio/webm" }, langHint);
    const transcript = heard.value.text;
    if (!transcript) return Response.json({ ok: false, error: "Didn't catch that. Try again, a bit closer to the mic." }, { status: 422 });
    const reply = await writeReply(roomStore.getState(), transcript, heard.value.lang ?? langHint ?? null);
    if (autoSpeak) roomStore.dispatch({ type: "host/say", text: reply.text, lang: reply.lang, source: "conversation" });
    return Response.json({
      ok: true,
      transcript,
      heardLang: heard.value.lang,
      reply: reply.text,
      replyLang: reply.lang,
      spoken: autoSpeak,
      timings: { sttMs: heard.ms, llmMs: reply.ms, totalMs: Date.now() - t0 },
      providers: { stt: heard.provider, llm: reply.provider },
      attempts: [...heard.attempts, ...reply.attempts],
    });
  } catch (err) {
    const attempts = err instanceof AllProvidersFailed ? err.attempts : [];
    return Response.json({ ok: false, error: (err as Error).message, attempts }, { status: 503 });
  }
}
