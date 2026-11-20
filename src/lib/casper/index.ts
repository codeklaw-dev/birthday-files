import { MockCasperAdapter } from "./mock-adapter";
import { TvVoiceAdapter } from "./tv-voice";
import type { CasperAdapter } from "./types";

export type { CasperAdapter, CasperUtterance, CasperSpeechResult, CasperTranscript } from "./types";

let adapter: CasperAdapter | null = null;

/**
 * Single place where Casper's voice is chosen: in a browser, the TV voice
 * (natural ElevenLabs audio, browser speech as fallback); elsewhere the silent mock.
 */
export function getCasper(): CasperAdapter {
  adapter ??= TvVoiceAdapter.supported() ? new TvVoiceAdapter() : new MockCasperAdapter();
  return adapter;
}

/** The TV voice, where this device has one (for the TV's "Turn on voice" button). */
export function getTvVoice(): TvVoiceAdapter | null {
  const a = getCasper();
  return a instanceof TvVoiceAdapter ? a : null;
}
