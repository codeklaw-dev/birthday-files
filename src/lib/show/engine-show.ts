import type { Action, ActionResult, Phase, RoomState } from "@/lib/game/types";
import type { EngineCtx } from "@/lib/game/engine";
import { speak } from "@/lib/host/host-state";
import type { Line } from "@/lib/host/types";
import { isClock, PLAN_LIMITS, SEGMENT_KINDS } from "./config";
import type { Scene, SceneContent, Segment, ShowAction, ShowState, ShowView } from "./types";

type Apply = (state: RoomState, action: Action, ctx: EngineCtx) => ActionResult;

const SHOW_TYPES = /^(host\/show\/|host\/scene\/|host\/cake\/|judge\/cake\/)/;
export const isShowAction = (type: string) => SHOW_TYPES.test(type);

/** Actions a segment may start with. Anything else in `start` is refused. */
const STARTERS = new Set([
  "host/next",
  "host/showMessages",
  "host/showBoards",
  "host/wheel/show",
  "host/startCake",
  "host/finish",
  "host/game/start",
  "host/scene/start",
  "host/show/idle",
]);

/** Guest and judge input that waits while the show is paused or on hold. */
const GUEST_INPUT = /^(answer$|blow$|game\/|wheel\/|judge\/)/;
export const blockedWhilePaused = (state: RoomState, type: string) => (state.show.paused || state.show.hold) && GUEST_INPUT.test(type);

export function freshShow(plan: Segment[] = [], rehearsal = false): ShowState {
  return { plan, currentId: null, paused: null, hold: null, rehearsal };
}

const fail = (error: string): ActionResult => ({ ok: false, error });
const ok = (state: RoomState): ActionResult => ({ ok: true, state: { ...state, rev: state.rev + 1 } });
const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "");

const line = (cue: string, en: string, bn: string, bigMoment = false): Line => ({ cue, text: { en, bn }, fallbackClip: bigMoment ? "applause" : undefined, bigMoment });

const SCENE_LINES: Record<SceneContent["kind"], Line> = {
  spotlight: line("spotlight", "Spotlight time. Read the evidence — who do you think sent it?", "স্পটলাইটের সময়। প্রমাণ দেখুন — কে পাঠিয়েছে বলে মনে হয়?"),
  history: line("history", "Let's travel back. What else happened on the twenty-first of November?", "চলুন পিছনে ফিরে যাই। একুশে নভেম্বর আর কী কী ঘটেছিল?"),
  honours: line("honours", "Some honourable mentions — people who made this night special.", "কিছু বিশেষ উল্লেখ — যাঁরা এই রাতটা বিশেষ করে তুলেছেন।"),
  montage: line("montage", "Mez, these messages are for you. Grab a tissue.", "মেজ, এই বার্তাগুলো তোমার জন্য। একটা টিস্যু হাতে রাখো।", true),
  prizes: line("prizes", "Prize time! Let's see who's taking something home.", "পুরস্কারের সময়! দেখা যাক কে কী নিয়ে বাড়ি যাচ্ছে।", true),
  ceremony: line("ceremony", "The final standings. Drumroll, please.", "চূড়ান্ত ফলাফল। ড্রামরোল, প্লিজ।", true),
};

export function validatePlan(input: unknown): Segment[] | string {
  if (!Array.isArray(input) || input.length === 0) return "The running order needs at least one segment.";
  if (input.length > PLAN_LIMITS.segments) return `At most ${PLAN_LIMITS.segments} segments.`;
  const seen = new Set<string>();
  const out: Segment[] = [];
  for (const raw of input as Partial<Segment>[]) {
    const id = clean(raw?.id, 24);
    if (!/^[\w-]{1,24}$/.test(id) || seen.has(id)) return "Every segment needs its own id.";
    seen.add(id);
    if (!SEGMENT_KINDS.includes(raw.kind as Segment["kind"])) return `Unknown segment type “${String(raw.kind)}”.`;
    if (!isClock(raw.at)) return "Times look like 19:30.";
    const minutes = Math.trunc(Number(raw.minutes));
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > PLAN_LIMITS.minutes) return `Lengths go from 1 to ${PLAN_LIMITS.minutes} minutes.`;
    const status = ["pending", "live", "done", "skipped"].includes(raw.status as string) ? (raw.status as Segment["status"]) : "pending";
    out.push({
      id,
      kind: raw.kind as Segment["kind"],
      title: clean(raw.title, PLAN_LIMITS.title) || String(raw.kind),
      at: raw.at,
      minutes,
      enabled: raw.enabled !== false,
      status,
      note: clean(raw.note, PLAN_LIMITS.note),
      ...(raw.kind === "history" ? { includeSerious: !!raw.includeSerious } : {}),
    });
  }
  return out;
}

function markPlan(show: ShowState, id: string, status: Segment["status"], prevLive: Segment["status"] = "done"): ShowState {
  return {
    ...show,
    plan: show.plan.map((s) => (s.id === id ? { ...s, status } : s.status === "live" ? { ...s, status: prevLive } : s)),
    currentId: status === "live" ? id : show.currentId === id ? null : show.currentId,
  };
}

