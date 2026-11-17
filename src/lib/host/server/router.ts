import type { Lang } from "@/lib/game/types";
import { azureTts } from "./providers/azure";
import { cloudflareLlm, cloudflareStt } from "./providers/cloudflare";
import { geminiLlm, geminiStt, geminiTts } from "./providers/gemini";
import { env } from "./providers/http";
import { englishOnlyTts, failingLlm, failingStt, failingTts, mockLlm, mockStt, mockTts, slowTts } from "./providers/mock";
import { groqLlm, groqStt } from "./providers/openai-compatible";
import type { LlmProvider, ProviderKind, SttProvider, TtsProvider } from "./types";

/**
 * Provider chains with ordered failover.
 *
 * Each chain is tried in order (HOST_TTS_CHAIN etc.). A provider is skipped
 * if it has no credentials, can't speak the language, or its circuit is
 * open (3 failures in a row → rested for 60 s). Every attempt has a timeout.
 * The mock is always last, so the show never stops for want of a provider.
 */

const REGISTRY = {
  tts: { gemini: geminiTts, azure: azureTts, mock: mockTts, "mock-fail": failingTts, "mock-slow": slowTts, "mock-en": englishOnlyTts },
  llm: { gemini: geminiLlm, groq: groqLlm, cloudflare: cloudflareLlm, mock: mockLlm, "mock-fail": failingLlm },
  stt: { groq: groqStt, gemini: geminiStt, cloudflare: cloudflareStt, mock: mockStt, "mock-fail": failingStt },
} as const;

const DEFAULT_CHAIN: Record<ProviderKind, string> = {
  tts: "gemini,azure,mock",
  llm: "gemini,groq,cloudflare,mock",
  stt: "groq,gemini,cloudflare,mock",
};

type AnyProvider = TtsProvider | LlmProvider | SttProvider;

export interface ProviderStats {
  calls: number;
  failures: number;
  consecutiveFailures: number;
  openUntil: number;
  lastMs: number | null;
  avgMs: number | null;
  lastError: string | null;
  lastOkAt: number | null;
}

const g = globalThis as unknown as { __hostStats?: Map<string, ProviderStats> };
const stats = (g.__hostStats ??= new Map());
const statFor = (kind: ProviderKind, id: string): ProviderStats => {
  const k = `${kind}:${id}`;
  if (!stats.has(k)) {
    stats.set(k, { calls: 0, failures: 0, consecutiveFailures: 0, openUntil: 0, lastMs: null, avgMs: null, lastError: null, lastOkAt: null });
  }
  return stats.get(k)!;
};

/** Every registered provider of a kind with credentials, mocks excluded (for scripts). */
export function configuredProviders<K extends ProviderKind>(kind: K): AnyProvider[] {
  return Object.values(REGISTRY[kind] as Record<string, AnyProvider>).filter((p) => !p.id.startsWith("mock") && p.configured());
}

export function resetRouterStats() {
  stats.clear();
}

export function chain<K extends ProviderKind>(kind: K): AnyProvider[] {
  const names = (env(`HOST_${kind.toUpperCase()}_CHAIN`) || DEFAULT_CHAIN[kind]).split(",").map((s) => s.trim()).filter(Boolean);
  const reg = REGISTRY[kind] as Record<string, AnyProvider>;
  const list = names.map((n) => reg[n]).filter(Boolean);
  if (env("HOST_NO_MOCK") === "1") return list.filter((p) => !p.id.startsWith("mock") || p.id === "mock-fail" || p.id === "mock-slow");
  if (!list.some((p) => p.id === "mock")) list.push(reg.mock);
  return list;
}

export interface Attempt {
  provider: string;
  ok: boolean;
  ms: number;
  error?: string;
  skipped?: string;
}

export interface Routed<T> {
  value: T;
  provider: string;
  ms: number;
  attempts: Attempt[];
}

