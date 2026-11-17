import type { PointsConfig, PrizeId } from "./config";
import type { ImposterView } from "./imposter";
import type { MysteryView } from "./mystery";
import type { SurveyView } from "./survey";
import type { TrialView } from "./trial";
import type { AuditEvent, BoardRow, LedgerEntry, Subject, WheelSpin } from "./types";
import type { WkmbView } from "./wkmb";

export type GameView = ImposterView | WkmbView | SurveyView | TrialView | MysteryView;
export type { ImposterView, MysteryView, SurveyView, TrialView, WkmbView };

export interface WheelView {
  allowContact: boolean;
  /** Segments to draw on the TV: the current spin's, or the full list when idle. */
  segments: PrizeId[];
  current: (Omit<WheelSpin, "draw"> & { draw: number }) | null;
  /** Host only: who may spin right now. */
  eligible: (Subject & { board: "live" | "expert"; total: number; rank: number })[];
  /** Host only. */
  history: WheelSpin[];
  /** Player only: this phone is the current recipient and may accept/decline. */
  mine: boolean;
}

export interface GamesView {
  game: GameView | null;
  /** Host only: label for the "next" button (null = waiting on someone else). */
  advanceLabel: string | null;
  boards: { live: BoardRow[]; expert: BoardRow[] };
  wheel: WheelView;
  points: PointsConfig;
  /** Host only. */
  ledger: LedgerEntry[];
  audit: AuditEvent[];
}
