import "server-only";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { applyAction, createRoom } from "@/lib/game/engine";
import { freshGames } from "@/lib/games/engine-games";
import type { Action, ActionResult, RoomState } from "@/lib/game/types";

/**
 * MOCK realtime backend: one room held in server memory, fanned out to
 * clients over Server-Sent Events, snapshotted to `.data/room.json` so a
 * server restart mid-party does not lose players, scores or messages.
 *
 * Works with `next dev` / `next start` (a single Node process). It will NOT
 * work on Vercel serverless; Supabase replaces it (docs/ARCHITECTURE.md).
 */
const SNAPSHOT_VERSION = 3;
const DATA_DIR = process.env.ROOM_DATA_DIR || path.join(process.cwd(), ".data");
const SNAPSHOT = path.join(DATA_DIR, "room.json");

function loadSnapshot(): RoomState | null {
  if (process.env.ROOM_PERSIST === "off") return null;
  try {
    const raw = JSON.parse(readFileSync(SNAPSHOT, "utf8"));
    if ((raw?.version !== SNAPSHOT_VERSION && raw?.version !== 2) || typeof raw.state?.code !== "string") return null;
    // v2 snapshots predate the games: add the games fields with defaults.
    const { scoreLog: _old, ...rest } = raw.state as RoomState & { scoreLog?: unknown };
    void _old;
    return { ...freshGames(), ...rest } as RoomState;
  } catch {
    return null;
  }
}

/** Uniform [0, 1) from the OS's cryptographic generator: wheel spins and role draws can't be predicted or steered. */
export const secureRandom = () => randomBytes(6).readUIntBE(0, 6) / 2 ** 48;
const newJudgeKey = () => randomBytes(18).toString("base64url");

class RoomStore {
  private state: RoomState = (() => {
    const s = loadSnapshot() ?? createRoom("MEZ26", Date.now());
    return s.judgeKey ? s : { ...s, judgeKey: newJudgeKey() };
  })();
  private listeners = new Set<(s: RoomState, action: Action | null) => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.syncTimer();
  }

  getState(): RoomState {
    return this.state;
  }

  subscribe(fn: (s: RoomState, action: Action | null) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  dispatch(action: Action): ActionResult {
    const result = applyAction(this.state, action, { now: Date.now(), newId: () => randomUUID().slice(0, 8), random: secureRandom });
    if (!result.ok) return result;
    this.state = result.state;
    this.syncTimer();
    this.scheduleSave();
    for (const fn of this.listeners) fn(this.state, action);
    return result;
  }

  /** Mez's judge phone key. Rotating it signs out the old judge phone. */
  judgeKey(): string {
    return this.state.judgeKey;
  }
  rotateJudgeKey(): string {
    this.state = { ...this.state, judgeKey: newJudgeKey(), rev: this.state.rev + 1 };
    this.scheduleSave();
    return this.state.judgeKey;
  }

  /** Auto-advance when a quiz question or a game step runs out of time. */
  private syncTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const g = this.state.game;
    if (g && g.stepEndsAt !== null) {
      const { roundId, step } = g;
      this.timer = setTimeout(() => this.dispatch({ type: "system/gameTimeUp", roundId, step }), Math.max(0, g.stepEndsAt - Date.now()) + 250);
      return;
    }
    const { phase, questionEndsAt, questions, questionIndex } = this.state;
    if (phase !== "question" || questionEndsAt === null) return;
    const questionId = questions[questionIndex].id;
    this.timer = setTimeout(
      () => this.dispatch({ type: "system/timeUp", questionId }),
      Math.max(0, questionEndsAt - Date.now()) + 250,
    );
  }

  private scheduleSave() {
    if (process.env.ROOM_PERSIST === "off" || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      try {
        mkdirSync(DATA_DIR, { recursive: true });
        const tmp = `${SNAPSHOT}.tmp`;
        writeFileSync(tmp, JSON.stringify({ version: SNAPSHOT_VERSION, savedAt: Date.now(), state: this.state }));
        renameSync(tmp, SNAPSHOT);
      } catch (err) {
        console.error("[room] snapshot failed", err);
      }
    }, 500);
  }
}

// Survive dev-mode module reloads.
const g = globalThis as unknown as { __birthdayRoom?: RoomStore };
export const roomStore = (g.__birthdayRoom ??= new RoomStore());

/** Dev default so the prototype runs with zero config. Set HOST_KEY for real use. */
export const DEV_HOST_KEY = "mez-host";

export function isHostKey(key: string | null | undefined): boolean {
  const expected = Buffer.from(process.env.HOST_KEY || DEV_HOST_KEY);
  const given = Buffer.from(key ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function isJudgeKey(key: string | null | undefined): boolean {
  const expected = Buffer.from(roomStore.judgeKey());
  const given = Buffer.from(key ?? "");
  return expected.length > 0 && given.length === expected.length && timingSafeEqual(given, expected);
}

export function lanHosts(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((n) => n && n.family === "IPv4" && !n.internal)
    .map((n) => n!.address);
}
