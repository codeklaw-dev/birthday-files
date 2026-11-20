import "server-only";
import type { Question } from "./types";

/**
 * Live party quiz: general birthday trivia (no claims about Mez beyond her
 * birthday month). Swap in personal Mez trivia whenever you have it.
 */
export const MOCK_QUESTIONS: Question[] = [
  {
    id: "q1",
    prompt: "Mez's birthday is in which month?",
    options: ["October", "November", "December", "January"],
    correctIndex: 1,
    seconds: 20,
  },
  {
    id: "q2",
    prompt: "What is the birthstone for November?",
    options: ["Ruby", "Emerald", "Topaz", "Pearl"],
    correctIndex: 2,
    seconds: 20,
  },
  {
    id: "q3",
    prompt: "The tune of \"Happy Birthday\" was first written as a song called…",
    options: ["Good Morning to All", "Hello Little Friend", "Sing Along Today", "Cake for Everyone"],
    correctIndex: 0,
    seconds: 20,
  },
  {
    id: "q4",
    prompt: "Which country is usually credited with starting the tradition of candles on birthday cakes?",
    options: ["France", "Japan", "Germany", "Brazil"],
    correctIndex: 2,
    seconds: 20,
  },
];

