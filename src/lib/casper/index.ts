import { MockCasperAdapter } from "./mock-adapter";
import type { CasperAdapter } from "./types";

export type { CasperAdapter, CasperUtterance, CasperSpeechResult, CasperTranscript } from "./types";

let adapter: CasperAdapter | null = null;

/** Single place where the real adapter will be swapped in. */
export function getCasper(): CasperAdapter {
  adapter ??= new MockCasperAdapter();
  return adapter;
}
