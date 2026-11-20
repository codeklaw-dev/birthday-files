import "server-only";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { networkInterfaces } from "node:os";
import { applyAction, createRoom } from "@/lib/game/engine";
import type { Action, ActionResult, RoomState } from "@/lib/game/types";

/**
 * MOCK realtime backend: one room held in server memory, fanned out to
 * clients over Server-Sent Events.
 *
 * Works with `next dev` / `next start` (a single Node process) so phones on
 * the same Wi-Fi can really play. It will NOT work on Vercel serverless —
 * that is what the Supabase adapter replaces (docs/ARCHITECTURE.md).
 */
class RoomStore {
  private state: RoomState = createRoom();
  private listeners = new Set<(s: RoomState) => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;

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

/** The TV screen opens with the host key, or with DISPLAY_KEY so the host key never has to be typed on the TV. */
export function isDisplayKey(key: string | null | undefined): boolean {
  if (isHostKey(key)) return true;
  const display = process.env.DISPLAY_KEY;
  if (!display) return false;
  const expected = Buffer.from(display);
  const given = Buffer.from(key ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function lanHosts(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((n) => n && n.family === "IPv4" && !n.internal)
    .map((n) => n!.address);
}
