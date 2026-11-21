import type { MediaItem } from "./media";

/** Ids of the four games (see EVENT.games). */
export type SoloGameId = "imposter" | "trial" | "survey" | "mystery";

/**
 * Shared game types. These are transport-agnostic: the same shapes are used by
 * the in-memory mock store today and will map onto Supabase rows/realtime
 * payloads later (see docs/ARCHITECTURE.md).
 */

export type Phase =
  | "lobby"
  | "premiere"
  | "question"
  | "reveal"
  | "leaderboard"
  | "messages"
  | "cake"
  | "finished";

export type Lang = "en" | "bn";
export type Bilingual = Record<Lang, string>;

export interface Question {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  /** Seconds players get to answer. */
  seconds: number;
}

export interface Player {
  /** Public id — safe to broadcast. */
  id: string;
  name: string;
  avatar: string;
  score: number;
  joinedAt: number;
  /** A virtual trooper, playing from afar. Only they get the at-your-own-pace games. */
  remote?: boolean;
}

export interface Answer {
  optionIndex: number;
  at: number;
}

export type MessageStatus = "pending" | "approved" | "hidden";

export interface GuestMessage {
  id: string;
  author: string;
  text: string;
  /** Optional profile picture (small data URL) so the room knows who sent it. */
  photo?: string;
  /** Photos or a video the guest uploaded with the wish. */
  media?: MediaItem[];
  status: MessageStatus;
  createdAt: number;
}

export interface ScoreEvent {
  playerId: string;
  delta: number;
  reason: string;
  at: number;
}

/** Full authoritative state. Lives on the server only. */
export interface RoomState {
  code: string;
  phase: Phase;
  /** Premiere slideshow position. */
  slide?: number;
  players: Player[];
  /** Secret player token -> public player id. Never broadcast. */
  tokens: Record<string, string>;
  questions: Question[];
  questionIndex: number;
  questionStartedAt: number | null;
  questionEndsAt: number | null;
  /** Answers for the current question, keyed by public player id. */
  answers: Record<string, Answer>;
  /** Points awarded for the current question, keyed by public player id. */
  lastGains: Record<string, number>;
  messages: GuestMessage[];
  scoreLog: ScoreEvent[];
  /** Party guests' before-the-party answers, keyed by their phone's secret token. */
  surveyResponses: Record<string, SurveyResponse>;
  /** Virtual troopers' finished solo games, keyed by public player id, then game id. */
  solo: Record<string, Partial<Record<SoloGameId, SoloRecord>>>;
  cake: { candles: number; blows: number; perCandle: number };
  hostLine: Bilingual;
  hostLang: Lang | "both";
  /** Monotonic revision, bumped on every change. */
  rev: number;
}

export interface SurveyResponse {
  name: string;
  /** Chosen option per SURVEY_QUESTIONS entry. */
  answers: number[];
  at: number;
}

export interface SoloRecord {
  answers: number[];
  points: number;
  at: number;
}

/** A solo game as a virtual trooper's phone receives it: prompts and options, never the answers. */
export interface SoloGameView {
  intro: string;
  scoring: "correct" | "survey" | "verdict";
  questions: { prompt: string; options: string[] }[];
}

/** A finished solo game, with the answers revealed. */
export interface SoloOutcome {
  answers: number[];
  points: number;
  items: {
    /** The right option, where there is one. */
    correctIndex: number | null;
    /** Percentage of guests (survey) or jurors (trial) per option, where it applies. */
    shares: number[] | null;
  }[];
}

export type Role = "host" | "display" | "player";

/** What a given client is allowed to see. */
export interface RoomView {
  role: Role;
  code: string;
  phase: Phase;
  /** Premiere slideshow position. */
  slide: number;
  rev: number;
  serverNow: number;
  players: Player[];
  me: Player | null;
  totalQuestions: number;
  questionIndex: number;
  question: {
    id: string;
    prompt: string;
    options: string[];
    seconds: number;
    endsAt: number | null;
    /** Only present for the host, or for everyone once revealed. */
    correctIndex: number | null;
    /** Per-option answer counts — only once revealed (or for host). */
    tally: number[] | null;
  } | null;
  answeredCount: number;
  myAnswer: number | null;
  myGain: number | null;
  lastGains: Record<string, number>;
  /** Approved messages for everyone; all messages for the host. */
  messages: GuestMessage[];
  cake: { candles: number; lit: number };
  hostLine: Bilingual;
  hostLang: Lang | "both";
  /** Virtual troopers only: the at-your-own-pace games and their results so far. */
  solo: { games: Record<SoloGameId, SoloGameView>; results: Partial<Record<SoloGameId, SoloOutcome>> } | null;
  /** Host only: how party guests answered the before-the-party questions. */
  survey: { responses: number; tallies: number[][] } | null;
  /** LAN hints so the display can render a QR code phones can reach. */
  lanHosts?: string[];
}

export type PlayerAction =
  | { type: "join"; token: string; name: string; avatar: string; remote?: boolean }
  /** The TV's "Launch party" button: lobby → premiere only, so it needs no key. */
  | { type: "launch" }
  | { type: "survey/submit"; token: string; name: string; answers: number[] }
  | { type: "solo/submit"; token: string; game: SoloGameId; answers: number[] }
  | { type: "answer"; token: string; optionIndex: number }
  | { type: "blow"; token: string }
  | { type: "submitMessage"; author: string; text: string; photo?: string | null; media?: MediaItem[] | null };

export type HostAction =
  | { type: "host/start" }
  | { type: "host/reveal" }
  | { type: "host/next" }
  | { type: "host/showMessages" }
  | { type: "host/showLeaderboard" }
  | { type: "host/startCake" }
  | { type: "host/finish" }
  | { type: "host/reset" }
  | { type: "host/award"; playerId: string; delta: number; reason?: string }
  | { type: "host/kick"; playerId: string }
  | { type: "host/premiere" }
  | { type: "host/slide"; index: number }
  | { type: "host/moderate"; messageId: string; status: MessageStatus }
  | { type: "host/setLang"; lang: Lang | "both" };

/** Fired by the server timer, never accepted from clients. */
export type SystemAction = { type: "system/timeUp"; questionId: string };

export type Action = PlayerAction | HostAction | SystemAction;

export type ActionResult =
  | { ok: true; state: RoomState }
  | { ok: false; error: string };
