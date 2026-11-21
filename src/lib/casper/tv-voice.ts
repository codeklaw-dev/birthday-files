import type { Lang } from "@/lib/game/types";
import { BrowserVoiceAdapter } from "./browser-adapter";
import type { CasperAdapter, CasperSpeechResult, CasperUtterance } from "./types";

/**
 * Casper's voice on the TV: natural ElevenLabs audio from /api/voice, with the
 * browser's built-in voice as the fallback for any line the server can't
 * voice (no key configured, quota used up, network trouble).
 *
 * Browsers only allow sound after a click, so the TV calls `enable()` from its
 * "Turn on voice" button before anything plays.
 */
export class TvVoiceAdapter implements CasperAdapter {
  readonly id = "tv";
  private enabled = false;
  private audio: HTMLAudioElement | null = null;
  private browser = BrowserVoiceAdapter.supported() ? new BrowserVoiceAdapter() : null;
  /** Bumped on every new line or stop, so an older line stops queuing audio. */
  private generation = 0;

  static supported(): boolean {
    return typeof window !== "undefined" && typeof Audio !== "undefined";
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /** True while Casper is talking, so voice mode doesn't listen to itself. */
  get isSpeaking(): boolean {
    const clip = !!this.audio && !this.audio.paused && !this.audio.ended && this.audio.currentTime > 0.05;
    return clip || (typeof window !== "undefined" && "speechSynthesis" in window && window.speechSynthesis.speaking);
  }

  /** Call from a click: unlocks audio (and the fallback voice) for this page. */
  enable(): void {
    this.enabled = true;
    this.audio ??= new Audio();
    // A silent play inside the click counts as the user's permission for later sound.
    this.audio.src = "data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQxAADB8AhSmxhIIEVCSiJrDCQBTcu3UrAIwUdkRgQbFAZC1CQEwTJ9mjRvBA4UOLD8nKVOWfh+UlK3z/177OXrfOdKl7pyn3Xf//WreyTRUoAWgBgkOAGbZHBgG1OF6zM82DWbZaUmMBptgQhGjsyYqc9ae9XFz280948NMBWInljyzsNRFLPWdnZGWrddDsjK1unuSrVN9jJsK8KuQtQCtMBjCEtImISdNKJOopIpBFpNSMbIHCSRpRR5iakjTiyzLhchUUBwCgyKiweBv/7UsQbg8isVNoMPMjAAAA0gAAABEVFGmgqK////9bP/6XCykxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
    void this.audio.play().catch(() => {});
    this.browser?.enable();
  }

  disable(): void {
    this.enabled = false;
    this.stop();
  }

  async say(utterance: CasperUtterance): Promise<CasperSpeechResult> {
    const langs: Lang[] = utterance.lang === "both" ? ["en", "bn"] : [utterance.lang];
    const durationMs = Math.max(1500, langs.map((l) => utterance.text[l]).join(" ").length * 65);
    this.stop();
    if (!this.enabled) return { spoken: false, durationMs };
    const gen = this.generation;

    // Ask for every language up front so the second one is ready when the first ends.
    const clips = langs.map((lang) => this.fetchClip(lang, utterance.text[lang]));
    let spoken = false;
    for (let i = 0; i < langs.length; i++) {
      const clip = await clips[i];
      if (gen !== this.generation) return { spoken, durationMs };
      if (clip) {
        await this.play(clip, gen);
        URL.revokeObjectURL(clip);
        spoken = true;
      } else if (this.browser) {
        // Fallback: the browser voice (it skips Bengali where no Bengali voice is installed).
        const res = await this.browser.say({ text: utterance.text, lang: langs[i] });
        spoken ||= res.spoken;
      }
    }
    return { spoken, durationMs };
  }

  stop(): void {
    this.generation++;
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute("src");
    }
    this.browser?.stop();
  }

  private async fetchClip(lang: Lang, text: string): Promise<string | null> {
    try {
      const res = await fetch(`/api/voice?lang=${lang}&text=${encodeURIComponent(text)}`);
      if (!res.ok) return null;
      return URL.createObjectURL(await res.blob());
    } catch {
      return null;
    }
  }

  private play(src: string, gen: number): Promise<void> {
    return new Promise((resolve) => {
      if (gen !== this.generation || !this.audio) return resolve();
      const audio = this.audio;
      const done = () => {
        audio.removeEventListener("ended", done);
        audio.removeEventListener("error", done);
        audio.removeEventListener("pause", done);
        resolve();
      };
      audio.addEventListener("ended", done);
      audio.addEventListener("error", done);
      audio.addEventListener("pause", done);
      audio.src = src;
      void audio.play().catch(done);
    });
  }
}
