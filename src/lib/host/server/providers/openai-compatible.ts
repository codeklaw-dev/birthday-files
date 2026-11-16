import type { Lang } from "@/lib/game/types";
import { detectLang } from "../audio-utils";
import type { LlmProvider, SttProvider } from "../types";
import { call, env } from "./http";

/**
 * Any OpenAI-compatible API (chat completions + audio transcriptions).
 * Preset: Groq — free tier with no card; Whisper large-v3(-turbo) handles
 * Bengali. Groq's own TTS is English/Arabic only, so it is not used for TTS.
 */
interface Preset {
  id: string;
  baseUrl: () => string;
  key: () => string;
  llmModel: () => string;
  sttModel: () => string;
}

export const GROQ: Preset = {
  id: "groq",
  baseUrl: () => env("GROQ_BASE_URL") || "https://api.groq.com/openai/v1",
  key: () => env("GROQ_API_KEY"),
  // Checked 16 Nov 2026 against a free key: llama-3.3-70b-versatile was not offered;
  // qwen3.8-27b wrote the most natural Bangla (~0.9 s). Alternative: openai/gpt-oss-120b.
  llmModel: () => env("GROQ_LLM_MODEL") || "qwen/qwen3.8-27b",
  sttModel: () => env("GROQ_STT_MODEL") || "whisper-large-v3-turbo",
};

export function openAiLlm(p: Preset): LlmProvider {
  return {
    id: p.id,
    configured: () => !!p.key(),
    async complete({ system, prompt, maxTokens, signal }) {
      const res = await call(p.id, `${p.baseUrl()}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.key()}` },
        body: JSON.stringify({
          model: p.llmModel(),
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
          max_tokens: maxTokens,
          temperature: 1,
        }),
        signal,
      });
      const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return body.choices?.[0]?.message?.content ?? "";
    },
  };
}

const WHISPER_LANG: Record<string, Lang> = { en: "en", english: "en", bn: "bn", bengali: "bn", bangla: "bn" };

/** Indic letters that are not Bangla (Devanagari, Gujarati, Gurmukhi, Odia, Tamil…). */
const OTHER_INDIC = /[\u0900-\u097F\u0A00-\u0DFF]/;

export function openAiStt(p: Preset): SttProvider {
  const once = async ({ audio, langHint, signal }: Parameters<SttProvider["transcribe"]>[0]) => {
      const form = new FormData();
      const ext = audio.mime.includes("ogg") ? "ogg" : audio.mime.includes("mp4") ? "m4a" : audio.mime.includes("wav") ? "wav" : "webm";
      form.append("file", new Blob([audio.bytes], { type: audio.mime }), `clip.${ext}`);
      form.append("model", p.sttModel());
      form.append("response_format", "verbose_json");
      if (langHint) form.append("language", langHint);
      const res = await call(p.id, `${p.baseUrl()}/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${p.key()}` },
        body: form,
        signal,
      });
      const body = (await res.json()) as { text?: string; language?: string };
      const text = (body.text ?? "").trim();
      return { text, lang: WHISPER_LANG[(body.language ?? "").toLowerCase()] ?? detectLang(text) };
  };
  return {
    id: p.id,
    configured: () => !!p.key(),
    async transcribe(req) {
      const first = await once(req);
      // Tested: Whisper auto-detect wrote spoken Bangla in Gujarati script. Our guests
      // speak English or Bangla, so any other Indic script means "retry as Bangla".
      if (!req.langHint && OTHER_INDIC.test(first.text)) return once({ ...req, langHint: "bn" });
      return first;
    },
  };
}

export const groqLlm = openAiLlm(GROQ);
export const groqStt = openAiStt(GROQ);
