import type { ActionResult, Player, RoomState } from "@/lib/game/types";
import { speak } from "@/lib/host/host-state";
import { LINES } from "@/lib/host/script";
import type { GamesAction } from "./actions";
import { DEFAULT_POINTS, POINT_KEYS, PRIZES, WHEEL_RULES, type PointsConfig, type PrizeId } from "./config";
import { clean, line, type Actor, type Env, type GameAction, type GameModule, type GCtx, type Viewer } from "./common";
import { imposter, startImposter } from "./imposter";
import { expertBoard, liveBoard, totalFor } from "./ledger";
import { mystery, startMystery } from "./mystery";
import { startSurvey, survey } from "./survey";
import { startTrial, trial } from "./trial";
import type { Award, BoardId, GameId, GameState, LedgerEntry, Subject, WheelSpin } from "./types";
import type { GamesView, GameView, WheelView } from "./views";
import { startWkmb, wkmb } from "./wkmb";

/**
 * The shared, server-authoritative layer for every game: who may do what,
 * timers, scoring through an append-only ledger, corrections, the prize wheel.
 * Pure: (state, action) → state. Randomness comes in through ctx.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MODULES: Record<GameId, GameModule<any, any>> = { imposter, wkmb, survey, trial, mystery };

export interface EngineGCtx {
  now: number;
  newId: () => string;
  random?: () => number;
}

const gctx = (c: EngineGCtx): GCtx => ({ now: c.now, newId: c.newId, random: c.random ?? Math.random });
const env = (s: RoomState): Env => ({ players: s.players, points: s.points });
const fail = (error: string): ActionResult => ({ ok: false, error });
const done = (state: RoomState): ActionResult => ({ ok: true, state: { ...state, rev: state.rev + 1 } });

export const freshGames = (judgeKey = ""): Pick<RoomState, "game" | "ledger" | "audit" | "points" | "setup" | "wheel" | "judgeKey"> => ({
  game: null,
  ledger: [],
  audit: [],
  points: { ...DEFAULT_POINTS },
  setup: { survey: {}, trialCaseIds: null },
  wheel: { allowContact: false, current: null, history: [] },
  judgeKey,
});

// ---------- ledger ----------

/** Live totals live on players too (the quiz UI reads player.score). */
export function syncPlayerScores(players: Player[], ledger: LedgerEntry[]): Player[] {
  return players.map((p) => ({ ...p, score: totalFor(ledger, "live", { kind: "player", id: p.id }) }));
}

export function appendAwards(state: RoomState, awards: Award[], ctx: EngineGCtx, source: LedgerEntry["source"], by: LedgerEntry["by"] = "system"): RoomState {
  if (!awards.length) return state;
  const ledger = [
    ...state.ledger,
    ...awards.map((a) => ({ id: ctx.newId(), board: a.board, subject: a.subject, delta: a.delta, rule: a.rule, note: a.note, source, by, at: ctx.now })),
  ];
  return { ...state, ledger, players: syncPlayerScores(state.players, ledger) };
}

export function addAudit(state: RoomState, text: string, by: "host" | "judge" | "system", ctx: EngineGCtx): RoomState {
  return { ...state, audit: [...state.audit, { id: ctx.newId(), at: ctx.now, by, text }].slice(-500) };
}

/** A correction: a new entry, never an edit. Totals are not allowed below zero. */
export function correction(
  state: RoomState,
  input: { board: BoardId; subject: Subject; delta: number; reason: string; correctsId?: string; by: "host" | "judge"; rule?: string; max: number },
  ctx: EngineGCtx,
): ActionResult {
  const reason = clean(input.reason, 120);
  if (reason.length < 3) return fail("Give a reason for the change (it's shown in the score history).");
  let delta = Math.trunc(Number(input.delta));
  if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > input.max) return fail(`Points must be between -${input.max} and ${input.max}, not 0.`);
  if (input.board !== "live" && input.board !== "expert") return fail("Unknown leaderboard.");
  let subject = input.subject;
  if (subject.kind === "player") {
    const p = state.players.find((x) => x.id === subject.id);
    if (!p) return fail("Unknown player.");
    subject = { kind: "player", id: p.id, name: p.name };
  } else {
    const known = [...state.ledger].reverse().find((e) => e.subject.kind === "contributor" && e.subject.id === subject.id)?.subject;
    subject = known ?? { kind: "contributor", id: clean(subject.id, 64), name: clean(subject.name, 60) || "Guest", remote: !!subject.remote };
    if (!subject.id) return fail("Unknown contributor.");
  }
  if (input.correctsId && !state.ledger.some((e) => e.id === input.correctsId)) return fail("That score entry doesn't exist.");
  const current = totalFor(state.ledger, input.board, subject);
  if (current + delta < 0) delta = -current;
  if (delta === 0) return fail("That would take the total below zero.");
  const entry: LedgerEntry = {
    id: ctx.newId(),
    board: input.board,
    subject,
    delta,
    rule: input.rule ?? "correction",
    note: reason,
    source: input.by,
    by: input.by,
    at: ctx.now,
    ...(input.correctsId ? { correctsId: input.correctsId } : {}),
  };
  const ledger = [...state.ledger, entry];
  return done({ ...state, ledger, players: syncPlayerScores(state.players, ledger) });
}

