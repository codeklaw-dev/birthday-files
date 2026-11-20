import "server-only";
import type { Question } from "./types";

/**
 * MOCK CONTENT — placeholder questions so the prototype is playable.
 * Replace with real Mez trivia (eventually loaded from Supabase).
 */
export const MOCK_QUESTIONS: Question[] = [
  {
    id: "q1",
    prompt: "[Mock] What is Mez most likely to order at 2am?",
    options: ["Biryani", "Pizza", "Instant noodles", "Just more tea"],
    correctIndex: 0,
    seconds: 20,
  },
  {
    id: "q2",
    prompt: "[Mock] Which of these would Mez never leave home without?",
    options: ["Headphones", "Sunglasses", "A phone charger", "Snacks"],
    correctIndex: 2,
    seconds: 20,
  },
  {
    id: "q3",
    prompt: "[Mock] Mez's reaction to a surprise party is…",
    options: ["Happy tears", "Suspicious squint", "Instant dance", "\"I knew it!\""],
    correctIndex: 3,
    seconds: 20,
  },
  {
    id: "q4",
    prompt: "[Mock] What is Mez's hidden talent?",
    options: ["Karaoke", "Parallel parking", "Remembering birthdays", "Winning arguments"],
    correctIndex: 3,
    seconds: 20,
  },
];

