import { BrowserVoiceAdapter } from "./browser-adapter";
import { MockCasperAdapter } from "./mock-adapter";
import type { CasperAdapter } from "./types";

export type { CasperAdapter, CasperUtterance, CasperSpeechResult, CasperTranscript } from "./types";

let adapter: CasperAdapter | null = null;

/**
 * Single place where Casper's voice is chosen: the browser's built-in speech
 * where the device supports it (free), otherwise the silent mock.
 */
export function getCasper(): CasperAdapter {
  adapter ??= BrowserVoiceAdapter.supported() ? new BrowserVoiceAdapter() : new MockCasperAdapter();
  return adapter;
}

/** The browser voice, if that is what this device uses (for the TV's voice toggle). */
export function getBrowserVoice(): BrowserVoiceAdapter | null {
  const a = getCasper();
  return a instanceof BrowserVoiceAdapter ? a : null;
}