/**
 * Mock TTS is a beep, not speech. Serve it only when explicitly allowed (tests,
 * demos); otherwise the TV should fall back to a recorded clip or captions.
 */
export const mockAudioAllowed = () => env("HOST_ALLOW_MOCK_AUDIO") === "1";

export class AllProvidersFailed extends Error {
  constructor(readonly attempts: Attempt[]) {
    super(`all providers failed: ${attempts.map((a) => `${a.provider} (${a.error ?? a.skipped})`).join("; ")}`);
  }
}

const BREAKER_FAILS = 3;
const BREAKER_MS = 60_000;

async function route<P extends AnyProvider, T>(
  kind: ProviderKind,
  providers: P[],
  run: (p: P, signal: AbortSignal) => Promise<T>,
  opts: { timeoutMs: number; accepts?: (p: P) => string | null },
): Promise<Routed<T>> {
  const attempts: Attempt[] = [];
  const t0 = Date.now();
  for (const p of providers) {
    const s = statFor(kind, p.id);
    const skip = !p.configured() ? "not configured" : opts.accepts?.(p) ?? (s.openUntil > Date.now() ? "resting after repeated failures" : null);
    if (skip) {
      attempts.push({ provider: p.id, ok: false, ms: 0, skipped: skip });
      continue;
    }
    const started = Date.now();
    const signal = AbortSignal.timeout(opts.timeoutMs);
    try {
      const value = await run(p, signal);
      const ms = Date.now() - started;
      s.calls++;
      s.consecutiveFailures = 0;
      s.lastMs = ms;
      s.avgMs = s.avgMs === null ? ms : Math.round(s.avgMs * 0.7 + ms * 0.3);
      s.lastOkAt = Date.now();
      attempts.push({ provider: p.id, ok: true, ms });
      return { value, provider: p.id, ms: Date.now() - t0, attempts };
    } catch (err) {
      const ms = Date.now() - started;
      const message = signal.aborted ? `timed out after ${opts.timeoutMs} ms` : (err as Error).message;
      s.calls++;
      s.failures++;
      s.consecutiveFailures++;
      s.lastError = message.slice(0, 300);
      if (s.consecutiveFailures >= BREAKER_FAILS) s.openUntil = Date.now() + BREAKER_MS;
      attempts.push({ provider: p.id, ok: false, ms, error: message.slice(0, 300) });
      console.warn(`[host] ${kind}/${p.id} failed in ${ms} ms: ${message.slice(0, 200)}`);
    }
  }
  throw new AllProvidersFailed(attempts);
}

export function routeTts(text: string, lang: Lang, timeoutMs = Number(env("HOST_TTS_TIMEOUT_MS")) || 9000) {
  return route("tts", chain("tts") as TtsProvider[], (p, signal) => p.synthesize({ text, lang, signal }), {
    timeoutMs,
    accepts: (p) => (p.langs.includes(lang) ? null : `no ${lang} voice`),
  });
}

export function routeLlm(system: string, prompt: string, maxTokens = 400, timeoutMs = Number(env("HOST_LLM_TIMEOUT_MS")) || 8000) {
  return route("llm", chain("llm") as LlmProvider[], (p, signal) => p.complete({ system, prompt, maxTokens, signal }), { timeoutMs });
}

export function routeStt(audio: Parameters<SttProvider["transcribe"]>[0]["audio"], langHint?: Lang, timeoutMs = Number(env("HOST_STT_TIMEOUT_MS")) || 10000) {
  return route("stt", chain("stt") as SttProvider[], (p, signal) => p.transcribe({ audio, langHint, signal }), { timeoutMs });
}

export function providerStatus() {
  const now = Date.now();
  return (["tts", "llm", "stt"] as const).map((kind) => ({
    kind,
    providers: chain(kind).map((p) => {
      const s = statFor(kind, p.id);
      return {
        id: p.id,
        configured: p.configured(),
        langs: "langs" in p ? p.langs : undefined,
        resting: s.openUntil > now,
        ...s,
      };
    }),
  }));
}
