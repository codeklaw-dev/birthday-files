import type { Bilingual } from "@/lib/game/types";

/** "All the cool stuff that happened on 21 November 2022": premiere slides Casper narrates. */
export interface FlashbackFact {
  emoji: string;
  kicker: string;
  title: string;
  body: string;
  line: Bilingual;
  cover?: boolean;
}

export const FLASHBACK_DATE = "21 November 2022";

export const FLASHBACK: FlashbackFact[] = [
  {
    cover: true,
    emoji: "⏪",
    kicker: "Flashback",
    title: "All the cool stuff that happened on 21 November 2022",
    body: "Let's rewind the clock and see what the world was up to.",
    line: {
      en: "Time for a little time travel! Here's all the cool stuff that happened on the 21st of November, 2022.",
      bn: "এবার একটু টাইম ট্রাভেল! চলুন দেখি ২০২২ সালের ২১শে নভেম্বর কী কী মজার ঘটনা ঘটেছিল।",
    },
  },
  {
    emoji: "🚀",
    kicker: "Space",
    title: "A spaceship buzzed the Moon",
    body: "NASA's Orion capsule (Artemis I) swooped about 130 km (81 miles) above the Moon's surface, its closest pass of the whole mission, and snapped photos of Earth setting behind the Moon.",
    line: {
      en: "In space, NASA's Orion capsule swooped just 130 kilometres above the Moon, and snapped photos of Earth setting behind it!",
      bn: "মহাকাশে, নাসার ওরিয়ন ক্যাপসুল চাঁদের মাত্র ১৩০ কিলোমিটার উপর দিয়ে উড়ে গিয়েছিল, আর চাঁদের পেছনে পৃথিবী ডুবে যাওয়ার ছবি তুলেছিল!",
    },
  },
  {
    emoji: "⚽",
    kicker: "World Cup, Qatar",
    title: "England scored six",
    body: "England beat Iran 6–2 in their first game of the World Cup. Bukayo Saka scored twice and 19-year-old Jude Bellingham got his first goal for England.",
    line: {
      en: "At the World Cup in Qatar, England beat Iran six goals to two. Bukayo Saka scored twice!",
      bn: "কাতার বিশ্বকাপে ইংল্যান্ড ইরানকে ছয়-দুই গোলে হারিয়েছিল। বুকায়ো সাকা দুটি গোল করেছিলেন!",
    },
  },
  {
    emoji: "🐉",
    kicker: "World Cup, Qatar",
    title: "Wales were back after 64 years",
    body: "Wales played their first World Cup match since 1958, and Gareth Bale's late penalty earned a 1–1 draw with the USA. The Netherlands also beat Senegal 2–0 that day.",
    line: {
      en: "And Wales played their first World Cup match in sixty-four years. Gareth Bale scored a late penalty to draw one-all with the USA!",
      bn: "আর ওয়েলস চৌষট্টি বছর পর বিশ্বকাপে খেলেছিল। গ্যারেথ বেলের শেষ মুহূর্তের পেনাল্টিতে যুক্তরাষ্ট্রের সাথে এক-এক ড্র!",
    },
  },
  {
    emoji: "👋",
    kicker: "Every 21 November",
    title: "It was World Hello Day",
    body: "21 November is World Hello Day, when everyone is invited to say hello to at least ten people. It's World Television Day too, so you're right on theme tonight!",
    line: {
      en: "And the 21st of November is World Hello Day! So everyone, turn to the people around you and say hello!",
      bn: "আর ২১শে নভেম্বর হলো বিশ্ব হ্যালো দিবস! তাই সবাই, আশেপাশের মানুষদের দিকে ফিরে হ্যালো বলুন!",
    },
  },
];
