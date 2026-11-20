import { SCRIPT } from "@/lib/casper/script";
import { isMediaItem, MAX_MEDIA_PER_WISH } from "./media";
import { MOCK_QUESTIONS } from "./mock-data";
import { SOLO_GAMES, SOLO_POINTS } from "./solo-content";
import { SURVEY_QUESTIONS } from "./survey-content";
import type {
  Action,
  ActionResult,
  GuestMessage,
  Player,
  Role,
  RoomState,
  RoomView,
  SoloGameId,
  SoloOutcome,
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
  maxSurveyResponses: 300,
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
    surveyResponses: {},
    solo: {},
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
      const remote = action.remote === true;
      if (existingId) {
        return ok({
          ...state,
          players: state.players.map((p) =>
            p.id === existingId ? { ...p, name: unique, avatar, ...((remote || p.remote) && { remote: true }) } : p,
          ),
        });
      }
      if (state.players.length >= LIMITS.maxPlayers) return fail("The room is full.");
      const id = ctx.newId();
      return ok({
        ...state,
        tokens: { ...state.tokens, [token]: id },
        players: [...state.players, { id, name: unique, avatar, score: 0, joinedAt: now, ...(remote && { remote: true }) }],
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

    case "survey/submit": {
      const token = clean(action.token, 64);
      const name = clean(action.name, LIMITS.nameLength);
      if (token.length < 8) return fail("Invalid player token.");
      if (!name) return fail("Please add your name.");
      if (!validAnswers(action.answers, SURVEY_QUESTIONS.map((q) => q.options.length))) return fail("Please answer every question.");
      if (!state.surveyResponses[token] && Object.keys(state.surveyResponses).length >= LIMITS.maxSurveyResponses) {
        return fail("We already have plenty of answers. Thank you!");
      }
      return ok({
        ...state,
        surveyResponses: { ...state.surveyResponses, [token]: { name, answers: [...action.answers], at: now } },
      });
    }

    case "solo/submit": {
      const playerId = state.tokens[action.token];
      const player = state.players.find((p) => p.id === playerId);
      if (!player) return fail("Join the game first.");
      if (!player.remote) return fail("This game is played live at the party.");
      const game = SOLO_GAMES[action.game];
      if (!game || !Object.hasOwn(SOLO_GAMES, action.game)) return fail("Unknown game.");
      if (state.solo[player.id]?.[action.game]) return fail("You've already played this one.");
      if (!validAnswers(action.answers, game.questions.map((q) => q.options.length))) return fail("Please answer every question.");
      const points = soloPoints(state, action.game, action.answers);
      return ok({
        ...state,
        players: state.players.map((p) => (p.id === player.id ? { ...p, score: p.score + points } : p)),
        solo: {
          ...state.solo,
          [player.id]: { ...state.solo[player.id], [action.game]: { answers: [...action.answers], points, at: now } },
        },
        scoreLog: points ? [...state.scoreLog, { playerId: player.id, delta: points, reason: `solo:${action.game}`, at: now }] : state.scoreLog,
      });
    }

    case "submitMessage": {
      const author = clean(action.author, LIMITS.nameLength);
      const text = clean(action.text, LIMITS.messageLength);
      if (!author) return fail("Please add your name.");
      const media = action.media ?? [];
      if (!Array.isArray(media) || media.length > MAX_MEDIA_PER_WISH || !media.every(isMediaItem)) {
        return fail("Those photos or videos couldn't be attached. Try uploading them again.");
      }
      if (media.length === 0 && text.length < 2) return fail("Please write a message.");
      if (state.messages.length >= LIMITS.maxMessages) return fail("The message wall is full.");
      const photo = action.photo ?? undefined;
      if (photo !== undefined && !isPhotoDataUrl(photo)) return fail("That profile picture couldn't be used. Try another photo.");
      const message: GuestMessage = { id: ctx.newId(), author, text, status: "pending", createdAt: now, ...(photo && { photo }), ...(media.length > 0 && { media: media.map(({ kind, url }) => ({ kind, url })) }) };
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
        // Points from at-your-own-pace games were earned before the show; keep them.
        players: state.players.map((p) => ({ ...p, score: soloTotal(state, p.id) })),
        messages: state.messages,
        surveyResponses: state.surveyResponses,
        solo: state.solo,
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

function validAnswers(answers: unknown, optionCounts: number[]): answers is number[] {
  return (
    Array.isArray(answers) &&
    answers.length === optionCounts.length &&
    answers.every((a, i) => Number.isInteger(a) && a >= 0 && a < optionCounts[i])
  );
}

/** How many party guests picked each option, per before-the-party question. */
function surveyTallies(state: RoomState): number[][] {
  const tallies = SURVEY_QUESTIONS.map((q) => q.options.map(() => 0));
  for (const r of Object.values(state.surveyResponses)) r.answers.forEach((a, i) => tallies[i] && tallies[i][a]++);
  return tallies;
}

/** How the virtual jury has voted on each charge so far. */
function trialTallies(state: RoomState): number[][] {
  const tallies = SOLO_GAMES.trial.questions.map((q) => q.options.map(() => 0));
  for (const games of Object.values(state.solo)) games.trial?.answers.forEach((a, i) => tallies[i] && tallies[i][a]++);
  return tallies;
}

const percentages = (counts: number[]) => {
  const total = counts.reduce((a, b) => a + b, 0);
  return counts.map((c) => (total ? Math.round((c / total) * 100) : 0));
};

function soloPoints(state: RoomState, game: SoloGameId, answers: number[]): number {
  const g = SOLO_GAMES[game];
  if (g.scoring === "verdict") return answers.length * SOLO_POINTS.verdict;
  if (g.scoring === "correct") return answers.filter((a, i) => a === g.questions[i].correctIndex).length * SOLO_POINTS.correct;
  // Survey: points in proportion to how many party guests gave the same answer.
  const tallies = surveyTallies(state);
  return answers.reduce((sum, a, i) => {
    const total = tallies[i].reduce((x, y) => x + y, 0);
    return sum + (total ? Math.round((tallies[i][a] / total) * SOLO_POINTS.surveyMax) : SOLO_POINTS.surveyNoData);
  }, 0);
}

function soloTotal(state: RoomState, playerId: string): number {
  return Object.values(state.solo[playerId] ?? {}).reduce((sum, r) => sum + (r?.points ?? 0), 0);
}

function soloView(state: RoomState, playerId: string): RoomView["solo"] {
  const games = Object.fromEntries(
    (Object.keys(SOLO_GAMES) as SoloGameId[]).map((id) => {
      const g = SOLO_GAMES[id];
      return [id, { intro: g.intro, scoring: g.scoring, questions: g.questions.map(({ prompt, options }) => ({ prompt, options })) }];
    }),
  ) as Record<SoloGameId, NonNullable<RoomView["solo"]>["games"][SoloGameId]>;
  const results: Partial<Record<SoloGameId, SoloOutcome>> = {};
  const mine = state.solo[playerId] ?? {};
  for (const id of Object.keys(mine) as SoloGameId[]) {
    const rec = mine[id]!;
    const g = SOLO_GAMES[id];
    const tallies = g.scoring === "survey" ? surveyTallies(state) : g.scoring === "verdict" ? trialTallies(state) : null;
    results[id] = {
      answers: rec.answers,
      points: rec.points,
      items: g.questions.map((q, i) => ({ correctIndex: q.correctIndex, shares: tallies ? percentages(tallies[i]) : null })),
    };
  }
  return { games, results };
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
    // Wishes stay off guests' phones: the host sees all, the TV only approved ones.
    messages: role === "host" ? state.messages : role === "display" ? state.messages.filter((m) => m.status === "approved") : [],
    solo: role === "player" && me?.remote ? soloView(state, me.id) : null,
    survey: role === "host" ? { responses: Object.keys(state.surveyResponses).length, tallies: surveyTallies(state) } : null,
    cake: { candles: state.cake.candles, lit: candlesLit(state.cake) },
    hostLine: state.hostLine,
    hostLang: state.hostLang,
  };
}
