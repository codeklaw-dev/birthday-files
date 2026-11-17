/**
 * Answer matching for Mez Survey: group guests' free-text answers on the
 * server, and match live guesses against the approved board. Deliberately
 * simple and explainable: normalise, then compare exact / near-exact / by words.
 */

const STOP = new Set(["the", "a", "an", "and", "or", "of", "to", "my", "his", "her", "their", "its", "is", "at", "in", "on", "for", "with", "by", "any", "anything", "all", "very", "really", "just", "probably", "definitely"]);

export function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’']/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && /[a-z]s$/.test(w) && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .join(" ")
    .trim();
}

export function keywords(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter((w) => w && !STOP.has(w));
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Do two answers mean the same thing? */
export function similar(a: string, b: string): boolean {
  const na = keywords(a).join(" ");
  const nb = keywords(b).join(" ");
  if (!na || !nb) return false;
  if (na === nb) return true;
  const longer = Math.max(na.length, nb.length);
  if (longer >= 4 && levenshtein(na, nb) <= Math.max(1, Math.floor(longer * 0.2))) return true;
  // Word overlap: "kacchi biryani" ~ "biryani"
  const wa = new Set(na.split(" "));
  const wb = new Set(nb.split(" "));
  const shared = [...wa].filter((w) => wb.has(w) && w.length >= 3).length;
  return shared > 0 && shared / Math.min(wa.size, wb.size) >= 1;
}

export interface RawAnswer {
  /** One respondent (submission id); duplicates from the same person count once. */
  by: string;
  text: string;
}

export interface ProposedGroup {
  key: string;
  label: string;
  count: number;
  members: RawAnswer[];
}

/** Group similar answers (union-find over pairwise similarity). Counts distinct respondents. */
export function groupAnswers(raw: RawAnswer[]): ProposedGroup[] {
  const items = raw.filter((r) => keywords(r.text).length > 0);
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) if (similar(items[i].text, items[j].text)) parent[find(i)] = find(j);
  }
  const groups = new Map<number, RawAnswer[]>();
  items.forEach((it, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), it]));
  return [...groups.values()]
    .map((members) => {
      // Label: the most common wording, shortest on ties.
      const freq = new Map<string, number>();
      for (const m of members) freq.set(m.text.trim(), (freq.get(m.text.trim()) ?? 0) + 1);
      const label = [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0];
      const by = new Set(members.map((m) => m.by));
      return { key: members.map((m) => m.by).sort().join("|") + ":" + normalize(label), label, count: by.size, members };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Which board answer (index) a guess matches, if any. */
export function matchGuess(guess: string, answers: { label: string; aliases: string[] }[]): number | null {
  if (!keywords(guess).length) return null;
  for (let i = 0; i < answers.length; i++) {
    if ([answers[i].label, ...answers[i].aliases].some((t) => similar(guess, t))) return i;
  }
  return null;
}
