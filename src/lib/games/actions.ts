import type { PointsConfig } from "./config";
import type { BoardId, GameContent, GameId, Subject, SurveyBoard } from "./types";

export type GamesPlayerAction =
  | { type: "game/clue"; token: string; text: string }
  | { type: "game/vote"; token: string; choice: string }
  | { type: "game/guess"; token: string; text: string }
  | { type: "wheel/respond"; token: string; accept: boolean };

/** Only accepted with Mez's judge key. */
export type JudgeAction =
  | { type: "judge/score"; key: string; stars: number }
  | { type: "judge/lock" }
  | { type: "judge/plea"; plea: "guilty" | "not_guilty" }
  | { type: "judge/rest" }
  | { type: "judge/guess"; suspectId: string }
  | { type: "judge/bonus"; board: BoardId; subject: Pick<Subject, "kind" | "id">; delta: number; reason: string }
  | { type: "judge/allowContact"; allowed: boolean };

export type GamesHostAction =
  /** `content` is always built by the server from approved submissions; anything a client sends is replaced. */
  | { type: "host/game/start"; game: GameId; content?: GameContent }
  | { type: "host/game/advance" }
  | { type: "host/game/extend"; seconds: number }
  | { type: "host/game/endTimer" }
  | { type: "host/game/abort" }
  | { type: "host/game/reveal"; index?: number }
  | { type: "host/game/accept"; playerId: string; answerIndex: number }
  | { type: "host/correct"; board: BoardId; subject: Subject; delta: number; reason: string; correctsId?: string }
  | { type: "host/points"; points: Partial<PointsConfig> }
  | { type: "host/setup/survey"; questionId: string; board: SurveyBoard | null }
  | { type: "host/setup/trial"; caseIds: string[] | null }
  | { type: "host/wheel/show" }
  | { type: "host/wheel/spin"; subject: Pick<Subject, "kind" | "id"> }
  | { type: "host/wheel/respond"; accept: boolean }
  | { type: "host/showBoards" };

export type GamesSystemAction = { type: "system/gameTimeUp"; roundId: string; step: string };

export type GamesAction = GamesPlayerAction | JudgeAction | GamesHostAction | GamesSystemAction;
