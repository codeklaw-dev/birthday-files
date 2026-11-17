import type { Bilingual, Lang, RoomState } from "@/lib/game/types";
import { CLIP_KEYS, type ClipKey } from "@/lib/host/script";
import { detectLang, extractJson, speakable } from "./audio-utils";
import { conversationBlock, factsBlock, sceneContext, systemPrompt } from "./context";
import { knowledge } from "./knowledge";
import { routeLlm, type Attempt } from "./router";

/**
 * LLM-written lines: on-demand commentary and push-to-talk replies.
 * The model sees the stored personality, organiser-approved guest facts and
 * the PUBLIC scene (never raw game state). Output is JSON, cleaned for speech;
 * it is only text and can only be spoken through aiDispatch.
 */

export type CommentaryKind = "roast" | "hype" | "reveal" | "leaderboard";

const ASK: Record<CommentaryKind, string> = {
  roast: "Write one playful, sarcastic quip about how the game is going.",
  hype: "Write one line hyping up the room before the next round.",
  reveal: "Write one cheeky reaction to the answer that was just revealed.",
  leaderboard: "Write one teasing line about the current leaderboard (mention at most two players by name).",
};

export interface Written {
  text: Bilingual;
  clip?: ClipKey;
  provider: string;
  ms: number;
  attempts: Attempt[];
}

function parseBilingual(raw: string): (Partial<Bilingual> & { clip?: string }) | null {
  const j = extractJson<{ en?: unknown; bn?: unknown; clip?: unknown }>(raw);
  if (!j) return null;
  return { en: speakable(j.en), bn: speakable(j.bn), clip: typeof j.clip === "string" ? j.clip : undefined };
}

export async function writeCommentary(state: RoomState, kind: CommentaryKind, note = ""): Promise<Written> {
  const k = knowledge();
  const prompt = [
    factsBlock(k.approvedFacts()),
    `SCENE:\n${sceneContext(state)}`,
    note ? `Organiser's note: ${speakable(note, 200)}` : "",
    ASK[kind],
    'Reply only with JSON: {"en": "<English line>", "bn": "<the same joke in Bangla>"}',
  ]
    .filter(Boolean)
    .join("\n\n");
  const r = await routeLlm(systemPrompt(k.personality()), prompt, 300);
  const parsed = parseBilingual(r.value);
  if (!parsed?.en && !parsed?.bn) throw new Error(`${r.provider} returned no usable line`);
  return {
    text: { en: parsed.en || parsed.bn!, bn: parsed.bn || parsed.en! },
    clip: CLIP_KEYS.includes(parsed.clip as ClipKey) ? (parsed.clip as ClipKey) : undefined,
    provider: r.provider,
    ms: r.ms,
    attempts: r.attempts,
  };
}

/** Reply to Mez (push-to-talk), in the language spoken unless overridden. */
export async function writeReply(
  state: RoomState,
  said: string,
  lang: Lang | "auto" | null,
  timeoutMs?: number,
): Promise<Omit<Written, "text" | "clip"> & { text: Partial<Bilingual>; lang: Lang }> {
  const replyLang: Lang = lang === "en" || lang === "bn" ? lang : (detectLang(said) ?? "en");
  const k = knowledge();
  const prompt = [
    factsBlock(k.approvedFacts()),
    `SCENE:\n${sceneContext(state)}`,
    conversationBlock(k.conversation()),
    `Mez is talking to you through the microphone.`,
    `GUEST SAID: ${speakable(said, 400)}`,
    `Answer Mez directly, cheekily but kindly, in ${replyLang === "bn" ? "Bangla" : "English"} (match Mez's tone; Mez may mix languages).`,
    `Reply only with JSON: {"${replyLang}": "<your reply>"}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const r = await routeLlm(systemPrompt(k.personality()), prompt, 300, timeoutMs);
  const parsed = parseBilingual(r.value);
  const line = parsed?.[replyLang] || parsed?.en || parsed?.bn;
  if (!line) throw new Error(`${r.provider} returned no usable reply`);
  return { text: { [replyLang]: line }, lang: replyLang, provider: r.provider, ms: r.ms, attempts: r.attempts };
}
