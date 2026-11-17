"use client";

import { ArrowLeft, Check } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, cx, Logo } from "@/components/ui";
import { useStored } from "@/lib/client/hooks";
import { useRoom } from "@/lib/client/use-room";
import type { Question } from "@/lib/invite/config";
import { POINT_KEYS, POINTS_HELP, type PointsConfig } from "@/lib/games/config";
import type { SurveyBoard } from "@/lib/games/types";
import type { ProposedGroup } from "@/lib/games/text";
import { KeyGate } from "../admin-screen";

interface Setup {
  eligibleCount: number;
  survey: { question: Question; respondents: number; proposed: ProposedGroup[]; approved: (SurveyBoard & { approvedAt: number }) | null }[];
  trial: { selected: string[] | null; candidates: { id: string; name: string; remote: boolean; charge: string }[] };
}

export function GamesSetupScreen() {
  const [hostKey, setHostKey] = useStored("session", "bf.hostKey");
  if (hostKey === undefined) return <main className="stage flex-1" />;
  if (hostKey === null) return <KeyGate onUnlock={setHostKey} />;
  return <Setup hostKey={hostKey} />;
}

function Setup({ hostKey }: { hostKey: string }) {
  const room = useRoom("host", { hostKey });
  const [data, setData] = useState<Setup | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => {
    const res = await fetch("/api/games/setup", { headers: { "x-host-key": hostKey } });
    if (res.ok) setData(await res.json());
  }, [hostKey]);
  useEffect(() => {
    const id = setTimeout(load, 0);
    return () => clearTimeout(id);
  }, [load]);
  const act = async (a: Record<string, unknown>) => {
    const r = await room.send(a as never);
    setMsg(r.ok ? "Saved." : (r.error ?? "Didn't save."));
    if (r.ok) await load();
    return r.ok;
  };

  return (
    <main className="stage flex flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 lg:px-8">
        <div className="flex items-center gap-4">
          <Logo size="sm" />
          <span className="rounded-md border border-stamp/50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.25em] text-stamp">Games setup · private</span>
        </div>
        <a href="/admin" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold hover:bg-white/10">
          <ArrowLeft className="size-4" aria-hidden /> Run of show
        </a>
      </header>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 lg:p-8">
        {msg && (
          <p role="status" className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm">
            {msg}
          </p>
        )}
        {!data ? (
          <p className="text-haze">Loading…</p>
        ) : (
          <>
            <p className="text-sm text-haze">
              Games use only submissions you approved in <a className="text-gold underline" href="/admin/submissions">Guest submissions</a> where the guest allowed them to be shown ({data.eligibleCount} right now).
            </p>
            <section className="flex flex-col gap-4">
              <h2 className="font-display text-2xl font-extrabold">Mez Survey boards</h2>
              <p className="text-sm text-haze">Answers are grouped automatically. Untick groups to leave out, rename them, or merge similar ones, then approve. Counts always come from the real answers.</p>
              {data.survey.map((q) => (
                <SurveyEditor key={q.question.id} q={q} onApprove={(groups) => act({ type: "host/setup/survey", questionId: q.question.id, groups })} onClear={() => act({ type: "host/setup/survey", questionId: q.question.id, clear: true })} />
              ))}
            </section>
            <TrialPicker trial={data.trial} onSave={(caseIds) => act({ type: "host/setup/trial", caseIds })} />
            {room.view && <PointsEditor points={room.view.games.points} onSave={(points) => act({ type: "host/points", points })} />}
          </>
        )}
      </div>
    </main>
  );
}

