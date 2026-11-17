import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Action, Lang, RoomState } from "@/lib/game/types";
import { CLIP_KEYS, CLIPS } from "@/lib/host/script";
import { EMPTY_MANIFEST, type NarrationManifest } from "@/lib/host/narration";
import type { Utterance } from "@/lib/host/types";
import { roomStore } from "@/lib/server/room-store";
import { aiDispatch } from "./ai-actions";
import { writeCommentary } from "./commentary";
import { knowledge } from "./knowledge";
import { speech } from "./speech-cache";

/**
 * Background duties of the AI host, attached once per server process:
 *  - pre-warm live speech for every new line that has no exact pre-recorded
 *    clip, so it is ready by the time the TV asks for it;
 *  - when auto-quips are on, ask the LLM for a reaction after reveals and
 *    leaderboards, and fall back to a pre-recorded quip if it is slow.
 */

export function readManifest(): NarrationManifest {
  try {
    return JSON.parse(readFileSync(path.join(process.cwd(), "public", "narration", "manifest.json"), "utf8"));
  } catch {
    return EMPTY_MANIFEST;
  }
}

/** Only clips the organiser approved, for exactly the text and file they reviewed. */
export function approvedManifest(manifest = readManifest()): NarrationManifest {
  const approvals = knowledge().narrationApprovals();
  const clips: NarrationManifest["clips"] = {};
  for (const [key, langs] of Object.entries(manifest.clips)) {
    for (const lang of ["en", "bn"] as const) {
      const c = langs[lang];
      const a = approvals[`${key}:${lang}`];
      if (c && a?.status === "approved" && a.text === c.text && a.bytes === c.bytes) clips[key] = { ...clips[key], [lang]: c };
    }
  }
  return { ...manifest, clips };
}

export function hasClip(manifest: NarrationManifest, key: string | undefined, lang: Lang, text?: string): boolean {
  const c = key ? manifest.clips[key]?.[lang] : undefined;
  return !!c && (text === undefined || c.text === text);
}

export function spokenLangs(u: Utterance): Lang[] {
  return u.lang === "both" ? ["en", "bn"] : [u.lang];
}

export function narrationCoverage(manifest = readManifest()) {
  const approved = approvedManifest(manifest);
  const out = { total: CLIP_KEYS.length, en: 0, bn: 0, placeholders: 0, stale: 0, approved: Object.values(approved.clips).reduce((n, l) => n + Object.keys(l).length, 0) };
  for (const key of CLIP_KEYS) {
    for (const lang of ["en", "bn"] as const) {
      const c = manifest.clips[key]?.[lang];
      if (!c) continue;
      if (c.text !== CLIPS[key][lang]) out.stale++;
      else out[lang]++;
      if (c.placeholder) out.placeholders++;
    }
  }
  return out;
}

function prewarm(u: Utterance) {
  const manifest = approvedManifest();
  for (const lang of spokenLangs(u)) {
    if (hasClip(manifest, u.clip, lang, u.text[lang])) continue;
    speech(u.text[lang], lang).catch(() => {
      /* the TV will fall back; the router already logged it */
    });
  }
}

const QUIP_AFTER = new Set(["reveal", "leaderboard"]);
let quipSeq = 0;

async function autoQuip(state: RoomState, cue: string) {
  const seq = ++quipSeq;
  const deadline = Date.now() + 6000;
  try {
    const w = await writeCommentary(state, cue === "reveal" ? "reveal" : "leaderboard");
    if (seq !== quipSeq || Date.now() > deadline) return;
    if (w.clip) aiDispatch({ type: "host/clip", clip: w.clip });
    else aiDispatch({ type: "host/say", text: w.text, source: "llm" });
  } catch {
    if (seq === quipSeq) aiDispatch({ type: "host/quip" });
  }
}

export function ensureHostService() {
  const g = globalThis as unknown as { __hostService?: boolean };
  if (g.__hostService) return;
  g.__hostService = true;
  let lastId = roomStore.getState().host.utterance.id;
  roomStore.subscribe((state: RoomState, action: Action | null) => {
    const u = state.host.utterance;
    if (u.id === lastId) return;
    lastId = u.id;
    if (state.host.voice) prewarm(u);
    if (state.host.autoQuips && u.source === "script" && QUIP_AFTER.has(u.cue) && action?.type !== "host/replay") {
      void autoQuip(state, u.cue);
    }
  });
}

/** Ring buffer of what the TV actually played, for latency and failover checks. */
export interface PlaybackReport {
  utteranceId: string;
  lang: Lang;
  via: "clip" | "live" | "fallback-clip" | "browser" | "captions";
  provider?: string;
  latencyMs: number;
  error?: string;
  at: number;
}
const g = globalThis as unknown as { __playback?: PlaybackReport[] };
export const playbackLog = (g.__playback ??= []);
export function recordPlayback(r: PlaybackReport) {
  playbackLog.push(r);
  if (playbackLog.length > 40) playbackLog.shift();
}
