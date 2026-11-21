import "server-only";
import { SOLO_GAMES } from "./solo-content";
import { SURVEY_QUESTIONS } from "./survey-content";
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
  // Then the invite games, played live. Order matters: questions already played keep their place.
  ...SOLO_GAMES.imposter.questions.map((q, i) => live(`imposter-${i + 1}`, "Mez Imposter", q.prompt, q.options, q.correctIndex ?? 0)),
  live("imposter-4", "Mez Imposter", "Which of these is NOT a real way to say happy birthday?", ["Joyeux anniversaire", "Feliz cumpleaños", "Shubho jonmodin", "Happy cakeday-doo"], 3),
  live("imposter-5", "Mez Imposter", "Spot the fake party fact.", ["Balloons were first made from animal bladders", "Party poppers were invented in the 1900s", "Confetti comes from an Italian word", "Disco balls were invented on the Moon"], 3),
  // Mez on Trial: the jury (everyone's phones) decides. Majority verdict wins.
  ...SOLO_GAMES.trial.questions.map((q, i) => crowd(`trial-${i + 1}`, "Mez on Trial", q.prompt, q.options)),
  crowd("trial-4", "Mez on Trial", "Mez stands accused of taking 100 selfies to post just one.", ["Guilty", "Not guilty"]),
  crowd("trial-5", "Mez on Trial", "Mez stands accused of eating the last slice of cake and blaming someone else.", ["Guilty", "Not guilty"]),
  crowd("trial-6", "Mez on Trial", "Mez stands accused of being the best friend anyone could ask for.", ["Guilty", "Not guilty"]),
  // How Well Do You Know Mez? No fixed answers: whatever most of the room picks wins.
  ...SURVEY_QUESTIONS.map((q) => crowd(`know-${q.id}`, "How Well Do You Know Mez?", q.prompt, q.options)),
  {
    id: "majority-1",
    prompt: "What would Mez order for her dream birthday breakfast?",
    options: ["Fluffy pancakes", "A full English", "Croissant and coffee", "Leftover birthday cake"],
    correctIndex: 0,
    seconds: 20,
    round: "How Well Do You Know Mez?",
    crowd: true,
  },
  {
    id: "majority-2",
    prompt: "If Mez were a dessert, she'd be…",
    options: ["Chocolate lava cake", "Strawberry cheesecake", "Rasgulla", "An ice cream sundae"],
    correctIndex: 0,
    seconds: 20,
    round: "How Well Do You Know Mez?",
    crowd: true,
  },
  {
    id: "majority-3",
    prompt: "Mez grabs the karaoke mic. What's she singing?",
    options: ["A Bollywood classic", "A Taylor Swift anthem", "An ABBA banger", "All three, back to back"],
    correctIndex: 0,
    seconds: 20,
    round: "How Well Do You Know Mez?",
    crowd: true,
  },
  {
    id: "majority-4",
    prompt: "What's Mez's secret superpower?",
    options: ["Making everyone laugh", "Finding the best food spots", "Never forgetting a birthday", "Getting ready in five minutes"],
    correctIndex: 0,
    seconds: 20,
    round: "How Well Do You Know Mez?",
    crowd: true,
  },
  {
    id: "majority-5",
    prompt: "Where is Mez's dream holiday?",
    options: ["A beach in the Maldives", "A city break in Paris", "The Swiss mountains", "A road trip with friends"],
    correctIndex: 0,
    seconds: 20,
    round: "How Well Do You Know Mez?",
    crowd: true,
  },
  {
    id: "majority-6",
    prompt: "Which emoji is the most Mez?",
    options: ["😂", "✨", "💅", "🥰"],
    correctIndex: 0,
    seconds: 20,
    round: "How Well Do You Know Mez?",
    crowd: true,
  },
  {
    id: "majority-7",
    prompt: "At a party, Mez is most likely to be…",
    options: ["First on the dance floor", "Taking all the photos", "Chatting in the kitchen", "Hosting like a pro"],
    correctIndex: 0,
    seconds: 20,
    round: "How Well Do You Know Mez?",
    crowd: true,
  },
  {
    id: "majority-8",
    prompt: "Mez in one word?",
    options: ["Iconic", "Sweet", "Chaotic", "Fabulous"],
    correctIndex: 0,
    seconds: 20,
    round: "How Well Do You Know Mez?",
    crowd: true,
  },
  // Mystery Files: read the clue, name the item.
  ...SOLO_GAMES.mystery.questions.map((q, i) => live(`mystery-${i + 1}`, "Mystery Files", q.prompt, q.options, q.correctIndex ?? 0)),
  live("mystery-4", "Mystery Files", "Clue: you wear it on your head and it has a stretchy string under your chin. What is it?", ["A crown", "A party hat", "Headphones", "A tiara"], 1),
  live("mystery-5", "Mystery Files", "Clue: you blow into it, it unrolls with a squeak. What is it?", ["A whistle", "A balloon", "A party blower", "A kazoo"], 2),
];


function live(id: string, round: string, prompt: string, options: string[], correctIndex: number): Question {
  return { id, prompt, options, correctIndex, seconds: 20, round };
}

/** No fixed answer: the most-picked option wins (see reveal in engine.ts). */
function crowd(id: string, round: string, prompt: string, options: string[]): Question {
  return { id, prompt, options, correctIndex: 0, seconds: 20, round, crowd: true };
}
