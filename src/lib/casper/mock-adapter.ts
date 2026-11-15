import type { CasperAdapter, CasperSpeechResult, CasperUtterance } from "./types";

/**
 * Silent stand-in for Casper. It produces no audio: the display shows the
 * line as captions and this adapter just reports a plausible duration.
 */
export class MockCasperAdapter implements CasperAdapter {
  readonly id = "mock";

  async say(utterance: CasperUtterance): Promise<CasperSpeechResult> {
    const text =
      utterance.lang === "both"
        ? `${utterance.text.en} ${utterance.text.bn}`
        : utterance.text[utterance.lang];
    return { spoken: false, durationMs: Math.max(1500, text.length * 60) };
  }

  stop(): void {}
}
