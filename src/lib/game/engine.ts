import { SCRIPT } from "@/lib/casper/script";
import { MOCK_QUESTIONS } from "./mock-data";
import type {
  Action,
  ActionResult,
  GuestMessage,
  Player,
  Role,
  RoomState,
  RoomView,
} from "./types";

/**
 * Pure game engine: (state, action) -> new state. No I/O, no timers, no
 * randomness beyond the injected `newId`. This is the piece that moves
 * unchanged behind Supabase (it can run in a route handler or edge function).
 */

export const LIMITS = {
  maxPlayers: 60,
  nameLength: 20,
  messageLength: 280,
  maxMessages: 300,
  /** A guest's profile photo travels inline as a small data URL (the phone shrinks it first). */
  photoChars: 60_000,
  basePoints: 100,
  speedBonus: 50,
  maxAward: 500,
  candles: 5,
} as const;

export interface EngineCtx {
  now: number;
  newId: () => string;
}

export function createRoom(code = "MEZ26"): RoomState {
  return {
    code,
    phase: "lobby",
    players: [],
    tokens: {},
    questions: MOCK_QUESTIONS,
    questionIndex: -1,
    questionStartedAt: null,
    questionEndsAt: null,
    answers: {},
    lastGains: {},
    messages: [],
    scoreLog: [],
    cake: { candles: LIMITS.candles, blows: 0, perCandle: 3 },
    hostLine: SCRIPT.lobby,
    hostLang: "both",
    rev: 0,
  };
}

const PHOTO_DATA_URL = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/** Accepts only small inline JPEG/PNG/WebP images, never remote URLs. */
export function isPhotoDataUrl(value: unknown): value is string {
  return typeof value === "string" && value.length <= LIMITS.photoChars && PHOTO_DATA_URL.test(value);
}

export function rankPlayers(players: Player[]): Player[] {
  return [...players].sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt);
}

export function candlesLit(cake: RoomState["cake"]): number {
  return Math.max(0, cake.candles - Math.floor(cake.blows / cake.perCandle));
}

const clean = (s: unknown, max: number) =>
  typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "";

const fail = (error: string): ActionResult => ({ ok: false, error });
const ok = (state: RoomState): ActionResult => ({ ok: true, state: { ...state, rev: state.rev + 1 } });

function startQuestion(state: RoomState, index: number, now: number): ActionResult {
  const q = state.questions[index];
  if (!q) return fail("No more questions.");
  return ok({
    ...state,
    phase: "question",
    questionIndex: index,
    questionStartedAt: now,
    questionEndsAt: now + q.seconds * 1000,
    answers: {},
    lastGains: {},
    hostLine: SCRIPT.question(index + 1, state.questions.length),
  });
}

/** Score the current question. Correct = base + a bonus for speed. */
function reveal(state: RoomState, now: number): ActionResult {
  const q = state.questions[state.questionIndex];
  if (state.phase !== "question" || !q) return fail("No question is open.");
  const started = state.questionStartedAt ?? now;
  const window = q.seconds * 1000;
  const gains: Record<string, number> = {};
  let correct = 0;
  for (const [playerId, a] of Object.entries(state.answers)) {
    if (a.optionIndex !== q.correctIndex) continue;
    correct++;
    const left = Math.min(1, Math.max(0, 1 - (a.at - started) / window));
    gains[playerId] = LIMITS.basePoints + Math.round(LIMITS.speedBonus * left);
  }
  return ok({
    ...state,
    phase: "reveal",
    questionEndsAt: null,
    lastGains: gains,
    players: state.players.map((p) => (gains[p.id] ? { ...p, score: p.score + gains[p.id] } : p)),
    scoreLog: [
      ...state.scoreLog,
      ...Object.entries(gains).map(([playerId, delta]) => ({ playerId, delta, reason: `quiz:${q.id}`, at: now })),
    ],
    hostLine: SCRIPT.reveal(correct, Object.keys(state.answers).length),
  });
}

