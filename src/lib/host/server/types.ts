import type { Lang } from "@/lib/game/types";

/**
 * Provider contracts. Every cloud service sits behind one of these, so the
 * show never depends on a single vendor. All implementations run on the
 * server; keys never reach a browser.
 */

export interface Audio {
  bytes: Uint8Array<ArrayBuffer>;
  mime: string;
  /** Which model actually produced it, when a provider rotates between models. */
  model?: string;
}

export interface TtsProvider {
  id: string;
  langs: readonly Lang[];
  configured(): boolean;
  synthesize(req: { text: string; lang: Lang; signal: AbortSignal }): Promise<Audio>;
}

export interface LlmProvider {
  id: string;
  configured(): boolean;
  complete(req: { system: string; prompt: string; maxTokens: number; signal: AbortSignal }): Promise<string>;
}

export interface SttProvider {
  id: string;
  configured(): boolean;
  transcribe(req: { audio: Audio; langHint?: Lang; signal: AbortSignal }): Promise<{ text: string; lang: Lang | null }>;
}

export type ProviderKind = "tts" | "llm" | "stt";

export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    message: string,
    readonly status?: number,
    /** Raw error body from the API (never contains our key). */
    readonly body?: string,
  ) {
    super(`${provider}: ${message}`);
  }
}
