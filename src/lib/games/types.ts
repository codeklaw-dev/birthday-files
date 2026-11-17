import type { Bilingual } from "@/lib/game/types";
import type { Line } from "@/lib/host/types";
import type { PointsConfig, PrizeId } from "./config";

export type GameId = "imposter" | "wkmb" | "survey" | "trial" | "mystery";
export type BoardId = "expert" | "live";

/** Who points belong to: a phone player (live board) or an invite contributor (Mez Expert board). */
export interface Subject {
  kind: "player" | "contributor";
  id: string;
  name: string;
  /** Contributor who isn't attending (takes part remotely). */
  remote?: boolean;
}

/** Append-only. Nothing is ever edited or deleted; corrections are new entries. */
export interface LedgerEntry {
  id: string;
  board: BoardId;
  subject: Subject;
  delta: number;
  /** Which rule produced it (a PointsConfig key, or "correction" / "judge-bonus"). */
  rule: string;
  note: string;
  source: GameId | "quiz" | "host" | "judge";
  by: "system" | "host" | "judge";
  at: number;
  /** For corrections: the entry being corrected, if any. */
  correctsId?: string;
}

export interface Award {
  board: BoardId;
  subject: Subject;
  delta: number;
  rule: keyof PointsConfig;
  note: string;
}

export interface AuditEvent {
  id: string;
  at: number;
  by: "host" | "judge" | "system";
  text: string;
}

export interface BoardRow {
  subject: Subject;
  total: number;
  rank: number;
  remote?: boolean;
}

// ---------- content the server builds from approved invite submissions ----------

export interface ContributorRef {
  id: string;
  name: string;
  remote: boolean;
}

export interface WkmbContent {
  questions: { id: string; prompt: string; answers: { contributor: ContributorRef; text: string }[] }[];
}
export interface SurveyBoard {
  questionId: string;
  prompt: string;
  respondents: number;
  answers: { label: string; count: number; aliases: string[] }[];
}
export interface SurveyContent {
  boards: SurveyBoard[];
}
export interface TrialContent {
  cases: { id: string; charge: string; accuser: ContributorRef }[];
}
export interface MysteryContent {
  items: { id: string; contributor: ContributorRef; kind: "photo" | "video" | "memory"; mediaId?: string; text?: string }[];
}
export type GameContent =
  | { game: "imposter" }
  | { game: "wkmb"; content: WkmbContent }
  | { game: "survey"; content: SurveyContent }
  | { game: "trial"; content: TrialContent }
  | { game: "mystery"; content: MysteryContent };

// ---------- game states ----------

interface Base {
  roundId: string;
  stepEndsAt: number | null;
  startedAt: number;
}

export interface ImposterGame extends Base {
  id: "imposter";
  step: "deal" | "clues" | "cluesShown" | "vote" | "reveal";
  category: string;
  word: string;
  playerIds: string[];
  imposterIds: string[];
  clues: Record<string, string>;
  votes: Record<string, string>;
  wordGuesses: Record<string, string>;
  result: { tally: Record<string, number>; topIds: string[]; caught: boolean; guessedBy: string[] } | null;
}

export interface WkmbGame extends Base {
  id: "wkmb";
  step: "answers" | "scored" | "revealed";
  index: number;
  questions: { id: string; prompt: string; answers: { key: string; contributor: ContributorRef; text: string }[] }[];
  stars: Record<string, number>;
}

export interface SurveyGame extends Base {
  id: "survey";
  step: "guess" | "reveal";
  index: number;
  boards: SurveyBoard[];
  guesses: Record<string, string>;
  matches: Record<string, number | null>;
  revealed: number[];
}

export interface TrialGame extends Base {
  id: "trial";
  step: "charge" | "defence" | "vote" | "verdict";
  index: number;
  cases: TrialContent["cases"];
  plea: "guilty" | "not_guilty" | null;
  votes: Record<string, "guilty" | "not_guilty">;
  verdict: { guilty: number; notGuilty: number; outcome: "guilty" | "not_guilty" | "hung" } | null;
}

export interface MysteryGame extends Base {
  id: "mystery";
  step: "exhibit" | "guess" | "reveal";
  index: number;
  items: MysteryContent["items"];
  suspects: { id: string; name: string }[];
  guesses: Record<string, string>;
  mezGuess: string | null;
  mezRecord: { right: number; total: number };
}

export type GameState = ImposterGame | WkmbGame | SurveyGame | TrialGame | MysteryGame;

// ---------- prize wheel ----------

export interface WheelSpin {
  id: string;
  recipient: Subject;
  segments: PrizeId[];
  index: number;
  prize: PrizeId;
  /** The random draw, recorded for transparency. */
  draw: number;
  at: number;
  status: "offered" | "accepted" | "declined";
  respondedBy?: "recipient" | "host";
}

export interface WheelState {
  allowContact: boolean;
  current: WheelSpin | null;
  history: WheelSpin[];
}

// ---------- setup the host approves before the party ----------

export interface GameSetup {
  survey: Record<string, SurveyBoard & { approvedAt: number }>;
  /** Accusations chosen for the trial (null = every approved one). */
  trialCaseIds: string[] | null;
}

export interface GamesSlice {
  game: GameState | null;
  ledger: LedgerEntry[];
  audit: AuditEvent[];
  points: PointsConfig;
  setup: GameSetup;
  wheel: WheelState;
  judgeKey: string;
}

/** What a game module returns after any change. */
export type Step<G> = { ok: true; game: G; awards?: Award[]; line?: Line; audit?: string } | { ok: false; error: string };

export type { Bilingual };
