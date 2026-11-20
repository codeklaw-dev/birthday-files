import "server-only";
import { SURVEY_QUESTIONS } from "./survey-content";

/**
 * Games virtual troopers play at their own pace from the invite.
 *
 * Light, generic content (birthday trivia, playful verdicts, opinion
 * questions) so nothing claims a fact about Mez. Swap in personal material
 * whenever you have it.
 * This file holds the answers, so it stays on the server: phones only ever
 * receive the prompts and options (see viewFor in engine.ts).
 */
import type { SoloGameId } from "./types";
export type { SoloGameId };

export interface SoloQuestion {
  prompt: string;
  options: string[];
  /** The right option, or null where there is no right answer (verdicts, survey). */
  correctIndex: number | null;
}

export interface SoloGame {
  /** How points work: per correct answer, by share of guests (survey), or a flat amount per verdict (trial). */
  scoring: "correct" | "survey" | "verdict";
  intro: string;
  questions: SoloQuestion[];
}

export const SOLO_POINTS = { correct: 100, verdict: 25, surveyMax: 100, surveyNoData: 50 } as const;

export const SOLO_GAMES: Record<SoloGameId, SoloGame> = {
  imposter: {
    scoring: "correct",
    intro: "Four choices, one imposter. Spot the fake.",
    questions: [
      {
        prompt: "Which of these is NOT a real birthday tradition?",
        options: ["Candles on a cake", "Singing \"Happy Birthday\"", "Birthday bumps in the UK", "Gifting the birthday person a goldfish"],
        correctIndex: 3,
      },
      {
        prompt: "Spot the fake birthday fact.",
        options: [
          "November's birthstone is topaz",
          "\"Happy Birthday\" started life as \"Good Morning to All\"",
          "Birthday cakes were invented in 2001",
          "Mez's birthday is in November",
        ],
        correctIndex: 2,
      },
      {
        prompt: "One of these isn't a real party game. Which?",
        options: ["Musical chairs", "Pass the parcel", "Pin the tail on the donkey", "Sock the sofa"],
        correctIndex: 3,
      },
    ],
  },
  trial: {
    scoring: "verdict",
    intro: "The charges are read. You are the jury. Guilty or not guilty?",
    questions: [
      { prompt: "Mez stands accused of being far too much fun to party with.", options: ["Guilty", "Not guilty"], correctIndex: null },
      { prompt: "Mez stands accused of stealing the spotlight on her own birthday.", options: ["Guilty", "Not guilty"], correctIndex: null },
      { prompt: "Mez stands accused of making everyone laugh at the worst possible moment.", options: ["Guilty", "Not guilty"], correctIndex: null },
    ],
  },
  survey: {
    scoring: "survey",
    intro: "We asked the party guests what Mez would pick. Guess their most popular answers. The more guests agree with you, the more points.",
    // Same questions the party guests answered; scored against their answers.
    questions: SURVEY_QUESTIONS.map((q) => ({ prompt: q.prompt, options: q.options, correctIndex: null })),
  },
  mystery: {
    scoring: "correct",
    intro: "Something from tonight's party has gone missing. Read the clue and name the item.",
    questions: [
      {
        prompt: "Clue: it has frosting, sprinkles and candles on top. What is it?",
        options: ["A party hat", "The birthday cake", "A balloon", "A present"],
        correctIndex: 1,
      },
      {
        prompt: "Clue: it's tied with string, floats, and goes pop. What is it?",
        options: ["A balloon", "A party popper", "The cake", "A disco ball"],
        correctIndex: 0,
      },
      {
        prompt: "Clue: it hangs from the ceiling and throws sparkles across the room. What is it?",
        options: ["A piñata", "Fairy lights", "A disco ball", "A streamer"],
        correctIndex: 2,
      },
    ],
  },
};
