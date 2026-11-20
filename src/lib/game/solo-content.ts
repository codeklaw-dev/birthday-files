import "server-only";
import { SURVEY_QUESTIONS } from "./survey-content";

/**
 * Games virtual troopers play at their own pace from the invite.
 *
 * SAMPLE CONTENT: replace every [Sample] line with real Mez material.
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
    intro: "Three statements about Mez. One of them is an imposter. Spot the fake.",
    questions: [
      {
        prompt: "[Sample] Which of these is NOT true about Mez?",
        options: ["She loves rainy days", "She has never seen snow", "She can't whistle", "She hates chocolate"],
        correctIndex: 3,
      },
      {
        prompt: "[Sample] Spot the imposter fact.",
        options: ["She learned to swim at 25", "She once met a celebrity", "She can't stand spicy food", "She sings in the shower"],
        correctIndex: 2,
      },
      {
        prompt: "[Sample] One of these never happened. Which?",
        options: ["She got lost on a school trip", "She won a dance contest", "She cooked for 30 people", "She ran a marathon"],
        correctIndex: 3,
      },
    ],
  },
  trial: {
    scoring: "verdict",
    intro: "The charges are read. You are the jury. Guilty or not guilty?",
    questions: [
      { prompt: "[Sample] Mez is charged with replying to messages three days late.", options: ["Guilty", "Not guilty"], correctIndex: null },
      { prompt: "[Sample] Mez is charged with taking 200 photos to choose one.", options: ["Guilty", "Not guilty"], correctIndex: null },
      { prompt: "[Sample] Mez is charged with saying \"five more minutes\" and meaning an hour.", options: ["Guilty", "Not guilty"], correctIndex: null },
    ],
  },
  survey: {
    scoring: "survey",
    intro: "We asked the party guests about Mez. Guess their most popular answers. The more guests agree with you, the more points.",
    // Same questions the party guests answered; scored against their answers.
    questions: SURVEY_QUESTIONS.map((q) => ({ prompt: q.prompt, options: q.options, correctIndex: null })),
  },
  mystery: {
    scoring: "correct",
    intro: "A clue from the files. Whose story is it?",
    questions: [
      {
        prompt: "[Sample] \"This person taught Mez how to ride a bike.\" Whose file is it?",
        options: ["Her mum", "Her best friend", "Her cousin", "Her dad"],
        correctIndex: 3,
      },
      {
        prompt: "[Sample] \"Mez and this person once missed a flight together.\" Whose file is it?",
        options: ["Her sister", "Her best friend", "Her colleague", "Her partner"],
        correctIndex: 1,
      },
    ],
  },
};
