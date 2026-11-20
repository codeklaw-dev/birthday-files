import type { Lang } from "@/lib/game/types";
import type { CasperAdapter, CasperSpeechResult, CasperUtterance } from "./types";

/**
 * Casper's voice using the browser's built-in speech synthesis: free, no
 * account or API key, runs on the TV laptop. Voices depend on the device;
 * Bengali is spoken only where the laptop has a Bengali voice installed.
 *
 * Browsers only allow speech after someone interacts with the page, so the
 * TV calls `enable()` from a click ("Turn on voice") before anything is said.
 */
export class BrowserVoiceAdapter implements CasperAdapter {
  readonly id = "browser";
  private enabled = false;

  static supported(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /** Call from a click: unlocks speech for this page. */
  enable(): void {
    this.enabled = true;
    const warmUp = new SpeechSynthesisUtterance(" ");
    warmUp.volume = 0;
    window.speechSynthesis.speak(warmUp);
  }

  disable(): void {
    this.enabled = false;
    window.speechSynthesis.cancel();
  }

  /** True when the device has a voice for this language. */
  hasVoice(lang: Lang): boolean {
    return this.voiceFor(lang) !== null;
  }

  private voiceFor(lang: Lang): SpeechSynthesisVoice | null {
    const prefix = lang === "en" ? "en" : "bn";
    const matches = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(prefix));
    // Prefer the more natural-sounding voices most systems ship.
    const nicer = matches.find((v) => /natural|neural|premium|enhanced|google|samantha|daniel|serena|karen|moira/i.test(v.name));
    return nicer ?? matches[0] ?? null;
  }

  async say(utterance: CasperUtterance): Promise<CasperSpeechResult> {
    const langs: Lang[] = utterance.lang === "both" ? ["en", "bn"] : [utterance.lang];
    const text = langs.map((l) => utterance.text[l]).join(" ");
    const durationMs = Math.max(1500, text.length * 65);
    if (!this.enabled) return { spoken: false, durationMs };

    const synth = window.speechSynthesis;
    synth.cancel();
    let spoken = false;
    for (const lang of langs) {
      const voice = this.voiceFor(lang);
      // Without a Bengali voice the browser would read Bengali text badly in English; skip it.
      if (lang === "bn" && !voice) continue;
      const line = new SpeechSynthesisUtterance(utterance.text[lang]);
      if (voice) {
        line.voice = voice;
        line.lang = voice.lang;
      } else {
        line.lang = "en-GB";
      }
      line.rate = 1;
      line.pitch = 1.1;
      synth.speak(line);
      spoken = true;
    }
    return { spoken, durationMs };
  }

  stop(): void {
    if (BrowserVoiceAdapter.supported()) window.speechSynthesis.cancel();
  }
}
