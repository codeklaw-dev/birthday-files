import type { Bilingual } from "@/lib/game/types";

/**
 * Mock host script. Later, Casper generates these lines itself; the keys stay
 * as the "cue" vocabulary the game engine emits.
 */
export const SCRIPT = {
  lobby: {
    en: "Welcome to The Birthday Files! Scan the code and open your case file.",
    bn: "দ্য বার্থডে ফাইলস-এ স্বাগতম! কোড স্ক্যান করে আপনার কেস ফাইল খুলুন।",
  },
  question: (n: number, total: number): Bilingual => ({
    en: `Question ${n} of ${total}. Fingers on phones — how well do you know Mez?`,
    bn: `প্রশ্ন ${n}, মোট ${total}টি। ফোন হাতে নিন — মেজকে কতটা চেনেন?`,
  }),
  reveal: (correct: number, answered: number): Bilingual => ({
    en: `Time's up! ${correct} of ${answered} detectives cracked it.`,
    bn: `সময় শেষ! ${answered} জনের মধ্যে ${correct} জন গোয়েন্দা সঠিক উত্তর দিয়েছেন।`,
  }),
  leaderboard: (leader: string | null): Bilingual => ({
    en: leader ? `Here are the standings — ${leader} leads the investigation!` : "Here are the standings!",
    bn: leader ? `এই হলো স্কোরবোর্ড — ${leader} এগিয়ে আছেন!` : "এই হলো স্কোরবোর্ড!",
  }),
  messages: {
    en: "Let's open the evidence locker: your messages for Mez.",
    bn: "চলুন প্রমাণের বাক্স খুলি: মেজের জন্য আপনাদের বার্তা।",
  },
  cake: {
    en: "Cake time! Everybody tap your phones to blow out the candles!",
    bn: "কেকের সময়! সবাই ফোনে ট্যাপ করে মোমবাতি নিভিয়ে দিন!",
  },
  cakeDone: {
    en: "The candles are out — happy birthday, Mez!",
    bn: "মোমবাতি নিভে গেছে — শুভ জন্মদিন, মেজ!",
  },
  finished: (winner: string | null): Bilingual => ({
    en: winner ? `Case closed! Our top detective is ${winner}. Happy birthday, Mez!` : "Case closed! Happy birthday, Mez!",
    bn: winner ? `কেস সমাধান! সেরা গোয়েন্দা ${winner}। শুভ জন্মদিন, মেজ!` : "কেস সমাধান! শুভ জন্মদিন, মেজ!",
  }),
} as const;
