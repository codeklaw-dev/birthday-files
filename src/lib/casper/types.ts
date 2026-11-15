import type { Bilingual, Lang } from "@/lib/game/types";

/**
 * Casper adapter contract.
 *
 * The app only ever talks to Casper through this interface. The real
 * implementation (wrapping RACO's existing STT/TTS pipeline) is NOT written
 * yet — we deliberately have not guessed at endpoints or credentials. When the
 * API details are available, add `http-adapter.ts` implementing this interface
 * and switch on `CASPER_MODE` in `index.ts`.
 */
export interface CasperUtterance {
  text: Bilingual;
  lang: Lang | "both";
}

export interface CasperSpeechResult {
  /** True if audio was actually played (always false for the mock). */
  spoken: boolean;
  /** Approximate duration so the UI can pace captions. */
  durationMs: number;
}

export interface CasperTranscript {
  text: string;
  lang: Lang;
}

export interface CasperAdapter {
  readonly id: string;
  /** TTS: have Casper say a line on the display. */
  say(utterance: CasperUtterance): Promise<CasperSpeechResult>;
  /** STT: optional — capture a spoken reply from the room. */
  listen?(opts: { lang: Lang; timeoutMs: number }): Promise<CasperTranscript | null>;
  /** Stop any current speech. */
  stop(): void;
}
