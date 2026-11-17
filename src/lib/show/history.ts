/**
 * 21 November, 2002–2026: only events checked against a published source,
 * each with the URL it was verified from (searched on 17 Nov 2026).
 *
 * Rules: never add an event without a source URL that states the date.
 * Years with nothing verified are left out on purpose — the TV skips them.
 * `serious` items (violence, war, courts) are off by default for a party;
 * the organiser can switch them on for the history segment.
 */
export interface HistoryEvent {
  id: string;
  year: number;
  headline: string;
  detail: string;
  sourceName: string;
  sourceUrl: string;
  serious?: boolean;
}

export const BIRTH_YEAR = 2002;

export const HISTORY: HistoryEvent[] = [
  {
    id: "h2002-nato",
    year: 2002,
    headline: "NATO invites seven countries to join",
    detail: "At the Prague summit, NATO leaders invited Bulgaria, Estonia, Latvia, Lithuania, Romania, Slovakia and Slovenia to begin accession talks.",
    sourceName: "NATO",
    sourceUrl: "https://www.nato.int/docu/update/2002/11-november/e1121e.htm",
  },
  {
    id: "h2003-cat",
    year: 2003,
    headline: "“The Cat in the Hat” opens in US cinemas",
    detail: "The live-action Dr. Seuss film starring Mike Myers was released in the United States.",
    sourceName: "Box Office Mojo",
    sourceUrl: "https://www.boxofficemojo.com/title/tt0312528",
  },
  {
    id: "h2004-ukraine",
    year: 2004,
    headline: "Ukraine's disputed presidential run-off",
    detail: "The Yanukovych–Yushchenko run-off was held; fraud allegations sparked the protests that became the Orange Revolution, and the vote was later re-run.",
    sourceName: "Britannica",
    sourceUrl: "https://www.britannica.com/place/Ukraine/The-Orange-Revolution-and-the-Yushchenko-presidency",
  },
  {
    id: "h2005-kadima",
    year: 2005,
    headline: "Ariel Sharon leaves Likud to form Kadima",
    detail: "Israel's prime minister announced he was quitting the Likud party to found a new party, Kadima (“Forward”).",
    sourceName: "Jewish Virtual Library",
    sourceUrl: "https://www.jewishvirtuallibrary.org/history-and-overview-of-the-kadima-party",
  },
  {
    id: "h2006-gemayel",
    year: 2006,
    headline: "Lebanese minister Pierre Gemayel assassinated",
    detail: "Lebanon's industry minister was shot dead in the Beirut area; the UN Security Council condemned the killing.",
    sourceName: "UN Press",
    sourceUrl: "https://press.un.org/en/2006/sc8873.doc.htm",
    serious: true,
  },
  {
    id: "h2007-enchanted",
    year: 2007,
    headline: "Disney's “Enchanted” goes on general release",
    detail: "The musical fantasy-comedy opened across the United States after premiering at the London Film Festival.",
    sourceName: "D23 (Disney)",
    sourceUrl: "https://d23.com/disney-a-to-z/enchanted-film/",
  },
  {
    id: "h2008-twilight",
    year: 2008,
    headline: "“Twilight” opens in cinemas",
    detail: "The vampire romance opened on 21 November and took about $69.6 million in its first weekend in North America.",
    sourceName: "The Numbers",
    sourceUrl: "https://www.the-numbers.com/movie/Twilight-(2008)",
  },
  {
    id: "h2010-ireland",
    year: 2010,
    headline: "Ireland asks the EU and IMF for financial help",
    detail: "Finance Minister Brian Lenihan formally applied for assistance under a joint EU–IMF programme.",
    sourceName: "ThinkAdvisor",
    sourceUrl: "https://www.thinkadvisor.com/amp/2010/11/21/ireland-accepts-bailout-from-eu/",
  },
  {
    id: "h2012-pi",
    year: 2012,
    headline: "“Life of Pi” opens in US cinemas",
    detail: "Ang Lee's adaptation of Yann Martel's novel was released in the United States by 20th Century Fox.",
    sourceName: "Reelviews",
    sourceUrl: "https://www.reelviews.net/reelviews/life-of-pi",
  },
  {
    id: "h2012-ceasefire",
    year: 2012,
    headline: "Israel–Gaza ceasefire announced in Cairo",
    detail: "Egypt's foreign minister announced a ceasefire, alongside US Secretary of State Hillary Clinton, ending about a week of fighting.",
    sourceName: "VOA via GlobalSecurity.org",
    sourceUrl: "https://www.globalsecurity.org/military/library/news/2012/11/mil-121121-voa02.htm",
    serious: true,
  },
  {
    id: "h2013-maidan",
    year: 2013,
    headline: "Euromaidan protests begin in Kyiv",
    detail: "Crowds gathered on Kyiv's Independence Square after the government suspended preparations to sign an association agreement with the EU.",
    sourceName: "The Kyiv Independent",
    sourceUrl: "https://kyivindependent.com/euro-maidan-revolution/",
  },
  {
    id: "h2014-mockingjay",
    year: 2014,
    headline: "“The Hunger Games: Mockingjay – Part 1” opens in the US",
    detail: "The third Hunger Games film was released in the United States by Lionsgate.",
    sourceName: "The Numbers",
    sourceUrl: "https://www.the-numbers.com/movie/Hunger-Games-Mockingjay-Part-1-The-(2014)",
  },
  {
    id: "h2017-mugabe",
    year: 2017,
    headline: "Robert Mugabe resigns",
    detail: "Zimbabwe's president resigned after 37 years in power; his letter was read out in parliament during impeachment proceedings.",
    sourceName: "Al Jazeera",
    sourceUrl: "https://www.aljazeera.com/news/2017/11/21/robert-mugabes-resignation-letter-in-full",
  },
  {
    id: "h2018-ralph",
    year: 2018,
    headline: "“Ralph Breaks the Internet” opens",
    detail: "Disney's sequel to Wreck-It Ralph was released in the United States.",
    sourceName: "D23 (Disney)",
    sourceUrl: "https://d23.com/disney-a-to-z/ralph-breaks-internet-film/",
  },
  {
    id: "h2020-g20",
    year: 2020,
    headline: "The first virtual G20 leaders' summit opens",
    detail: "Hosted by Saudi Arabia, the Riyadh summit was held online because of the COVID-19 pandemic.",
    sourceName: "Argaam",
    sourceUrl: "https://www.argaam.com/en/article/articledetail/id/1423124",
  },
  {
    id: "h2021-qatar",
    year: 2021,
    headline: "Lewis Hamilton wins the first Qatar Grand Prix",
    detail: "Hamilton won from pole at Losail; Max Verstappen was second and Fernando Alonso took his first podium since 2014.",
    sourceName: "Formula 1",
    sourceUrl: "https://www.formula1.com/en/latest/article/hamilton-narrows-verstappens-title-lead-with-qatar-win-as-alonso-takes-first.5rYgipXuNRiQ0QNs7Xmu1B.5rYgipXuNRiQ0QNs7Xmu1B",
  },
  {
    id: "h2022-england",
    year: 2022,
    headline: "England beat Iran 6–2 at the World Cup in Qatar",
    detail: "Played at the Khalifa International Stadium; Jude Bellingham scored his first international goal and Bukayo Saka scored twice.",
    sourceName: "11v11",
    sourceUrl: "https://www.11v11.com/matches/england-v-iran-21-november-2022-376101/",
  },
  {
    id: "h2024-icc",
    year: 2024,
    headline: "ICC issues arrest warrants over the Gaza war",
    detail: "Judges issued warrants for Benjamin Netanyahu, Yoav Gallant and Hamas commander Mohammed Deif.",
    sourceName: "Lawfare",
    sourceUrl: "https://www.lawfaremedia.org/article/icc-issues-arrest-warrants-for-netanyahu--gallant--and-deif",
    serious: true,
  },
];

/** Years 2002–2026 with no verified entry (shown to the organiser, skipped on the TV). */
export function uncoveredYears(): number[] {
  const have = new Set(HISTORY.map((h) => h.year));
  return Array.from({ length: 2026 - BIRTH_YEAR + 1 }, (_, i) => BIRTH_YEAR + i).filter((y) => !have.has(y) && y !== 2026);
}