function SurveyEditor({ q, onApprove, onClear }: { q: Setup["survey"][number]; onApprove: (groups: { label: string; members: string[] }[]) => void; onClear: () => void }) {
  const [include, setInclude] = useState<Record<string, boolean>>({});
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [mergeInto, setMergeInto] = useState<Record<string, string>>({});
  const groups = q.proposed;
  const final = useMemo(() => {
    const out = new Map<string, { label: string; members: string[] }>();
    for (const g of groups) {
      if (include[g.key] === false || mergeInto[g.key]) continue;
      out.set(g.key, { label: labels[g.key] ?? g.label, members: g.members.map((m) => m.by) });
    }
    for (const g of groups) {
      const target = mergeInto[g.key];
      if (target && out.has(target) && include[g.key] !== false) out.get(target)!.members.push(...g.members.map((m) => m.by));
    }
    return [...out.values()].map((g) => ({ ...g, count: new Set(g.members).size })).sort((a, b) => b.count - a.count);
  }, [groups, include, labels, mergeInto]);

  return (
    <article className="panel p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold">{q.question.prompt}</h3>
        <span className="font-mono text-xs text-haze">{q.respondents} answers</span>
      </div>
      {q.approved && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-go">
          <Check className="size-4" aria-hidden /> Approved board: {q.approved.answers.map((a) => `${a.label} (${a.count})`).join(" · ")}
          <button className="ml-2 text-xs text-stamp underline" onClick={onClear}>
            remove
          </button>
        </p>
      )}
      {groups.length === 0 ? (
        <p className="mt-3 text-sm text-haze">No approved answers to this question yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {groups.map((g) => (
            <li key={g.key} className={cx("grid gap-2 rounded-xl border p-3 sm:grid-cols-[auto_1fr_auto]", include[g.key] === false || mergeInto[g.key] ? "border-white/5 opacity-50" : "border-white/10 bg-white/5")}>
              <input type="checkbox" className="mt-2 size-5" checked={include[g.key] !== false} onChange={(e) => setInclude({ ...include, [g.key]: e.target.checked })} aria-label={`Include ${g.label}`} />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <input className="input !py-1.5" value={labels[g.key] ?? g.label} onChange={(e) => setLabels({ ...labels, [g.key]: e.target.value })} aria-label="Answer label" maxLength={60} />
                  <span className="shrink-0 font-mono text-sm font-bold">{g.count}</span>
                </div>
                <p className="mt-1 truncate text-xs text-haze" title={g.members.map((m) => m.text).join(" · ")}>
                  {g.members.map((m) => m.text).join(" · ")}
                </p>
              </div>
              <select className="input !w-auto !py-1.5 text-sm" value={mergeInto[g.key] ?? ""} onChange={(e) => setMergeInto({ ...mergeInto, [g.key]: e.target.value })} aria-label={`Merge ${g.label} into`}>
                <option value="">Keep separate</option>
                {groups
                  .filter((x) => x.key !== g.key && !mergeInto[x.key])
                  .map((x) => (
                    <option key={x.key} value={x.key}>
                      Merge into {labels[x.key] ?? x.label}
                    </option>
                  ))}
              </select>
            </li>
          ))}
        </ul>
      )}
      {final.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={() => onApprove(final.map(({ label, members }) => ({ label, members })))}>
            Approve board ({Math.min(8, final.length)} answers)
          </Button>
          <span className="text-xs text-haze">Top 8 by count go on the board.</span>
        </div>
      )}
    </article>
  );
}

function TrialPicker({ trial, onSave }: { trial: Setup["trial"]; onSave: (ids: string[] | null) => void }) {
  const [sel, setSel] = useState<Set<string> | null>(trial.selected ? new Set(trial.selected) : null);
  const all = sel === null;
  return (
    <section className="panel flex flex-col gap-3 p-5">
      <h2 className="font-display text-2xl font-extrabold">Mez on Trial: charges</h2>
      {trial.candidates.length === 0 ? (
        <p className="text-sm text-haze">No approved accusations yet.</p>
      ) : (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-5" checked={all} onChange={(e) => setSel(e.target.checked ? null : new Set(trial.candidates.map((c) => c.id)))} />
            Use every approved accusation
          </label>
          <ul className="flex flex-col gap-2">
            {trial.candidates.map((c) => (
              <li key={c.id}>
                <label className={cx("flex gap-3 rounded-xl border p-3", all || sel?.has(c.id) ? "border-white/15 bg-white/5" : "border-white/5 opacity-50")}>
                  <input
                    type="checkbox"
                    className="mt-1 size-5"
                    disabled={all}
                    checked={all || !!sel?.has(c.id)}
                    onChange={(e) => {
                      const next = new Set(sel);
                      if (e.target.checked) next.add(c.id);
                      else next.delete(c.id);
                      setSel(next);
                    }}
                  />
                  <span>
                    <span className="block">Mez stands accused of {c.charge}</span>
                    <span className="text-xs text-haze">
                      by {c.name}
                      {c.remote && " (remote)"}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <Button variant="primary" onClick={() => onSave(sel ? [...sel] : null)}>
            Save charges
          </Button>
        </>
      )}
    </section>
  );
}

function PointsEditor({ points, onSave }: { points: PointsConfig; onSave: (p: Partial<PointsConfig>) => Promise<boolean> }) {
  const [draft, setDraft] = useState<PointsConfig>(points);
  const changed = POINT_KEYS.filter((k) => draft[k] !== points[k]);
  return (
    <section className="panel flex flex-col gap-3 p-5">
      <h2 className="font-display text-2xl font-extrabold">Points rules</h2>
      <p className="text-sm text-haze">Changes apply to future rounds only and are written to the event log. Every score entry records which rule produced it.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {POINT_KEYS.map((k) => (
          <label key={k} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
            <span>{POINTS_HELP[k]}</span>
            <input
              type="number"
              min={0}
              max={1000}
              className={cx("input !w-24 !py-1 text-right font-mono", draft[k] !== points[k] && "!border-gold")}
              value={draft[k]}
              onChange={(e) => setDraft({ ...draft, [k]: Number(e.target.value) })}
            />
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <Button variant="primary" disabled={!changed.length} onClick={() => void onSave(Object.fromEntries(changed.map((k) => [k, draft[k]])))}>
          Save {changed.length || ""} change{changed.length === 1 ? "" : "s"}
        </Button>
        {changed.length > 0 && <Button onClick={() => setDraft(points)}>Undo</Button>}
      </div>
    </section>
  );
}