function pause(state: RoomState, now: number): ShowState["paused"] {
  const q = state.phase === "question" && state.questionEndsAt !== null ? { index: state.questionIndex, leftMs: Math.max(1000, state.questionEndsAt - now) } : null;
  const g = state.game;
  const step = g && g.stepEndsAt !== null ? { roundId: g.roundId, step: g.step, leftMs: Math.max(1000, g.stepEndsAt - now) } : null;
  return { at: now, question: q, step };
}

function frozen(state: RoomState): RoomState {
  return {
    ...state,
    questionEndsAt: state.phase === "question" ? null : state.questionEndsAt,
    game: state.game ? ({ ...state.game, stepEndsAt: null } as RoomState["game"]) : null,
  };
}

function thaw(state: RoomState, now: number): RoomState {
  const p = state.show.paused;
  let next: RoomState = { ...state, show: { ...state.show, paused: null } };
  if (!p) return next;
  if (p.question && next.phase === "question" && next.questionIndex === p.question.index) next = { ...next, questionEndsAt: now + p.question.leftMs };
  const g = next.game;
  if (p.step && g && g.roundId === p.step.roundId && g.step === p.step.step && g.stepEndsAt === null) next = { ...next, game: { ...g, stepEndsAt: now + p.step.leftMs } as NonNullable<RoomState["game"]> };
  return next;
}

/** Lobby-ish idle screen: leave whatever scene is up (never in the middle of a game). */
function idle(state: RoomState): RoomState | string {
  if (state.game) return "Finish or stop the current game first.";
  if (state.phase === "question") return "Reveal the current question first.";
  return { ...state, phase: "lobby", scene: null, surprise: null };
}

