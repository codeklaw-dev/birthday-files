import type { Lang } from "@/lib/game/types";
import { aiDispatch } from "@/lib/host/server/ai-actions";
import { writeReply } from "@/lib/host/server/commentary";
import { fail, json, requireHost } from "@/lib/host/server/http";
import { knowledge } from "@/lib/host/server/knowledge";
import { AllProvidersFailed } from "@/lib/host/server/router";
import { ensureHostService } from "@/lib/host/server/service";
import { roomStore } from "@/lib/server/room-store";

const REPLY_TIMEOUT_MS = Number(process.env.HOST_REPLY_TIMEOUT_MS) || 9000;

/**
 * Push-to-talk step 2: (corrected) transcript → a reply in the host's voice,
 * spoken on the TV only. If the AI fails or times out, a prepared narration
 * line plays instead. The only thing this can do to the show is speak.
 */
export async function POST(req: Request) {
  ensureHostService();
  const denied = requireHost(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const transcript = typeof body?.transcript === "string" ? body.transcript.replace(/\s+/g, " ").trim().slice(0, 400) : "";
  if (transcript.length < 2) return fail("Nothing to reply to.", 400);
  const lang: Lang | "auto" = body?.lang === "en" || body?.lang === "bn" ? body.lang : "auto";
  const speak = body?.speak !== false;
  if (speak && body?.thinking) aiDispatch({ type: "host/clip", clip: "ptt_thinking" });

  const t0 = Date.now();
  try {
    const reply = await writeReply(roomStore.getState(), transcript, lang, REPLY_TIMEOUT_MS);
    knowledge().remember({ at: Date.now(), heard: transcript, lang: reply.lang, reply: reply.text[reply.lang] ?? "" });
    if (speak) aiDispatch({ type: "host/say", text: reply.text, lang: reply.lang, source: "conversation" });
    return json({ ok: true, reply: reply.text, lang: reply.lang, spoken: speak, provider: reply.provider, ms: Date.now() - t0, attempts: reply.attempts });
  } catch (err) {
    if (speak) aiDispatch({ type: "host/clip", clip: "ptt_fallback" });
    return fail("The AI didn't answer in time, so a prepared line played instead.", 503, {
      fallback: speak,
      ms: Date.now() - t0,
      attempts: err instanceof AllProvidersFailed ? err.attempts : [],
    });
  }
}