// ---------- prize wheel ----------

export function wheelEligible(state: RoomState) {
  // Every spin is in history; declined prizes don't use up a person's spin.
  const spun = (s: Pick<Subject, "kind" | "id">) => state.wheel.history.filter((h) => h.recipient.kind === s.kind && h.recipient.id === s.id && h.status !== "declined").length;
  const rows = [
    ...liveBoard(state.ledger, state.players).map((r) => ({ ...r, board: "live" as const })),
    ...expertBoard(state.ledger).map((r) => ({ ...r, board: "expert" as const })),
  ].filter((r) => r.rank <= WHEEL_RULES.topN && r.total > 0 && spun(r.subject) < WHEEL_RULES.maxSpinsPerPerson);
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = `${r.subject.kind}:${r.subject.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function prizeSegments(subject: Pick<Subject, "remote" | "kind">, allowContact: boolean): PrizeId[] {
  return PRIZES.filter((p) => (!subject.remote || p.remoteOk) && (!p.contact || (allowContact && !subject.remote))).map((p) => p.id);
}

// ---------- the dispatcher ----------

const GAME_TYPES = /^(game\/|judge\/|wheel\/|host\/game\/|host\/correct$|host\/points$|host\/setup\/|host\/wheel\/|host\/showBoards$|system\/gameTimeUp$)/;
export const isGamesAction = (type: string) => GAME_TYPES.test(type);

function applyStep(state: RoomState, r: ReturnType<GameModule<GameState, GameView>["advance"]>, ctx: EngineGCtx, by: "host" | "judge" | "system"): ActionResult {
  if (!r.ok) return fail(r.error);
  let next: RoomState = { ...state, game: r.game };
  if (r.awards?.length) next = appendAwards(next, r.awards, ctx, r.game.id, "system");
  if (r.audit) next = addAudit(next, r.audit, by, ctx);
  if (r.line) next = { ...next, host: speak(next.host, r.line, ctx) };
  if (r.end) {
    next = addAudit({ ...next, game: null, phase: "boards", host: speak(next.host, boardsLine(next), ctx) }, `${GAME_NAMES[r.game.id]} finished`, by, ctx);
  }
  return done(next);
}

/** Leaderboard line with a pre-recorded fallback, so it's still spoken if the cloud voice is down. */
function boardsLine(state: RoomState) {
  const leader = liveBoard(state.ledger, state.players).find((r) => r.rank === 1 && r.total > 0);
  return LINES.leaderboard(leader?.subject.name ?? null);
}

export const GAME_NAMES: Record<GameId, string> = {
  imposter: "Mez Imposter",
  wkmb: "Who Knows Mez Best",
  survey: "Mez Survey",
  trial: "Mez on Trial",
  mystery: "Mystery Files",
};

export function applyGamesAction(state: RoomState, action: GamesAction, c: EngineGCtx): ActionResult {
  const ctx = gctx(c);
  const g = state.game;
  const mod = g ? MODULES[g.id] : null;

  switch (action.type) {
    // ----- host: game flow -----
    case "host/game/start": {
      if (g) return fail(`Finish ${GAME_NAMES[g.id]} first.`);
      if (state.phase === "question") return fail("Reveal the current quiz question first.");
      const content = action.content;
      if (action.game !== "imposter" && (!content || content.game !== action.game)) return fail("Game content missing.");
      const r =
        action.game === "imposter"
          ? startImposter(env(state), ctx)
          : action.game === "wkmb"
            ? startWkmb((content as Extract<typeof content, { game: "wkmb" }>).content, ctx)
            : action.game === "survey"
              ? startSurvey((content as Extract<typeof content, { game: "survey" }>).content, ctx)
              : action.game === "trial"
                ? startTrial((content as Extract<typeof content, { game: "trial" }>).content, ctx)
                : action.game === "mystery"
                  ? startMystery((content as Extract<typeof content, { game: "mystery" }>).content, ctx)
                  : { ok: false as const, error: "Unknown game." };
      if (!r.ok) return fail(r.error);
      return applyStep({ ...state, phase: "game", questionEndsAt: null }, r as never, c, "host");
    }
    case "host/game/advance":
      if (!g || !mod) return fail("No game is running.");
      return applyStep(state, mod.advance(g, ctx, env(state)), c, "host");
    case "host/game/endTimer":
      if (!g || !mod || g.stepEndsAt === null) return fail("No timer is running.");
      return applyStep(state, mod.timeUp(g, ctx, env(state)), c, "host");
    case "system/gameTimeUp":
      if (!g || !mod || g.roundId !== action.roundId || g.step !== action.step || g.stepEndsAt === null) return fail("Stale timer.");
      return applyStep(state, mod.timeUp(g, ctx, env(state)), c, "system");
    case "host/game/extend": {
      if (!g || g.stepEndsAt === null) return fail("No timer is running.");
      const s = Math.trunc(Number(action.seconds));
      if (!(s >= 5 && s <= 120)) return fail("Add between 5 and 120 seconds.");
      return done({ ...state, game: { ...g, stepEndsAt: g.stepEndsAt + s * 1000 } });
    }
    case "host/game/abort":
      if (!g) return fail("No game is running.");
      return done(addAudit({ ...state, game: null, phase: "boards" }, `${GAME_NAMES[g.id]} stopped by the host (points already awarded stay)`, "host", c));
    case "host/game/reveal":
    case "host/game/accept":
      if (!g || !mod) return fail("No game is running.");
      return applyStep(state, mod.act(g, action as GameAction, { role: "host" }, ctx, env(state)), c, "host");

    // ----- players -----
    case "game/clue":
    case "game/vote":
    case "game/guess": {
      const playerId = state.tokens[action.token];
      if (!playerId) return fail("Join the game first.");
      if (!g || !mod) return fail("No game is running.");
      const { token: _t, ...rest } = action;
      void _t;
      return applyStep(state, mod.act(g, rest as GameAction, { role: "player", playerId } satisfies Actor, ctx, env(state)), c, "system");
    }

    // ----- Mez's judge phone -----
    case "judge/score":
    case "judge/lock":
    case "judge/plea":
    case "judge/rest":
    case "judge/guess":
      if (!g || !mod) return fail("No game is running.");
      return applyStep(state, mod.act(g, action as GameAction, { role: "judge" }, ctx, env(state)), c, "judge");
    case "judge/bonus": {
      const subject =
        action.subject?.kind === "player"
          ? state.players.find((p) => p.id === action.subject.id) && { kind: "player" as const, id: action.subject.id, name: "" }
          : [...state.ledger].reverse().find((e) => e.subject.kind === "contributor" && e.subject.id === action.subject?.id)?.subject;
      if (!subject) return fail("Pick a player or a contributor with points.");
      const delta = Math.trunc(Number(action.delta));
      if (!(delta > 0)) return fail("A bonus has to be positive.");
      return correction(state, { board: action.board, subject, delta, reason: `Judge's bonus: ${clean(action.reason, 100)}`, by: "judge", rule: "judge-bonus", max: state.points.judgeBonusMax }, c);
    }
    case "judge/allowContact":
      return done(addAudit({ ...state, wheel: { ...state.wheel, allowContact: !!action.allowed } }, `Mez ${action.allowed ? "allowed" : "turned off"} hug prizes`, "judge", c));

    // ----- scores -----
    case "host/correct":
      return correction(state, { ...action, by: "host", max: state.points.correctionMax }, c);
    case "host/points": {
      const changes: string[] = [];
      const points: PointsConfig = { ...state.points };
      for (const [k, v] of Object.entries(action.points ?? {})) {
        if (!POINT_KEYS.includes(k as keyof PointsConfig)) return fail(`Unknown rule "${k}".`);
        const n = Math.trunc(Number(v));
        if (!Number.isFinite(n) || n < 0 || n > 1000) return fail("Points must be whole numbers from 0 to 1000.");
        if (points[k as keyof PointsConfig] !== n) changes.push(`${k} ${points[k as keyof PointsConfig]}→${n}`);
        points[k as keyof PointsConfig] = n;
      }
      if (!changes.length) return fail("Nothing changed.");
      return done(addAudit({ ...state, points }, `Points rules changed: ${changes.join(", ")} (applies to future rounds)`, "host", c));
    }
    case "host/showBoards":
      if (state.phase === "question") return fail("Reveal the current quiz question first.");
      return done({ ...state, phase: "boards", host: speak(state.host, boardsLine(state), c) });

    // ----- setup -----
    case "host/setup/survey": {
      const qid = clean(action.questionId, 8);
      const survey = { ...state.setup.survey };
      if (action.board === null) delete survey[qid];
      else survey[qid] = { ...action.board, approvedAt: c.now };
      return done(addAudit({ ...state, setup: { ...state.setup, survey } }, action.board ? `Survey board approved for ${qid} (${action.board.answers.length} answers)` : `Survey board for ${qid} cleared`, "host", c));
    }
    case "host/setup/trial":
      return done({ ...state, setup: { ...state.setup, trialCaseIds: action.caseIds === null ? null : action.caseIds.map((x) => clean(x, 64)).slice(0, 100) } });

    // ----- prize wheel -----
    case "host/wheel/show":
      if (state.phase === "question") return fail("Reveal the current quiz question first.");
      return done({ ...state, phase: "wheel" });
    case "host/wheel/spin": {
      if (state.wheel.current?.status === "offered") return fail("Wait for the last prize to be accepted or declined.");
      const pick = wheelEligible(state).find((r) => r.subject.kind === action.subject?.kind && r.subject.id === action.subject?.id);
      if (!pick) return fail(`Only the top ${WHEEL_RULES.topN} on a leaderboard can spin (${WHEEL_RULES.maxSpinsPerPerson} spin each).`);
      const segments = prizeSegments(pick.subject, state.wheel.allowContact);
      if (!segments.length) return fail("No prizes available for this person.");
      const draw = ctx.random();
      const index = Math.min(segments.length - 1, Math.floor(draw * segments.length));
      const spin: WheelSpin = { id: c.newId(), recipient: pick.subject, segments, index, prize: segments[index], draw, at: c.now, status: "offered" };
      const prize = PRIZES.find((p) => p.id === spin.prize)!;
      let next: RoomState = { ...state, phase: "wheel", wheel: { ...state.wheel, current: spin, history: [...state.wheel.history, spin] } };
      next = addAudit(next, `Wheel spun for ${pick.subject.name}: ${prize.label} (segment ${index + 1} of ${segments.length}, draw ${draw.toFixed(4)})`, "host", c);
      next = { ...next, host: speak(next.host, line("wheel", `Spinning the wheel for ${pick.subject.name}!`, `${pick.subject.name}-এর জন্য চাকা ঘুরছে!`), c) };
      return done(next);
    }
    case "wheel/respond":
    case "host/wheel/respond": {
      const cur = state.wheel.current;
      if (!cur || cur.status !== "offered") return fail("No prize is waiting for an answer.");
      if (action.type === "wheel/respond") {
        const pid = state.tokens[action.token];
        if (!pid || cur.recipient.kind !== "player" || cur.recipient.id !== pid) return fail("This prize isn't yours to answer.");
      }
      const updated: WheelSpin = { ...cur, status: action.accept ? "accepted" : "declined", respondedBy: action.type === "wheel/respond" ? "recipient" : "host" };
      const history = state.wheel.history.map((h) => (h.id === cur.id ? updated : h));
      const prize = PRIZES.find((p) => p.id === cur.prize)!;
      let next: RoomState = addAudit({ ...state, wheel: { ...state.wheel, current: updated, history } }, `${cur.recipient.name} ${action.accept ? "accepted" : "declined"} "${prize.label}"${action.type === "host/wheel/respond" ? " (recorded by host)" : ""}`, action.type === "wheel/respond" ? "system" : "host", c);
      next = {
        ...next,
        host: speak(next.host, action.accept ? line("wheelAccept", `${cur.recipient.name} wins: ${prize.label}!`, `${cur.recipient.name} জিতেছেন: ${prize.label}!`) : line("wheelDecline", `${cur.recipient.name} politely passes. No problem at all.`, `${cur.recipient.name} বিনয়ের সাথে না বলেছেন। কোনো সমস্যা নেই।`), c),
      };
      return done(next);
    }
  }
  return fail("Unknown action.");
}

// ---------- views ----------

export function gamesView(state: RoomState, viewer: Viewer): GamesView {
  const host = viewer.role === "host";
  const g = state.game;
  const view = g ? (MODULES[g.id].view(g, viewer, env(state)) as GameView) : null;
  const cur = state.wheel.current;
  const wheel: WheelView = {
    allowContact: state.wheel.allowContact,
    segments: cur ? cur.segments : PRIZES.filter((p) => !p.contact || state.wheel.allowContact).map((p) => p.id),
    current: cur,
    eligible: host ? wheelEligible(state).map((r) => ({ ...r.subject, board: r.board, total: r.total, rank: r.rank })) : [],
    history: host ? state.wheel.history : [],
    mine: viewer.role === "player" && !!cur && cur.status === "offered" && cur.recipient.kind === "player" && cur.recipient.id === viewer.playerId,
  };
  return {
    game: view,
    advanceLabel: host && g ? MODULES[g.id].advanceLabel(g) : null,
    boards: { live: liveBoard(state.ledger, state.players), expert: expertBoard(state.ledger) },
    wheel,
    points: state.points,
    ledger: host ? state.ledger.slice(-300) : [],
    audit: host ? state.audit.slice(-100) : [],
  };
}
