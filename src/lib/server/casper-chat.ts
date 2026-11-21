import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { rankPlayers } from "@/lib/game/engine";
import type { RoomState } from "@/lib/game/types";
import { EVENT } from "@/lib/event";

/**
 * Casper's live voice mode: guests talk to the TV, Claude answers in character.
 * Needs ANTHROPIC_API_KEY on the server.
 */
export const casperChatConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

const client = () => new Anthropic({ timeout: 20_000, maxRetries: 1 });

const PERSONA = `You are Casper, the AI voice of RACO AI Technologies, hosting "${EVENT.title}: ${EVENT.edition}", a live birthday game show for ${EVENT.guestOfHonour} at her party. Guests talk to you out loud through the TV and you answer out loud.

How to speak:
- One or two short sentences, like a fun, warm game-show host. Your words are read aloud, so no lists, markdown, emoji or stage directions.
- Family-friendly and kind. Playful teasing is fine; never mean.
- The only fact you know about ${EVENT.guestOfHonour} is that her birthday is in November. Don't invent stories or facts about her or the guests; joke, flatter or turn the question back to the room instead.
- Never reveal the answer to a question that is still open. Once it's revealed, you can talk about it.
- If you didn't catch what someone said, ask them to say it again.
- The speech-to-text may mishear words; guess the sensible meaning.`;

/** What's happening right now, so Casper can talk about the game. Hides open answers. */
function gameContext(state: RoomState): string {
  const ranked = rankPlayers(state.players);
  const top = ranked.slice(0, 5).map((p, i) => `${i + 1}. ${p.name} (${p.score} pts)`).join(", ");
  const q = state.questions[state.questionIndex];
  const lines = [
    `Stage: ${state.phase}.`,
    `${state.players.length} players: ${state.players.map((p) => p.name).join(", ") || "none yet"}.`,
    top ? `Leaderboard: ${top}.` : "",
    q && (state.phase === "question" || state.phase === "reveal")
      ? `Question ${state.questionIndex + 1} of ${state.questions.length}${q.round ? ` (${q.round})` : ""}: "${q.prompt}" Options: ${q.options.join(" / ")}.` +
        (state.phase === "reveal" ? ` Revealed answer: ${q.options[q.correctIndex]}.` : " The answer is still secret.")
      : "",
    `${state.messages.filter((m) => m.status !== "hidden").length} birthday wishes were sent for ${EVENT.guestOfHonour}.`,
  ];
  return lines.filter(Boolean).join(" ");
}

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

export async function casperReply(state: RoomState, history: ChatTurn[], heard: string): Promise<string> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.slice(-8).map((t) => ({ role: t.role, content: t.text })),
    { role: "user", content: `[Live game state: ${gameContext(state)}]\n\nA guest says: "${heard}"` },
  ];
  // Keep the alternation valid if the trimmed history starts with Casper.
  while (messages.length && messages[0].role !== "user") messages.shift();

  const response = await client().beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 1000,
    output_config: { effort: "low" }, // quick, chatty replies for a live room
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: PERSONA, cache_control: { type: "ephemeral" } }],
    messages,
  });
  if (response.stop_reason === "refusal") return "Ooh, let's keep it party-friendly! Ask me something else.";
  const text = response.content
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join(" ")
    .trim();
  return text || "Say that again? The party's loud!";
}
