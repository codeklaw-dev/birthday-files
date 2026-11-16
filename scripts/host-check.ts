/**
 * Check every configured AI provider for real:
 *   npm run host:check
 *
 * - lists which keys are configured (never prints them)
 * - Gemini: lists the models your key can use and checks the configured IDs
 * - TTS: speaks an English and a Bangla sample, saves them to .cache/check/
 * - STT: transcribes those samples back and compares (a round-trip test of Bangla)
 * - LLM: asks for one bilingual quip and checks the Bangla is in Bengali script
 * and prints latency for each step.
 */
import "./_env";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Lang } from "../src/lib/game/types";
import { audioDurationMs, detectLang, extractJson } from "../src/lib/host/server/audio-utils";
import { GEMINI_DEFAULTS, geminiListModels } from "../src/lib/host/server/providers/gemini";
import { configuredProviders } from "../src/lib/host/server/router";
import type { Audio, LlmProvider, SttProvider, TtsProvider } from "../src/lib/host/server/types";

const SAMPLES: Record<Lang, string> = {
  en: "Happy birthday, Mez! The investigation begins now.",
  bn: "শুভ জন্মদিন, মেজ! তদন্ত এখনই শুরু।",
};
const OUT = path.join(process.cwd(), ".cache", "check");

const timed = async <T>(fn: () => Promise<T>): Promise<[T | null, number, string | null]> => {
  const t0 = Date.now();
  try {
    return [await fn(), Date.now() - t0, null];
  } catch (e) {
    return [null, Date.now() - t0, (e as Error).message.slice(0, 220)];
  }
};

/** Rough similarity of two strings (0–1), ignoring punctuation and case. */
function similarity(a: string, b: string) {
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter(Boolean);
  const A = norm(a);
  const B = new Set(norm(b));
  return A.length ? A.filter((w) => B.has(w)).length / A.length : 0;
}

async function main() {
  const tts = configuredProviders("tts") as TtsProvider[];
  const llm = configuredProviders("llm") as LlmProvider[];
  const stt = configuredProviders("stt") as SttProvider[];
  console.log("Configured providers (keys found):");
  console.log(`  TTS: ${tts.map((p) => p.id).join(", ") || "none"}`);
  console.log(`  LLM: ${llm.map((p) => p.id).join(", ") || "none"}`);
  console.log(`  STT: ${stt.map((p) => p.id).join(", ") || "none"}`);
  if (!tts.length && !llm.length && !stt.length) {
    console.log("\nNo cloud keys configured; the show will run on pre-recorded clips and mocks. See docs/AI_PROVIDERS.md.");
    return;
  }

  if (process.env.GEMINI_API_KEY) {
    const [models, ms, err] = await timed(() => geminiListModels(AbortSignal.timeout(15000)));
    if (models) {
      const want = {
        tts: process.env.GEMINI_TTS_MODEL || GEMINI_DEFAULTS.tts,
        llm: process.env.GEMINI_LLM_MODEL || GEMINI_DEFAULTS.llm,
      };
      console.log(`\nGemini models visible to this key (${ms} ms): ${models.length}`);
      console.log(`  TTS-capable: ${models.filter((m) => /tts/i.test(m)).join(", ") || "none found"}`);
      for (const [k, id] of Object.entries(want)) console.log(`  ${k} model "${id}": ${models.includes(id) ? "OK" : "NOT FOUND — set GEMINI_" + k.toUpperCase() + "_MODEL"}`);
    } else console.log(`\nGemini model list failed: ${err}`);
  }

  mkdirSync(OUT, { recursive: true });
  const samples: { provider: string; lang: Lang; audio: Audio }[] = [];
  console.log("\nText-to-speech:");
  for (const p of tts) {
    for (const lang of p.langs) {
      const [audio, ms, err] = await timed(() => p.synthesize({ text: SAMPLES[lang], lang, signal: AbortSignal.timeout(30000) }));
      if (!audio) {
        console.log(`  ${p.id} [${lang}] FAILED in ${ms} ms: ${err}`);
        continue;
      }
      const file = path.join(OUT, `${p.id}-${lang}.${audio.mime === "audio/mpeg" ? "mp3" : "wav"}`);
      writeFileSync(file, audio.bytes);
      const dur = audioDurationMs(audio);
      console.log(`  ${p.id} [${lang}] OK ${ms} ms → ${(audio.bytes.length / 1024).toFixed(0)} KB${dur ? `, ${(dur / 1000).toFixed(1)} s of audio` : ""} → ${path.relative(process.cwd(), file)}`);
      samples.push({ provider: p.id, lang, audio });
    }
  }

  if (stt.length && samples.length) {
    console.log("\nRound trip (speech → text), checks the voice is intelligible:");
    for (const s of samples) {
      for (const p of stt) {
        const [r, ms, err] = await timed(() => p.transcribe({ audio: s.audio, signal: AbortSignal.timeout(30000) }));
        if (!r) console.log(`  ${s.provider}[${s.lang}] → ${p.id} FAILED in ${ms} ms: ${err}`);
        else console.log(`  ${s.provider}[${s.lang}] → ${p.id} ${ms} ms: "${r.text}" (lang ${r.lang ?? "?"}, ${(similarity(SAMPLES[s.lang], r.text) * 100).toFixed(0)}% words match)`);
      }
    }
  }

  if (llm.length) {
    console.log("\nCommentary (LLM):");
    for (const p of llm) {
      const [raw, ms, err] = await timed(() =>
        p.complete({
          system: "You are a witty, kind game-show host at a birthday party for Mez.",
          prompt: 'Write one short sarcastic-but-kind quip about a quiz where nobody guessed Mez\'s favourite food. Reply only with JSON: {"en": "...", "bn": "<same joke in Bangla>"}',
          maxTokens: 200,
          signal: AbortSignal.timeout(20000),
        }),
      );
      if (!raw) {
        console.log(`  ${p.id} FAILED in ${ms} ms: ${err}`);
        continue;
      }
      const j = extractJson<{ en?: string; bn?: string }>(raw);
      console.log(`  ${p.id} ${ms} ms`);
      console.log(`    en: ${j?.en ?? "(missing)"}`);
      console.log(`    bn: ${j?.bn ?? "(missing)"} ${j?.bn && detectLang(j.bn) === "bn" ? "✓ Bengali script" : "✗ not Bengali script"}`);
    }
  }
}

void main();
