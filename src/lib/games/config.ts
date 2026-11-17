/**
 * Game rules in one place. Points are shown to everyone on the TV ("How
 * scoring works") and can be changed by the host before a game; every award
 * records which rule produced it, so totals can always be explained.
 */

export const DEFAULT_POINTS = {
  /** Warm-up quiz: correct answer, plus up to this much for speed. */
  quizCorrect: 100,
  quizSpeedMax: 50,
  /** Mez Imposter */
  imposterVotedRight: 100,
  imposterCrewWin: 50,
  imposterEscape: 200,
  imposterWordGuess: 100,
  /** Who Knows Mez Best: per star Mez gives an answer (0–3 stars). Mez Expert board. */
  wkmbPerStar: 50,
  /** Mez Survey: per guest who gave the answer you matched. */
  surveyPerPerson: 10,
  /** Mez on Trial */
  trialJurorMajority: 25,
  trialAccuserGuilty: 50,
  /** Mystery Files: guessing whose exhibit it is. */
  mysteryCorrectGuess: 50,
  /** Largest bonus Mez can give from the judge phone; largest single host correction. */
  judgeBonusMax: 100,
  correctionMax: 500,
} as const;

export type PointsConfig = { -readonly [K in keyof typeof DEFAULT_POINTS]: number };
export const POINT_KEYS = Object.keys(DEFAULT_POINTS) as (keyof PointsConfig)[];

export const POINTS_HELP: Record<keyof PointsConfig, string> = {
  quizCorrect: "Warm-up quiz: correct answer",
  quizSpeedMax: "Warm-up quiz: extra for answering fast (up to)",
  imposterVotedRight: "Imposter: you voted for the imposter",
  imposterCrewWin: "Imposter: every crew member, if the imposter is caught",
  imposterEscape: "Imposter: the imposter escapes",
  imposterWordGuess: "Imposter: the imposter guesses the secret word",
  wkmbPerStar: "Who Knows Mez Best: per star from Mez (Mez Expert board)",
  surveyPerPerson: "Mez Survey: per guest who gave the answer you matched",
  trialJurorMajority: "Mez on Trial: you voted with the majority",
  trialAccuserGuilty: "Mez on Trial: your accusation got a guilty verdict (Mez Expert board)",
  mysteryCorrectGuess: "Mystery Files: you guessed whose exhibit it was",
  judgeBonusMax: "Most Mez can award as a judge's bonus",
  correctionMax: "Largest single host correction",
};

/** Seconds for timed steps. GAME_TIMER_SCALE (e.g. 0.1) speeds everything up for tests. */
export const TIMERS = {
  imposterClues: 60,
  imposterVote: 45,
  surveyGuess: 30,
  trialDefence: 60,
  trialVote: 30,
  mysteryGuess: 30,
} as const;

export function timerMs(key: keyof typeof TIMERS): number {
  const scale = Number(process.env.GAME_TIMER_SCALE ?? process.env.NEXT_PUBLIC_GAME_TIMER_SCALE ?? 1);
  return Math.max(1000, Math.round(TIMERS[key] * 1000 * (Number.isFinite(scale) && scale > 0 ? scale : 1)));
}

export const IMPOSTER = {
  minPlayers: 3,
  /** Two imposters from this many players. */
  twoImpostersFrom: 8,
  clueMax: 24,
  words: [
    { category: "Food", words: ["Biryani", "Fuchka", "Pizza", "Samosa", "Momo", "Mishti doi", "Pancakes", "Sushi"] },
    { category: "Places", words: ["Cox's Bazar", "Sylhet", "Beach", "Airport", "Cinema", "Library", "Gym", "Shopping mall"] },
    { category: "Party things", words: ["Cake", "Balloon", "Candles", "Confetti", "Presents", "Karaoke", "Fairy lights", "Party hat"] },
    { category: "Animals", words: ["Cat", "Elephant", "Tiger", "Penguin", "Goldfish", "Parrot", "Panda", "Dolphin"] },
    { category: "Everyday", words: ["Phone charger", "Umbrella", "Tea", "Alarm clock", "Sunglasses", "Rickshaw", "Selfie", "Headphones"] },
  ],
} as const;

export const SURVEY = { maxAnswersOnBoard: 8, guessMax: 60 } as const;
export const MYSTERY = { maxItems: 10 } as const;

/** Prize wheel. Segments have equal chances; the server draws with crypto randomness. */
export const PRIZES = [
  { id: "high_five", label: "High-five with Mez", short: "High-five", remoteOk: false, contact: false },
  { id: "selfie", label: "Selfie with Mez", short: "Selfie", remoteOk: true, contact: false },
  { id: "photo", label: "Photo with Mez", short: "Photo", remoteOk: false, contact: false },
  { id: "cheers", label: "Cheers with Mez", short: "Cheers!", remoteOk: true, contact: false },
  { id: "speech", label: "One-minute speech for Mez", short: "Speech", remoteOk: true, contact: false },
  { id: "hug", label: "Hug from Mez", short: "Hug", remoteOk: false, contact: true },
] as const;
export type PrizeId = (typeof PRIZES)[number]["id"];

export const WHEEL_RULES = {
  /** Who may spin: the top N of either leaderboard. */
  topN: 3,
  /** Spins per person per night (a declined prize doesn't count). */
  maxSpinsPerPerson: 1,
  /** Spin animation length on the TV. */
  spinMs: 6000,
};
