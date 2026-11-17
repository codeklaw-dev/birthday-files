/** Party facts shared across screens. */
export const EVENT = {
  title: "The Birthday Files",
  edition: "Mez Edition",
  guestOfHonour: "Mez",
  /** Mez turns 24. */
  age: 24,
  /** 21 November 2026. Start time is a placeholder until confirmed. */
  startsAt: "2026-11-21T19:00:00",
  dateLabel: "Saturday 21 November 2026",
  /** Shown to guests. Replace when confirmed. */
  timeLabel: "Evening, exact time to follow",
  venueLabel: "Venue to follow",
  games: [
    { id: "imposter", name: "Mez Imposter", blurb: "One of you is faking it. Spot the imposter." },
    { id: "survey", name: "Mez Survey", blurb: "We asked the guests. Guess the top answers." },
    { id: "trial", name: "Mez on Trial", blurb: "Charges are read. The jury is your phones." },
    { id: "mystery", name: "Mystery Files", blurb: "Photos, clues and memories. Whose file is it?" },
  ],
} as const;
