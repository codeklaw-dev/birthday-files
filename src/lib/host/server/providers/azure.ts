import type { Lang } from "@/lib/game/types";
import type { TtsProvider } from "../types";
import { call, env } from "./http";

/**
 * Azure AI Speech neural TTS (REST). Best Bangladeshi Bangla voices
 * (bn-BD-NabanitaNeural, bn-BD-PradeepNeural). Free F0 tier exists, but an
 * Azure account needs a card at sign-up — only enable with approval.
 */
const VOICES: Record<Lang, () => string> = {
  en: () => env("AZURE_VOICE_EN") || "en-GB-RyanNeural",
  bn: () => env("AZURE_VOICE_BN") || "bn-BD-PradeepNeural",
};

const xml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export function azureSsml(text: string, lang: Lang): string {
  const voice = VOICES[lang]();
  const locale = voice.split("-").slice(0, 2).join("-");
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${locale}"><voice name="${xml(voice)}">${xml(text)}</voice></speak>`;
}

export const azureTts: TtsProvider = {
  id: "azure",
  langs: ["en", "bn"],
  configured: () => !!env("AZURE_SPEECH_KEY") && !!env("AZURE_SPEECH_REGION"),
  async synthesize({ text, lang, signal }) {
    const res = await call("azure", `https://${env("AZURE_SPEECH_REGION")}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": env("AZURE_SPEECH_KEY"),
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
        "User-Agent": "birthday-files",
      },
      body: azureSsml(text, lang),
      signal,
    });
    return { bytes: new Uint8Array(await res.arrayBuffer()), mime: "audio/mpeg" };
  },
};