export function applyShowAction(state: RoomState, action: ShowAction, ctx: EngineCtx, apply: Apply): ActionResult {
  const { now } = ctx;
  const show = state.show;
  switch (action.type) {
    case "host/show/plan": {
      const plan = validatePlan(action.plan);
      if (typeof plan === "string") return fail(plan);
      // A segment that is live stays live (the organiser edits around it).
      const live = show.currentId;
      return ok({ ...state, show: { ...show, plan: plan.map((s) => (s.id === live ? { ...s, status: "live" } : s.status === "live" ? { ...s, status: "done" } : s)), currentId: plan.some((s) => s.id === live) ? live : null } });
    }

    case "host/show/go": {
      if (show.hold) return fail("Emergency stop is on. Resume the show first.");
      const seg = show.plan.find((s) => s.id === action.segmentId);
      if (!seg) return fail("Unknown segment.");
      let next = state;
      if (show.paused) next = thaw(next, now);
      const start = action.start as Action | undefined;
      if (start) {
        if (!STARTERS.has(start.type)) return fail("That segment can't be started from here.");
        const res = apply(next, start, ctx);
        if (!res.ok) return res;
        next = res.state;
      }
      return ok({ ...next, rev: next.rev, show: markPlan(next.show, seg.id, "live") });
    }

    case "host/show/end": {
      if (!show.currentId) return fail("No segment is live.");
      let next = state;
      if (state.phase === "scene" || state.phase === "cake") {
        const r = idle(state);
        if (typeof r === "string") return fail(r);
        next = r;
      }
      return ok({ ...next, show: markPlan(next.show, show.currentId, "done") });
    }

    case "host/show/skip": {
      const seg = show.plan.find((s) => s.id === action.segmentId);
      if (!seg) return fail("Unknown segment.");
      if (seg.status === "live") {
        const r = state.phase === "scene" || state.phase === "cake" ? idle(state) : state;
        if (typeof r === "string") return fail(r);
        return ok({ ...r, show: { ...markPlan(r.show, seg.id, "skipped"), currentId: null } });
      }
      return ok({ ...state, show: { ...show, plan: show.plan.map((s) => (s.id === seg.id ? { ...s, status: "skipped" } : s)) } });
    }

    case "host/show/restore": {
      const seg = show.plan.find((s) => s.id === action.segmentId);
      if (!seg || seg.status === "live") return fail("Pick a segment that isn't live.");
      return ok({ ...state, show: { ...show, plan: show.plan.map((s) => (s.id === seg.id ? { ...s, status: "pending" } : s)) } });
    }

    case "host/show/pause":
      if (show.paused) return fail("Already paused.");
      return ok({ ...frozen(state), show: { ...show, paused: pause(state, now) }, host: { ...state.host, stopId: ctx.newId() } });

    case "host/show/resume": {
      if (!show.paused && !show.hold) return fail("Nothing is paused.");
      const thawed = thaw(state, now);
      const muted = show.hold ? show.hold.prevMuted : state.host.muted;
      return ok({ ...thawed, show: { ...thawed.show, hold: null }, host: { ...thawed.host, muted } });
    }

    case "host/show/emergency": {
      if (show.hold) return fail("Emergency stop is already on.");
      const base = show.paused ? state : frozen(state);
      return ok({
        ...base,
        show: { ...show, paused: show.paused ?? pause(state, now), hold: { at: now, prevMuted: state.host.muted } },
        host: { ...state.host, muted: true, stopId: ctx.newId(), sfx: null },
      });
    }

    case "host/show/idle": {
      const r = idle(state);
      return typeof r === "string" ? fail(r) : ok(r);
    }

    // ---------- presentational scenes ----------
    case "host/scene/start": {
      const c = action.scene;
      if (state.game) return fail("Finish or stop the current game first.");
      if (state.phase === "question") return fail("Reveal the current question first.");
      if (!c || !SCENE_LINES[c.kind]) return fail("Scene content missing.");
      if (!Array.isArray(c.items)) return fail("Scene content missing.");
      if (c.items.length === 0 && c.kind !== "ceremony" && c.kind !== "prizes") return fail("Nothing approved for this segment yet.");
      const returnPhase: Phase = state.phase === "scene" ? (state.scene?.returnPhase ?? "lobby") : state.phase === "surprise" ? "lobby" : state.phase;
      const scene: Scene = { id: ctx.newId(), kind: c.kind, title: clean(c.title, 80), subtitle: clean(c.subtitle, 160), items: c.items.slice(0, 200), index: -1, revealed: false, startedAt: now, returnPhase };
      return ok({ ...state, phase: "scene", scene, surprise: null, host: { ...speak(state.host, SCENE_LINES[c.kind], ctx), sfx: { id: ctx.newId(), kind: "whoosh", at: now } } });
    }

    case "host/scene/next":
    case "host/scene/prev":
    case "host/scene/goto": {
      const sc = state.scene;
      if (state.phase !== "scene" || !sc) return fail("No scene on screen.");
      const last = sceneSteps(state) - 1;
      const target = action.type === "host/scene/next" ? sc.index + 1 : action.type === "host/scene/prev" ? sc.index - 1 : Math.trunc(Number(action.index));
      if (!Number.isFinite(target) || target < -1 || target > last) return fail(action.type === "host/scene/next" ? "That was the last one." : "Can't go there.");
      const sfxKind = sc.kind === "ceremony" || sc.kind === "prizes" ? "drumroll" : "whoosh";
      return ok({ ...state, scene: { ...sc, index: target, revealed: false }, host: { ...state.host, sfx: { id: ctx.newId(), kind: sfxKind, at: now } } });
    }

    case "host/scene/reveal": {
      const sc = state.scene;
      if (state.phase !== "scene" || !sc || sc.index < 0) return fail("Show an item first.");
      if (sc.revealed) return fail("Already revealed.");
      return ok({ ...state, scene: { ...sc, revealed: true }, host: { ...state.host, sfx: { id: ctx.newId(), kind: "fanfare", at: now } } });
    }

    case "host/scene/end": {
      if (state.phase !== "scene" || !state.scene) return fail("No scene on screen.");
      const back = state.scene.returnPhase;
      return ok({ ...state, phase: back === "question" || back === "game" || back === "scene" ? "lobby" : back, scene: null });
    }

    // ---------- the cake ----------
    case "judge/cake/blow":
    case "host/cake/mez": {
      if (state.phase !== "cake") return fail("The cake isn't out yet.");
      if (state.cake.mezOut) return fail("The candles are already out.");
      return ok({
        ...state,
        cake: { ...state.cake, mezOut: true },
        host: { ...speak(state.host, { cue: "cakeDone", text: { en: "The candles are out. Happy birthday, Mez!", bn: "মোমবাতি নিভে গেছে। শুভ জন্মদিন, মেজ!" }, clip: "cake_done", bigMoment: true }, ctx), sfx: { id: ctx.newId(), kind: "applause", at: now } },
      });
    }
    case "host/cake/cut":
      if (state.phase !== "cake") return fail("The cake isn't out yet.");
      if (!state.cake.mezOut) return fail("Mez blows out the last candle first (or use “Blow for Mez”).");
      if (state.cake.stage !== "candles") return fail("Already cut.");
      return ok({ ...state, cake: { ...state.cake, stage: "cut" }, host: { ...speak(state.host, line("cakeCut", "And the first slice goes to... Mez!", "প্রথম টুকরোটা যাবে... মেজের কাছে!", true), ctx), sfx: { id: ctx.newId(), kind: "fanfare", at: now } } });
    case "host/cake/real":
      if (state.phase !== "cake") return fail("The cake isn't out yet.");
      if (state.cake.stage === "real") return fail("Already on the real cake.");
      return ok({ ...state, cake: { ...state.cake, mezOut: true, stage: "real" }, host: speak(state.host, line("cakeReal", "Now for the real thing. Everyone, gather round the cake!", "এবার আসল কেক। সবাই কেকের চারপাশে চলে আসুন!", true), ctx) });

    default:
      return fail("Unknown action.");
  }
}

/** Ceremony steps = rows on both boards (up to 5 each); other scenes = items. */
export function sceneSteps(state: RoomState): number {
  const sc = state.scene;
  if (!sc) return 0;
  return sc.items.length;
}

export function showView(state: RoomState): ShowView {
  return { plan: state.show.plan, currentId: state.show.currentId, paused: !!state.show.paused, hold: !!state.show.hold, rehearsal: state.show.rehearsal };
}
