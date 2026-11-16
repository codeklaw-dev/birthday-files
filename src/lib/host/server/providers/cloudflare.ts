import { base64, detectLang } from "../audio-utils";
import type { LlmProvider, SttProvider } from "../types";
import { call, env } from "./http";

/**
 * Cloudflare Workers AI over REST (no Worker deployment needed).
 * Free plan: 10,000 neurons/day. Used here for LLM and Whisper STT only:
 * its TTS models (MeloTTS, Deepgram Aura) do not offer Bangla.
 */
const configured = () => !!env("CLOUDFLARE_ACCOUNT_ID") && !!env("CLOUDFLARE_API_TOKEN");
const run = async (model: string, body: unknown, signal: AbortSignal) => {
  const res = await call("cloudflare", `https://api.cloudflare.com/client/v4/accounts/${env("CLOUDFLARE_ACCOUNT_ID")}/ai/run/${model}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env("CLOUDFLARE_API_TOKEN")}` },
    body: JSON.stringify(body),
    signal,
  });
  return (await res.json()) as { result?: Record<string, unknown> };
};

export const cloudflareLlm: LlmProvider = {
  id: "cloudflare",
  configured,
  async complete({ system, prompt, maxTokens, signal }) {
    const r = await run(
      env("CLOUDFLARE_LLM_MODEL") || "@cf/meta/llama-3.1-8b-instruct",
      { messages: [{ role: "system", content: system }, { role: "user", content: prompt }], max_tokens: maxTokens },
      signal,
    );
    const out = r.result?.response;
    return typeof out === "string" ? out : JSON.stringify(out ?? "");
  },
};

export const cloudflareStt: SttProvider = {
  id: "cloudflare",
  configured,
  async transcribe({ audio, langHint, signal }) {
    const r = await run(
      env("CLOUDFLARE_STT_MODEL") || "@cf/openai/whisper-large-v3-turbo",
      { audio: base64(audio.bytes), ...(langHint ? { language: langHint } : {}) },
      signal,
    );
    const text = String(r.result?.text ?? "").trim();
    return { text, lang: detectLang(text) };
  },
};
