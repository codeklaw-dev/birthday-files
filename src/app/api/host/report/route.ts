import { recordPlayback, type PlaybackReport } from "@/lib/host/server/service";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";

const VIA = new Set(["clip", "live", "fallback-clip", "browser", "captions"]);

/** The TV reports how each line was played (for the host's latency/failover panel). */
export async function POST(req: Request) {
  if (!rateLimit(`${clientIp(req)}:report`, 120, 60_000)) return new Response(null, { status: 429 });
  const b = (await req.json().catch(() => null)) as Partial<PlaybackReport> | null;
  if (!b || typeof b.utteranceId !== "string" || (b.lang !== "en" && b.lang !== "bn") || !VIA.has(String(b.via))) {
    return new Response(null, { status: 400 });
  }
  recordPlayback({
    utteranceId: b.utteranceId.slice(0, 16),
    lang: b.lang,
    via: b.via as PlaybackReport["via"],
    provider: typeof b.provider === "string" ? b.provider.slice(0, 24) : undefined,
    latencyMs: Math.max(0, Math.min(120_000, Number(b.latencyMs) || 0)),
    error: typeof b.error === "string" ? b.error.slice(0, 160) : undefined,
    at: Date.now(),
  });
  return new Response(null, { status: 204 });
}
