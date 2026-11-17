import type { Lang } from "@/lib/game/types";
import { CLIPS, QUIP_KEYS } from "@/lib/host/script";
import { detectLang, pcmToWav } from "../audio-utils";
import type { Audio, LlmProvider, SttProvider, TtsProvider } from "../types";

/**
 * Offline stand-ins. They let the whole show run, and the failover paths be
 * tested, with no accounts or keys. The TTS mock produces a short
 * "robot chirp" WAV (not speech) so the audio pipeline really plays something.
 */

export function chirp(text: string, sampleRate = 16000): Audio {
  const words = text.split(/\s+/).filter(Boolean).slice(0, 40);
  const toneMs = 90;
  const gapMs = 35;
  const samplesPer = Math.round((sampleRate * (toneMs + gapMs)) / 1000);
  const pcm = new Int16Array(samplesPer * Math.max(1, words.length));
  words.forEach((w, i) => {
    let h = 0;
    for (const c of w) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const freq = 380 + (h % 7) * 70;
    const toneSamples = Math.round((sampleRate * toneMs) / 1000);
    for (let s = 0; s < toneSamples; s++) {
      const env = Math.min(1, s / 80, (toneSamples - s) / 80);
      pcm[i * samplesPer + s] = Math.round(Math.sin((2 * Math.PI * freq * s) / sampleRate) * 6000 * env);
    }
  });
  return pcmToWav(new Uint8Array(pcm.buffer), sampleRate);
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      reject(signal.reason ?? new Error("aborted"));
    });
  });

export const mockTts: TtsProvider = {
  id: "mock",
  langs: ["en", "bn"],
  configured: () => true,
  async synthesize({ text }) {
    return chirp(text);
  },
};

/** Always fails — for exercising failover (HOST_TTS_CHAIN=mock-fail,mock). */
export const failingTts: TtsProvider = {
  id: "mock-fail",
  langs: ["en", "bn"],
  configured: () => true,
  async synthesize() {
    throw new Error("simulated outage");
  },
};

/** Answers after 15 s — for exercising timeouts. */
export const slowTts: TtsProvider = {
  id: "mock-slow",
  langs: ["en", "bn"],
  configured: () => true,
  async synthesize({ text, signal }) {
    await sleep(15_000, signal);
    return chirp(text);
  },
};

/** English-only — for exercising language routing. */
export const englishOnlyTts: TtsProvider = { ...mockTts, id: "mock-en", langs: ["en"] as Lang[] };

let quipTurn = 0;
export const mockLlm: LlmProvider = {
  id: "mock",
  configured: () => true,
  async complete({ prompt }) {
    // Conversation prompts carry the guest's words; echo the language back.
    const said = /GUEST SAID: (.*)/.exec(prompt)?.[1] ?? "";
    if (said) {
      const bn = detectLang(said) === "bn";
      return JSON.stringify(
        bn
          ? { bn: "দারুণ বলেছেন! আমি একটা মক এআই, তাই এর বেশি বুদ্ধি আজ নেই।", en: "" }
          : { en: "Great point! I'm the mock AI, so that's all the wit I have today.", bn: "" },
      );
    }
    const key = QUIP_KEYS[quipTurn++ % QUIP_KEYS.length];
    return JSON.stringify({ ...CLIPS[key], clip: key });
  },
};

export const mockStt: SttProvider = {
  id: "mock",
  configured: () => true,
  async transcribe({ langHint }) {
    return langHint === "bn"
      ? { text: "শুভ জন্মদিন মেজ! (মক ট্রান্সক্রিপ্ট)", lang: "bn" }
      : { text: "Happy birthday Mez! (mock transcript)", lang: "en" };
  },
};

/** Always fail — to rehearse the show with cloud services down (HOST_LLM_CHAIN / HOST_STT_CHAIN=mock-fail). */
export const failingLlm: LlmProvider = {
  id: "mock-fail",
  configured: () => true,
  async complete() {
    throw new Error("simulated outage");
  },
};
export const failingStt: SttProvider = {
  id: "mock-fail",
  configured: () => true,
  async transcribe() {
    throw new Error("simulated outage");
  },
};
