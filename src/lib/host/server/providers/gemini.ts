import { base64, detectLang, extractJson, fromBase64, pcmRate, pcmToWav } from "../audio-utils";
import type { LlmProvider, SttProvider, TtsProvider } from "../types";
import { ProviderError } from "../types";
import { call, env } from "./http";

/**
 * Google Gemini API (Google AI Studio key — free tier, no card required).
 *
 * Uses the documented generateContent REST endpoint. For TTS the response is
 * base64 raw 16-bit PCM (mime like "audio/L16;codec=pcm;rate=24000"), which
 * we wrap in a WAV header. Model IDs change often, so all are env-configurable;
 * run `npm run host:check` to list what your key can actually use.
 */
const BASE = "https://generativelanguage.googleapis.com/v1beta";
const key = () => env("GEMINI_API_KEY");
export const GEMINI_DEFAULTS = {
  tts: "gemini-3.8-flash-lite-tts",
  llm: "gemini-3.5-flash-lite",
  voice: "Kore",
  /**
   * Optional style prompt put before the text. Off by default: in testing,
   * gemini-3.8-flash-lite-tts read the instruction aloud instead of following it.
   */
  style: "",
};

interface GenerateResponse {
  candidates?: { content?: { parts?: { text?: string; inlineData?: { mimeType?: string; data?: string } }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

async function generate(model: string, body: unknown, signal: AbortSignal): Promise<GenerateResponse> {
  const res = await call("gemini", `${BASE}/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key() },
    body: JSON.stringify(body),
    signal,
  });
  return (await res.json()) as GenerateResponse;
}

function textOf(r: GenerateResponse): string {
  if (r.promptFeedback?.blockReason) throw new ProviderError("gemini", `blocked (${r.promptFeedback.blockReason})`);
  const text = r.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new ProviderError("gemini", `empty reply (${r.candidates?.[0]?.finishReason ?? "no candidates"})`);
  return text;
}

export const geminiTts: TtsProvider = {
  id: "gemini",
  langs: ["en", "bn"],
  configured: () => !!key(),
  async synthesize({ text, signal }) {
    const style = env("GEMINI_TTS_STYLE") || GEMINI_DEFAULTS.style;
    const r = await generate(
      env("GEMINI_TTS_MODEL") || GEMINI_DEFAULTS.tts,
      {
        contents: [{ parts: [{ text: style ? `${style} ${text}` : text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: env("GEMINI_TTS_VOICE") || GEMINI_DEFAULTS.voice } } },
        },
      },
      signal,
    );
    const part = r.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    // Reported in the wild: HTTP 200 with no audio. Treat as a failure so the router fails over.
    if (!part?.inlineData?.data) throw new ProviderError("gemini", "response contained no audio");
    const mime = part.inlineData.mimeType ?? "audio/L16;rate=24000";
    const bytes = fromBase64(part.inlineData.data);
    if (/wav|mpeg|mp3|ogg/i.test(mime)) return { bytes, mime: mime.split(";")[0] };
    return pcmToWav(bytes, pcmRate(mime));
  },
};

export const geminiLlm: LlmProvider = {
  id: "gemini",
  configured: () => !!key(),
  async complete({ system, prompt, maxTokens, signal }) {
    const r = await generate(
      env("GEMINI_LLM_MODEL") || GEMINI_DEFAULTS.llm,
      {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", maxOutputTokens: maxTokens, temperature: 1 },
      },
      signal,
    );
    return textOf(r);
  },
};

export const geminiStt: SttProvider = {
  id: "gemini",
  configured: () => !!key(),
  async transcribe({ audio, signal }) {
    const r = await generate(
      env("GEMINI_STT_MODEL") || env("GEMINI_LLM_MODEL") || GEMINI_DEFAULTS.llm,
      {
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: audio.mime.split(";")[0], data: base64(audio.bytes) } },
              {
                text:
                  'Transcribe this short clip exactly as spoken. The speaker uses English, Bangla, or both. ' +
                  'Write Bangla in Bengali script. Reply only with JSON: {"text": string, "lang": "en" | "bn"}.',
              },
            ],
          },
        ],
        generationConfig: { responseMimeType: "application/json", temperature: 0 },
      },
      signal,
    );
    const raw = textOf(r);
    const parsed = extractJson<{ text?: string; lang?: string }>(raw);
    const text = (parsed?.text ?? raw).trim();
    const lang = parsed?.lang === "bn" || parsed?.lang === "en" ? parsed.lang : detectLang(text);
    return { text, lang };
  },
};

/** For `npm run host:check`: which models does this key see? */
export async function geminiListModels(signal: AbortSignal): Promise<string[]> {
  const res = await call("gemini", `${BASE}/models?pageSize=200`, { headers: { "x-goog-api-key": key() }, signal });
  const body = (await res.json()) as { models?: { name: string }[] };
  return (body.models ?? []).map((m) => m.name.replace(/^models\//, ""));
}
