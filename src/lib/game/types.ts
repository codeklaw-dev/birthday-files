import type { GamesAction } from "@/lib/games/actions";
import type { GamesSlice } from "@/lib/games/types";
import type { GamesView } from "@/lib/games/views";
import type { HostLangMode, HostState, HostView, SfxKind, SpokenLang, UtteranceSource } from "@/lib/host/types";

/**
 * Shared game types. These are transport-agnostic: the same shapes are used by
 * the in-memory mock store today and will map onto Supabase rows/realtime
 * payloads later (see docs/ARCHITECTURE.md).
 */

export type Phase =
  | "lobby"
  | "question"
  | "reveal"
  | "leaderboard"
  | "messages"
  | "cake"
  | "finished"
  | "game"
  | "wheel"
  | "boards";

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
  status: MessageStatus;
  createdAt: number;
}

/** Full authoritative state. Lives on the server only. */
export interface RoomState extends GamesSlice {
  code: string;
  phase: Phase;
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
  cake: { candles: number; blows: number; perCandle: number };
  host: HostState;
  /** Monotonic revision, bumped on every change. */
  rev: number;
}

export type Role = "host" | "display" | "player" | "judge";

/** What a given client is allowed to see. */
export interface RoomView {
  role: Role;
  code: string;
  phase: Phase;
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
  host: HostView;
  games: GamesView;
  /** LAN hints so the display can render a QR code phones can reach. */
  lanHosts?: string[];
}

export type PlayerAction =
  | { type: "join"; token: string; name: string; avatar: string }
  | { type: "answer"; token: string; optionIndex: number }
  | { type: "blow"; token: string }
  | { type: "submitMessage"; author: string; text: string };

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
  | { type: "host/moderate"; messageId: string; status: MessageStatus }
  | { type: "host/setLang"; lang: HostLangMode }
  | { type: "host/setVoice"; enabled: boolean }
  | { type: "host/setAutoQuips"; enabled: boolean }
  | { type: "host/say"; text: Partial<Bilingual>; lang?: SpokenLang; source?: Extract<UtteranceSource, "host" | "llm" | "conversation"> }
  | { type: "host/clip"; clip: string }
  | { type: "host/quip" }
  | { type: "host/replay" }
  | { type: "host/stopSpeech" }
  | { type: "host/sfx"; kind: SfxKind };

/** Fired by the server timer, never accepted from clients. */
export type SystemAction = { type: "system/timeUp"; questionId: string };

export type Action = PlayerAction | HostAction | SystemAction | GamesAction;

export type ActionResult =
  | { ok: true; state: RoomState }
  | { ok: false; error: string };
