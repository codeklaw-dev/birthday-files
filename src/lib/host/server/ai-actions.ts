import "server-only";
import type { Action } from "@/lib/game/types";
import { roomStore } from "@/lib/server/room-store";

/**
 * The only door from the AI host into the game: it may SPEAK (a line, a
 * prepared clip or a quip). It can never award points, reveal, vote, advance
 * a scene or touch secrets; those actions are refused here, whatever the model says.
 */
export const AI_ALLOWED = ["host/say", "host/clip", "host/quip"] as const;
type AiAction = Extract<Action, { type: (typeof AI_ALLOWED)[number] }>;

export function aiDispatch(action: AiAction) {
  if (!(AI_ALLOWED as readonly string[]).includes(action.type)) throw new Error(`The AI host may not dispatch ${action.type}.`);
  if (action.type === "host/say" && action.source !== "llm" && action.source !== "conversation") throw new Error("AI lines must be marked as AI-written.");
  return roomStore.dispatch(action);
}
