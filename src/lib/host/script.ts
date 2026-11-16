import type { Bilingual } from "@/lib/game/types";
import { PERSONA } from "./persona";
import type { Line } from "./types";

/**
 * The host's scripted lines.
 *
 * STATIC lines never change, so they can be pre-recorded once
 * (`npm run narration:render`) and played instantly with no network.
 * DYNAMIC lines include names or numbers; they are spoken by live cloud TTS
 * and fall back to a static clip with the same meaning if that fails.
 *
 * Bangla text was written by the developer and should be checked by a
 * native speaker before the party.
 */
export const CLIPS = {
  lobby_welcome: {
    en: `Welcome to The Birthday Files! I'm ${PERSONA.name.en}, your host. Scan the code on screen and open your case file.`,
    bn: `দ্য বার্থডে ফাইলস-এ স্বাগতম! আমি ${PERSONA.name.bn}, আজকের উপস্থাপক। স্ক্রিনের কোডটি স্ক্যান করে আপনার কেস ফাইল খুলুন।`,
  },
  lobby_filler: {
    en: "Still waiting for a few detectives. Don't worry, Mez has waited years for this.",
    bn: "আরও কয়েকজন গোয়েন্দার অপেক্ষায় আছি। চিন্তা নেই, মেজ এই দিনের জন্য বছরের পর বছর অপেক্ষা করেছে।",
  },
  show_start: {
    en: "Phones up, detectives. The investigation into Mez begins now!",
    bn: "গোয়েন্দারা, ফোন হাতে নিন। মেজকে নিয়ে তদন্ত এখনই শুরু!",
  },
  question_generic: {
    en: "New evidence on screen. Fingers on phones. How well do you really know Mez?",
    bn: "স্ক্রিনে নতুন প্রমাণ। ফোন হাতে নিন। মেজকে আসলে কতটা চেনেন?",
  },
  question_last: {
    en: "Final question! Make it count.",
    bn: "শেষ প্রশ্ন! ভেবেচিন্তে উত্তর দিন।",
  },
  time_warning: {
    en: "Five seconds left!",
    bn: "আর মাত্র পাঁচ সেকেন্ড!",
  },
  reveal_generic: {
    en: "Time's up! Let's see who cracked the case.",
    bn: "সময় শেষ! দেখি কে কেসটা সমাধান করলেন।",
  },
  reveal_nobody: {
    en: "Nobody got it. Mez remains a mystery.",
    bn: "কেউই পারলেন না। মেজ এখনও এক রহস্য।",
  },
  reveal_everyone: {
    en: "Everyone got it! Mez, you are an open book.",
    bn: "সবাই পেরেছেন! মেজ, তুমি তো খোলা বইয়ের মতো।",
  },
  leaderboard_generic: {
    en: "Here are the standings. Some of you should be worried.",
    bn: "এই হলো স্কোরবোর্ড। কারও কারও একটু চিন্তা করা উচিত।",
  },
  messages_intro: {
    en: "Let's open the evidence locker: your messages for Mez.",
    bn: "চলুন প্রমাণের বাক্স খুলি: মেজের জন্য আপনাদের বার্তা।",
  },
  cake_intro: {
    en: "Cake time! Everybody tap your phones to blow out the candles!",
    bn: "কেকের সময়! সবাই ফোনে ট্যাপ করে মোমবাতি নিভিয়ে দিন!",
  },
  cake_done: {
    en: "The candles are out. Happy birthday, Mez!",
    bn: "মোমবাতি নিভে গেছে। শুভ জন্মদিন, মেজ!",
  },
  finale_generic: {
    en: "Case closed! Thank you, detectives. Happy birthday, Mez!",
    bn: "কেস সমাধান! ধন্যবাদ, গোয়েন্দারা। শুভ জন্মদিন, মেজ!",
  },
  happy_birthday: {
    en: "Happy birthday, Mez!",
    bn: "শুভ জন্মদিন, মেজ!",
  },
  applause: {
    en: "Give it up for our detectives!",
    bn: "গোয়েন্দাদের জন্য জোরে হাততালি!",
  },
  tech_trouble: {
    en: "One moment. My circuits need a cup of tea.",
    bn: "এক মিনিট। আমার সার্কিটের এক কাপ চা দরকার।",
  },
  quip_1: {
    en: "I have analysed all the evidence, and Mez is guilty of being fabulous.",
    bn: "সব প্রমাণ বিশ্লেষণ করে দেখলাম, মেজ অসাধারণ হওয়ার অপরাধে দোষী।",
  },
  quip_2: {
    en: "Some of these answers were so wrong, even my algorithm is embarrassed.",
    bn: "কিছু উত্তর এতটাই ভুল যে আমার অ্যালগরিদমও লজ্জা পাচ্ছে।",
  },
  quip_3: {
    en: "Fun fact: I'm an AI, and even I remember Mez's birthday better than some of you.",
    bn: "মজার তথ্য: আমি একটা এআই, তবুও আপনাদের কারও কারও চেয়ে মেজের জন্মদিন আমার ভালো মনে থাকে।",
  },
  quip_4: {
    en: "If friendship were scored like this quiz, a few of you would need a recount.",
    bn: "বন্ধুত্বের নম্বর যদি এই কুইজের মতো হতো, তাহলে কয়েকজনের আবার গণনা লাগত।",
  },
  quip_5: {
    en: "Don't worry, the leaderboard is temporary. The embarrassment is forever.",
    bn: "চিন্তা নেই, স্কোরবোর্ড ক্ষণস্থায়ী। কিন্তু লজ্জাটা চিরস্থায়ী।",
  },
  quip_6: {
    en: "Mez, another year older, and still the main character.",
    bn: "মেজ, আরও এক বছর বড় হলে, তবুও গল্পের নায়ক তুমিই।",
  },
} satisfies Record<string, Bilingual>;

