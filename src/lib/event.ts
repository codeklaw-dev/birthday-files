/** Party facts shared across screens. */
export const EVENT = {
  title: "The Birthday Files",
  edition: "Mez Edition",
  guestOfHonour: "Mez",
  /** Midnight UK time as Friday 20 turns into Saturday 21 November (UK is on GMT, UTC+0, in November). */
  startsAt: "2026-11-21T00:00:00Z",
  dateLabel: "Midnight tonight · Friday 20 → Saturday 21 November (UK time)",
  games: [
    { id: "imposter", name: "Mez Imposter", blurb: "One of these is a fake. Spot the imposter." },
    { id: "trial", name: "Mez on Trial", blurb: "Charges are read. The jury is your phones." },
    { id: "survey", name: "How Well Do You Know Mez?", blurb: "We asked the guests what Mez would pick. Guess the top answers." },
    { id: "mystery", name: "Mystery Files", blurb: "Clues from the party files. Can you crack the case?" },
  ],
} as const;
