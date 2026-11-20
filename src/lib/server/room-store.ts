import "server-only";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { applyAction, createRoom } from "@/lib/game/engine";
import type { Action, ActionResult, RoomState } from "@/lib/game/types";

/** Where the room is saved. On Railway this is a mounted volume, so it survives restarts and redeploys. */
export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), ".data");
const ROOM_FILE = path.join(DATA_DIR, "room.json");

function loadRoom(): RoomState {
  const fresh = createRoom();
  try {
    const saved = JSON.parse(readFileSync(ROOM_FILE, "utf8")) as Partial<RoomState>;
    if (!saved || typeof saved !== "object" || !Array.isArray(saved.players)) return fresh;
    // Keep guests, wishes, answers and scores; always use the current question set.
    return { ...fresh, ...saved, questions: fresh.questions };
  } catch {
    return fresh;
  }
}

/**
 * Realtime backend: one room held in server memory, fanned out to clients
 * over Server-Sent Events, and saved to DATA_DIR/room.json after every change
 * so a restart picks up where it left off.
 *
 * Works with `next dev` / `next start` (a single Node process) so phones on
 * the same Wi-Fi can really play. It will NOT work on Vercel serverless —
 * that is what the Supabase adapter replaces (docs/ARCHITECTURE.md).
 */
class RoomStore {
  private state: RoomState = loadRoom();
  private listeners = new Set<(s: RoomState) => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;

  constructor() {
    this.syncTimer();
    const flush = () => this.dirty && this.save();
    process.once("SIGTERM", flush);
    process.once("SIGINT", flush);
    process.once("beforeExit", flush);
  }

  /** Write the room atomically (temp file, then rename) so a crash never leaves half a file. */
  save() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    this.dirty = false;
    try {
      mkdirSync(DATA_DIR, { recursive: true });
      const tmp = `${ROOM_FILE}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.state));
      renameSync(tmp, ROOM_FILE);
    } catch (err) {
      console.error("Couldn't save the room:", err);
    }
  }

  private scheduleSave() {
    this.dirty = true;
    this.saveTimer ??= setTimeout(() => this.save(), 200);
  }

  getState(): RoomState {
    return this.state;
  }

  subscribe(fn: (s: RoomState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  dispatch(action: Action): ActionResult {
    const result = applyAction(this.state, action, { now: Date.now(), newId: () => randomUUID().slice(0, 8) });
    if (!result.ok) return result;
    this.state = result.state;
    this.scheduleSave();
    this.syncTimer();
    for (const fn of this.listeners) fn(this.state);
    return result;
  }

  /** Auto-reveal when the question clock runs out. */
  private syncTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const { phase, questionEndsAt, questions, questionIndex } = this.state;
    if (phase !== "question" || questionEndsAt === null) return;
    const questionId = questions[questionIndex].id;
    this.timer = setTimeout(
      () => this.dispatch({ type: "system/timeUp", questionId }),
      Math.max(0, questionEndsAt - Date.now()) + 250,
    );
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

export function lanHosts(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((n) => n && n.family === "IPv4" && !n.internal)
    .map((n) => n!.address);
}
