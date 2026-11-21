import "server-only";
import { SOLO_GAMES } from "./solo-content";
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
    round: "Birthday Trivia",
  },
  {
    id: "q2",
    prompt: "What is the birthstone for November?",
    options: ["Ruby", "Emerald", "Topaz", "Pearl"],
    correctIndex: 2,
    seconds: 20,
    round: "Birthday Trivia",
  },
  {
    id: "q3",
    prompt: "The tune of \"Happy Birthday\" was first written as a song called…",
    options: ["Good Morning to All", "Hello Little Friend", "Sing Along Today", "Cake for Everyone"],
    correctIndex: 0,
    seconds: 20,
    round: "Birthday Trivia",
  },
  {
    id: "q4",
    prompt: "Which country is usually credited with starting the tradition of candles on birthday cakes?",
    options: ["France", "Japan", "Germany", "Brazil"],
    correctIndex: 2,
    seconds: 20,
    round: "Birthday Trivia",
  },
  // Then the party versions of the invite games, with the same questions.
  ...(["imposter", "mystery"] as const).flatMap((game) =>
    SOLO_GAMES[game].questions.map((q, i) => ({
      id: `${game}-${i + 1}`,
      prompt: q.prompt,
      options: q.options,
      correctIndex: q.correctIndex ?? 0,
      seconds: 20,
      round: game === "imposter" ? "Mez Imposter" : "Mystery Files",
    })),
  ),
  // Mez Majority: no right answer, the room decides. Whatever most people pick wins.
  {
    id: "majority-1",
    prompt: "What would Mez order for her dream birthday breakfast?",
    options: ["Fluffy pancakes", "A full English", "Croissant and coffee", "Leftover birthday cake"],
    correctIndex: 0,
    seconds: 20,
    round: "Mez Majority",
    crowd: true,
  },
  {
    id: "majority-2",
    prompt: "If Mez were a dessert, she'd be…",
    options: ["Chocolate lava cake", "Strawberry cheesecake", "Rasgulla", "An ice cream sundae"],
    correctIndex: 0,
    seconds: 20,
    round: "Mez Majority",
    crowd: true,
  },
  {
    id: "majority-3",
    prompt: "Mez grabs the karaoke mic. What's she singing?",
    options: ["A Bollywood classic", "A Taylor Swift anthem", "An ABBA banger", "All three, back to back"],
    correctIndex: 0,
    seconds: 20,
    round: "Mez Majority",
    crowd: true,
  },
  {
    id: "majority-4",
    prompt: "What's Mez's secret superpower?",
    options: ["Making everyone laugh", "Finding the best food spots", "Never forgetting a birthday", "Getting ready in five minutes"],
    correctIndex: 0,
    seconds: 20,
    round: "Mez Majority",
    crowd: true,
  },
  {
    id: "majority-5",
    prompt: "Where is Mez's dream holiday?",
    options: ["A beach in the Maldives", "A city break in Paris", "The Swiss mountains", "A road trip with friends"],
    correctIndex: 0,
    seconds: 20,
    round: "Mez Majority",
    crowd: true,
  },
  {
    id: "majority-6",
    prompt: "Which emoji is the most Mez?",
    options: ["😂", "✨", "💅", "🥰"],
    correctIndex: 0,
    seconds: 20,
    round: "Mez Majority",
    crowd: true,
  },
  {
    id: "majority-7",
    prompt: "At a party, Mez is most likely to be…",
    options: ["First on the dance floor", "Taking all the photos", "Chatting in the kitchen", "Hosting like a pro"],
    correctIndex: 0,
    seconds: 20,
    round: "Mez Majority",
    crowd: true,
  },
  {
    id: "majority-8",
    prompt: "Mez in one word?",
    options: ["Iconic", "Sweet", "Chaotic", "Fabulous"],
    correctIndex: 0,
    seconds: 20,
    round: "Mez Majority",
    crowd: true,
  },
];