export function applyAction(state: RoomState, action: Action, ctx: EngineCtx): ActionResult {
  const { now } = ctx;
  switch (action.type) {
    case "join": {
      const token = clean(action.token, 64);
      const name = clean(action.name, LIMITS.nameLength);
      const avatar = clean(action.avatar, 8) || "🎈";
      if (token.length < 8) return fail("Invalid player token.");
      if (!name) return fail("Please enter a name.");
      const existingId = state.tokens[token];
      const taken = (n: string) =>
        state.players.some((p) => p.id !== existingId && p.name.toLowerCase() === n.toLowerCase());
      let unique = name;
      for (let i = 2; taken(unique); i++) unique = `${name.slice(0, LIMITS.nameLength - 2)} ${i}`;
      if (existingId) {
        return ok({
          ...state,
          players: state.players.map((p) => (p.id === existingId ? { ...p, name: unique, avatar } : p)),
        });
      }
      if (state.players.length >= LIMITS.maxPlayers) return fail("The room is full.");
      const id = ctx.newId();
      return ok({
        ...state,
        tokens: { ...state.tokens, [token]: id },
        players: [...state.players, { id, name: unique, avatar, score: 0, joinedAt: now }],
      });
    }

    case "answer": {
      const playerId = state.tokens[action.token];
      const q = state.questions[state.questionIndex];
      if (!playerId) return fail("Join the game first.");
      if (state.phase !== "question" || !q) return fail("Answers are closed.");
      if (state.questionEndsAt !== null && now > state.questionEndsAt) return fail("Time is up.");
      if (state.answers[playerId]) return fail("You already answered.");
      if (!Number.isInteger(action.optionIndex) || action.optionIndex < 0 || action.optionIndex >= q.options.length)
        return fail("Invalid option.");
      return ok({ ...state, answers: { ...state.answers, [playerId]: { optionIndex: action.optionIndex, at: now } } });
    }

    case "blow": {
      if (!state.tokens[action.token]) return fail("Join the game first.");
      if (state.phase !== "cake") return fail("The cake isn't out yet.");
      if (candlesLit(state.cake) === 0) return fail("The candles are already out.");
      const cake = { ...state.cake, blows: state.cake.blows + 1 };
      return ok({ ...state, cake, hostLine: candlesLit(cake) === 0 ? SCRIPT.cakeDone : state.hostLine });
    }

    case "submitMessage": {
      const author = clean(action.author, LIMITS.nameLength);
      const text = clean(action.text, LIMITS.messageLength);
      if (!author) return fail("Please add your name.");
      if (text.length < 2) return fail("Please write a message.");
      if (state.messages.length >= LIMITS.maxMessages) return fail("The message wall is full.");
      const photo = action.photo ?? undefined;
      if (photo !== undefined && !isPhotoDataUrl(photo)) return fail("That profile picture couldn't be used. Try another photo.");
      const message: GuestMessage = { id: ctx.newId(), author, text, status: "pending", createdAt: now, ...(photo && { photo }) };
      return ok({ ...state, messages: [...state.messages, message] });
    }

    case "host/start":
      if (state.phase !== "lobby") return fail("The game has already started.");
      return startQuestion(state, 0, now);

    case "host/next":
      if (state.phase === "question") return fail("Reveal the current question first.");
      return startQuestion(state, state.questionIndex + 1, now);

    case "host/reveal":
      return reveal(state, now);

    case "system/timeUp": {
      const q = state.questions[state.questionIndex];
      if (state.phase !== "question" || q?.id !== action.questionId) return fail("Stale timer.");
      return reveal(state, now);
    }

    case "host/showLeaderboard":
      if (state.phase === "question") return fail("Reveal the current question first.");
      return ok({
        ...state,
        phase: "leaderboard",
        hostLine: SCRIPT.leaderboard(rankPlayers(state.players)[0]?.name ?? null),
      });

    case "host/showMessages":
      if (state.phase === "question") return fail("Reveal the current question first.");
      return ok({ ...state, phase: "messages", hostLine: SCRIPT.messages });

    case "host/startCake":
      if (state.phase === "question") return fail("Reveal the current question first.");
      return ok({
        ...state,
        phase: "cake",
        cake: { candles: LIMITS.candles, blows: 0, perCandle: Math.max(3, state.players.length * 2) },
        hostLine: SCRIPT.cake,
      });

    case "host/finish":
      return ok({
        ...state,
        phase: "finished",
        questionEndsAt: null,
        hostLine: SCRIPT.finished(rankPlayers(state.players)[0]?.name ?? null),
      });

    case "host/reset": {
      // Keep guests and their messages; clear scores and progress.
      const fresh = createRoom(state.code);
      return ok({
        ...fresh,
        rev: state.rev,
        tokens: state.tokens,
        players: state.players.map((p) => ({ ...p, score: 0 })),
        messages: state.messages,
        hostLang: state.hostLang,
      });
    }

    case "host/award": {
      const delta = Math.trunc(Number(action.delta));
      if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > LIMITS.maxAward) return fail("Invalid points.");
      if (!state.players.some((p) => p.id === action.playerId)) return fail("Unknown player.");
      return ok({
        ...state,
        players: state.players.map((p) =>
          p.id === action.playerId ? { ...p, score: Math.max(0, p.score + delta) } : p,
        ),
        scoreLog: [
          ...state.scoreLog,
          { playerId: action.playerId, delta, reason: clean(action.reason, 60) || "host award", at: now },
        ],
      });
    }

    case "host/kick": {
      if (!state.players.some((p) => p.id === action.playerId)) return fail("Unknown player.");
      const answers = { ...state.answers };
      delete answers[action.playerId];
      return ok({
        ...state,
        answers,
        players: state.players.filter((p) => p.id !== action.playerId),
        tokens: Object.fromEntries(Object.entries(state.tokens).filter(([, id]) => id !== action.playerId)),
      });
    }

    case "host/moderate": {
      if (!["pending", "approved", "hidden"].includes(action.status)) return fail("Invalid status.");
      if (!state.messages.some((m) => m.id === action.messageId)) return fail("Unknown message.");
      return ok({
        ...state,
        messages: state.messages.map((m) => (m.id === action.messageId ? { ...m, status: action.status } : m)),
      });
    }

    case "host/setLang":
      if (!["en", "bn", "both"].includes(action.lang)) return fail("Invalid language.");
      return ok({ ...state, hostLang: action.lang });

    default:
      return fail("Unknown action.");
  }
}

