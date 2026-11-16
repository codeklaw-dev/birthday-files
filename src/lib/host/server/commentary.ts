import type { Bilingual, Lang, RoomState } from "@/lib/game/types";
import { rankPlayers } from "@/lib/game/engine";
import { CLIP_KEYS, type ClipKey } from "@/lib/host/script";
import { PERSONA } from "@/lib/host/persona";
import { EVENT } from "@/lib/event";
import { extractJson, speakable } from "./audio-utils";
import { routeLlm, type Attempt } from "./router";

/**
 * LLM-written lines: on-demand commentary and push-to-talk replies.
 * Output is JSON {en, bn}, cleaned for speech. The host reviews commentary
 * before it is spoken unless auto-quips are switched on.
 */

const RULES = [
  `You are ${PERSONA.name.en} (${PERSONA.name.bn}), ${PERSONA.style}.`,
  `You host "${EVENT.title}: ${EVENT.edition}", a live birthday game show for ${EVENT.guestOfHonour}, with family and friends watching a TV.`,
  "Be funny and a little sarcastic, but always kind. Tease choices and answers, never people's looks, weight, age, religion, family, money, health, relationships or intelligence.",
  "No swearing, no innuendo, nothing a grandparent would mind hearing. Never invent private facts about real people.",
  "One or two short spoken sentences, under 30 words. No emoji, hashtags, markdown, stage directions or quotation marks.",
  "Bangla must be natural, conversational Bangladeshi Bangla in Bengali script, not a word-for-word translation.",
].join("\n");

export type CommentaryKind = "roast" | "hype" | "reveal" | "leaderboard";

export function gameContext(state: RoomState): string {
  const ranked = rankPlayers(state.players).slice(0, 5);
  const q = state.questions[state.questionIndex];
  const lines = [
    `Phase: ${state.phase}. Players: ${state.players.length}.`,
    ranked.length ? `Top scores: ${ranked.map((p) => `${p.name} ${p.score}`).join(", ")}.` : "",
    q && (state.phase === "question" || state.phase === "reveal")
      ? `Current question: "${q.prompt.replace(/^\[Mock\]\s*/, "")}" Correct answer: "${q.options[q.correctIndex]}". ` +
        `Answers so far: ${Object.keys(state.answers).length}, correct: ${Object.values(state.answers).filter((a) => a.optionIndex === q.correctIndex).length}.`
      : "",
    state.phase === "reveal" && Object.keys(state.lastGains).length === 0 ? "Nobody got this one right." : "",
  ];
  return lines.filter(Boolean).join("\n");
}

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
  const prompt = [
    gameContext(state),
    note ? `Host's note: ${speakable(note, 200)}` : "",
    ASK[kind],
    'Reply only with JSON: {"en": "<English line>", "bn": "<the same joke in Bangla>"}',
  ]
    .filter(Boolean)
    .join("\n\n");
  const r = await routeLlm(RULES, prompt, 300);
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

/** Reply to a guest, in the language they spoke. */
export async function writeReply(
  state: RoomState,
  said: string,
  lang: Lang | null,
): Promise<Omit<Written, "text" | "clip"> & { text: Partial<Bilingual>; lang: Lang }> {
  const replyLang: Lang = lang ?? "en";
  const prompt = [
    gameContext(state),
    `A guest just spoke to you into the microphone.`,
    `GUEST SAID: ${speakable(said, 400)}`,
    `Answer them directly and playfully in ${replyLang === "bn" ? "Bangla" : "English"} (they may mix languages; match their tone).`,
    `Reply only with JSON: {"${replyLang}": "<your reply>"}`,
  ].join("\n\n");
  const r = await routeLlm(RULES, prompt, 300);
  const parsed = parseBilingual(r.value);
  const line = parsed?.[replyLang] || parsed?.en || parsed?.bn;
  if (!line) throw new Error(`${r.provider} returned no usable reply`);
  return { text: { [replyLang]: line }, lang: replyLang, provider: r.provider, ms: r.ms, attempts: r.attempts };
}