export type ClipKey = keyof typeof CLIPS;
export const CLIP_KEYS = Object.keys(CLIPS) as ClipKey[];
export const QUIP_KEYS = CLIP_KEYS.filter((k) => k.startsWith("quip_"));

const stat = (key: ClipKey, cue: string = key, bigMoment = false): Line => ({ cue, text: CLIPS[key], clip: key, bigMoment });

export const LINES = {
  lobby: () => stat("lobby_welcome", "lobby", true),
  question: (n: number, total: number): Line =>
    n === 1
      ? { ...stat("show_start", "question") }
      : {
          cue: "question",
          text: {
            en: `Question ${n} of ${total}. ${n === total ? "Final one, make it count!" : "Fingers on phones."}`,
            bn: `প্রশ্ন ${n}, মোট ${total}টির মধ্যে। ${n === total ? "শেষ প্রশ্ন, ভেবেচিন্তে!" : "ফোন হাতে নিন।"}`,
          },
          fallbackClip: n === total ? "question_last" : "question_generic",
        },
  reveal: (correct: number, answered: number, fastest: string | null): Line => {
    if (answered === 0 || correct === 0) return stat("reveal_nobody", "reveal");
    if (correct === answered && answered > 1) return stat("reveal_everyone", "reveal");
    return {
      cue: "reveal",
      text: {
        en: `Time's up! ${correct} of ${answered} detectives cracked it.${fastest ? ` ${fastest} was the fastest.` : ""}`,
        bn: `সময় শেষ! ${answered} জনের মধ্যে ${correct} জন সঠিক উত্তর দিয়েছেন।${fastest ? ` সবচেয়ে দ্রুত ছিলেন ${fastest}।` : ""}`,
      },
      fallbackClip: "reveal_generic",
    };
  },
  leaderboard: (leader: string | null): Line =>
    leader
      ? {
          cue: "leaderboard",
          text: {
            en: `Here are the standings. ${leader} leads the investigation!`,
            bn: `এই হলো স্কোরবোর্ড। তদন্তে এগিয়ে আছেন ${leader}!`,
          },
          fallbackClip: "leaderboard_generic",
        }
      : stat("leaderboard_generic", "leaderboard"),
  messages: () => stat("messages_intro", "messages"),
  cake: () => stat("cake_intro", "cake"),
  cakeDone: () => stat("cake_done", "cakeDone", true),
  finished: (winner: string | null): Line =>
    winner
      ? {
          cue: "finished",
          text: {
            en: `Case closed! Our top detective is ${winner}. Happy birthday, Mez!`,
            bn: `কেস সমাধান! আজকের সেরা গোয়েন্দা ${winner}। শুভ জন্মদিন, মেজ!`,
          },
          fallbackClip: "finale_generic",
          bigMoment: true,
        }
      : stat("finale_generic", "finished", true),
  quip: (n: number): Line => stat(QUIP_KEYS[n % QUIP_KEYS.length], "quip"),
  clip: (key: ClipKey): Line => stat(key, key.startsWith("quip_") ? "quip" : "clip"),
};
