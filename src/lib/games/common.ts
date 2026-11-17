import type { Player } from "@/lib/game/types";
import type { Line } from "@/lib/host/types";
import type { PointsConfig } from "./config";
import type { Award, ContributorRef, GameState, Step, Subject } from "./types";

export interface GCtx {
  now: number;
  newId: () => string;
  /** Uniform in [0, 1). Crypto-backed on the server, seeded in tests. */
  random: () => number;
}
export interface Env {
  players: Player[];
  points: PointsConfig;
}
export type Actor = { role: "player"; playerId: string } | { role: "judge" } | { role: "host" } | { role: "system" };
export type ViewerRole = "host" | "display" | "player" | "judge";
export interface Viewer {
  role: ViewerRole;
  playerId: string | null;
}

export type GameAction =
  | { type: "game/clue"; text: string }
  | { type: "game/vote"; choice: string }
  | { type: "game/guess"; text: string }
  | { type: "judge/score"; key: string; stars: number }
  | { type: "judge/lock" }
  | { type: "judge/plea"; plea: "guilty" | "not_guilty" }
  | { type: "judge/rest" }
  | { type: "judge/guess"; suspectId: string }
  | { type: "host/game/reveal"; index?: number }
  | { type: "host/game/accept"; playerId: string; answerIndex: number };

export interface GameModule<G extends GameState, V> {
  advance(g: G, ctx: GCtx, env: Env): Step<G> & { end?: boolean };
  timeUp(g: G, ctx: GCtx, env: Env): Step<G> & { end?: boolean };
  act(g: G, a: GameAction, actor: Actor, ctx: GCtx, env: Env): Step<G>;
  view(g: G, viewer: Viewer, env: Env): V;
  /** Label for the host's "next" button, or null when waiting on someone else. */
  advanceLabel(g: G): string | null;
}

export const ok = <G>(game: G, extra: { awards?: Award[]; line?: Line; audit?: string; end?: boolean } = {}) => ({ ok: true as const, game, ...extra });
export const err = (error: string) => ({ ok: false as const, error });

export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const letter = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : letter(Math.floor(i / 26) - 1) + letter(i % 26));

export const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "");

export const line = (cue: string, en: string, bn: string, bigMoment = false): Line => ({ cue, text: { en, bn }, bigMoment });

export const playerSubject = (p: Player): Subject => ({ kind: "player", id: p.id, name: p.name });
export const contributorSubject = (c: ContributorRef): Subject => ({ kind: "contributor", id: c.id, name: c.name, remote: c.remote });
export const nameOf = (env: Env, id: string) => env.players.find((p) => p.id === id)?.name ?? "A guest";
export const isPlaying = (env: Env, id: string) => env.players.some((p) => p.id === id);
