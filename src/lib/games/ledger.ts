import type { Player } from "@/lib/game/types";
import type { BoardId, BoardRow, LedgerEntry, Subject } from "./types";

/** Totals per subject on one board. The ledger is the only source of truth. */
export function boardTotals(ledger: LedgerEntry[], board: BoardId): Map<string, { subject: Subject; total: number }> {
  const out = new Map<string, { subject: Subject; total: number }>();
  for (const e of ledger) {
    if (e.board !== board) continue;
    const key = `${e.subject.kind}:${e.subject.id}`;
    const row = out.get(key) ?? { subject: e.subject, total: 0 };
    row.total += e.delta;
    row.subject = e.subject;
    out.set(key, row);
  }
  return out;
}

export function totalFor(ledger: LedgerEntry[], board: BoardId, subject: Pick<Subject, "kind" | "id">): number {
  let t = 0;
  for (const e of ledger) if (e.board === board && e.subject.kind === subject.kind && e.subject.id === subject.id) t += e.delta;
  return t;
}

/** Rank with ties sharing a rank (1, 2, 2, 4). */
export function rankRows(rows: { subject: Subject; total: number; remote?: boolean }[]): BoardRow[] {
  const sorted = [...rows].sort((a, b) => b.total - a.total || a.subject.name.localeCompare(b.subject.name));
  let rank = 0;
  let prev: number | null = null;
  return sorted.map((r, i) => {
    if (r.total !== prev) rank = i + 1;
    prev = r.total;
    return { ...r, rank };
  });
}

/** Live board: every phone player (zero if no points yet), names kept current. */
export function liveBoard(ledger: LedgerEntry[], players: Player[]): BoardRow[] {
  const totals = boardTotals(ledger, "live");
  return rankRows(players.map((p) => ({ subject: { kind: "player", id: p.id, name: p.name }, total: totals.get(`player:${p.id}`)?.total ?? 0 })));
}

/** Mez Expert board: invite contributors, attending and remote on equal terms. */
export function expertBoard(ledger: LedgerEntry[]): BoardRow[] {
  return rankRows([...boardTotals(ledger, "expert").values()].map((r) => ({ ...r, remote: !!r.subject.remote })));
}