/** Project the authoritative state into what one client may see. */
export function viewFor(state: RoomState, role: Role, token: string | null, now: number): RoomView {
  const meId = token ? state.tokens[token] : undefined;
  const me = state.players.find((p) => p.id === meId) ?? null;
  const q = state.phase === "question" || state.phase === "reveal" ? state.questions[state.questionIndex] : undefined;
  const showKey = role === "host" || state.phase === "reveal";
  const tally = q ? q.options.map((_, i) => Object.values(state.answers).filter((a) => a.optionIndex === i).length) : null;

  return {
    role,
    code: state.code,
    phase: state.phase,
    rev: state.rev,
    serverNow: now,
    players: rankPlayers(state.players),
    me,
    totalQuestions: state.questions.length,
    questionIndex: state.questionIndex,
    question: q
      ? {
          id: q.id,
          prompt: q.prompt,
          options: q.options,
          seconds: q.seconds,
          endsAt: state.questionEndsAt,
          correctIndex: showKey ? q.correctIndex : null,
          tally: showKey ? tally : null,
        }
      : null,
    answeredCount: Object.keys(state.answers).length,
    myAnswer: me ? (state.answers[me.id]?.optionIndex ?? null) : null,
    myGain: me && state.phase === "reveal" ? (state.lastGains[me.id] ?? 0) : null,
    lastGains: state.phase === "reveal" || role === "host" ? state.lastGains : {},
    messages: role === "host" ? state.messages : state.messages.filter((m) => m.status === "approved"),
    cake: { candles: state.cake.candles, lit: candlesLit(state.cake) },
    hostLine: state.hostLine,
    hostLang: state.hostLang,
  };
}
