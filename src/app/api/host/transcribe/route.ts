import type { Lang } from "@/lib/game/types";
import { fail, json, requireHost } from "@/lib/host/server/http";
import { AllProvidersFailed, routeStt } from "@/lib/host/server/router";

const MAX_BYTES = 5 * 1024 * 1024;

/** Push-to-talk step 1: speech → text. The organiser can correct the text before a reply is written. */
export async function POST(req: Request) {
  const denied = requireHost(req);
  if (denied) return denied;
  const form = await req.formData().catch(() => null);
  const file = form?.get("audio");
  if (!(file instanceof Blob) || file.size === 0) return fail("No audio received.", 400);
  if (file.size > MAX_BYTES) return fail("Recording too long; keep it under 20 seconds.", 413);
  const hint = form?.get("lang");
  const langHint = hint === "en" || hint === "bn" ? (hint as Lang) : undefined;
  try {
    const r = await routeStt({ bytes: new Uint8Array(await file.arrayBuffer()), mime: file.type || "audio/webm" }, langHint);
    if (!r.value.text) return fail("Didn't catch that. Try again, a bit closer to the mic.", 422);
    return json({ ok: true, transcript: r.value.text, lang: r.value.lang ?? langHint ?? null, provider: r.provider, ms: r.ms, attempts: r.attempts });
  } catch (err) {
    return fail("Speech-to-text is unavailable. Type what Mez said instead.", 503, { attempts: err instanceof AllProvidersFailed ? err.attempts : [] });
  }
}
