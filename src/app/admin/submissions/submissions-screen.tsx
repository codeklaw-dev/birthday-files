"use client";

import { ArrowDown, ArrowLeft, ArrowUp, Award, Check, Copy, EyeOff, Film, Image as ImageIcon, Lock, RefreshCw, Search, ShieldAlert, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, cx, Logo } from "@/components/ui";
import { useStored } from "@/lib/client/hooks";
import { EVENT } from "@/lib/event";
import { GENDER_OPTIONS, PRIZE_OPTIONS, RSVP_OPTIONS, SUGGESTED_TAGS, type Question } from "@/lib/invite/config";
import type { ModerationStatus } from "@/lib/invite/schema";
import type { AdminPayload, AdminView } from "@/lib/invite/types";
import { KeyGate } from "../admin-screen";

type Filter = "all" | "pending" | "approved" | "rejected" | "remote" | "honourable" | "order";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "To review" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "remote", label: "Remote" },
  { id: "honourable", label: "Honourable mentions" },
  { id: "order", label: "Running order" },
];
const RSVP_SHORT: Record<string, string> = { yes: "Coming", maybe: "Maybe", remote: "Remote", no: "Not coming" };
const RSVP_TONE: Record<string, string> = { yes: "bg-go/15 text-go", maybe: "bg-gold/15 text-gold", remote: "bg-tile-b/20 text-tile-b", no: "bg-white/10 text-haze" };
const STATUS_TONE: Record<ModerationStatus, string> = { pending: "bg-gold/15 text-gold", approved: "bg-go/15 text-go", rejected: "bg-stamp/15 text-stamp" };

export function SubmissionsScreen() {
  const [hostKey, setHostKey] = useStored("session", "bf.hostKey");
  if (hostKey === undefined) return <main className="stage flex-1" />;
  if (hostKey === null) return <KeyGate onUnlock={setHostKey} />;
  return <Dashboard hostKey={hostKey} onLock={() => setHostKey(null)} />;
}

function Dashboard({ hostKey, onLock }: { hostKey: string; onLock: () => void }) {
  const [payload, setPayload] = useState<AdminPayload | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("pending");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const api = useCallback(
    async (url: string, init: RequestInit = {}) => {
      const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", "x-host-key": hostKey, ...init.headers } });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) onLock();
      if (!res.ok || !body.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      return body;
    },
    [hostKey, onLock],
  );

  const load = useCallback(async () => {
    try {
      const body = (await api("/api/invite/admin")) as AdminPayload;
      setPayload(body);
      setState("ready");
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      setState((s) => (s === "ready" ? "ready" : "error"));
    }
  }, [api]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const id = setInterval(load, 30_000); // also renews the short-lived media links
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [load]);

  const replace = (s: AdminView) => setPayload((p) => (p ? { ...p, submissions: p.submissions.map((x) => (x.id === s.id ? s : x)) } : p));

  const moderate = async (id: string, patch: Partial<{ status: ModerationStatus; tags: string[]; honourable: boolean; note: string }>) => {
    try {
      const body = await api(`/api/invite/admin/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      replace(body.submission);
      void load(); // refresh stats and running order
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async (s: AdminView) => {
    if (!window.confirm(`Delete ${s.data.name}'s submission, photo and video for good?`)) return;
    try {
      await api(`/api/invite/admin/${s.id}`, { method: "DELETE" });
      setSelectedId(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const ordered = useMemo(
    () => (payload?.submissions ?? []).filter((s) => s.showable).sort((a, b) => (a.moderation.order ?? 0) - (b.moderation.order ?? 0)),
    [payload],
  );

  const move = async (id: string, delta: -1 | 1) => {
    const ids = ordered.map((s) => s.id);
    const i = ids.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try {
      await api("/api/invite/admin/order", { method: "PUT", body: JSON.stringify({ ids }) });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = payload?.submissions ?? [];
    if (filter === "order") return ordered;
    if (filter === "pending" || filter === "approved" || filter === "rejected") list = list.filter((s) => s.moderation.status === filter);
    if (filter === "remote") list = list.filter((s) => s.data.rsvp === "remote");
    if (filter === "honourable") list = list.filter((s) => s.moderation.honourable);
    if (q) list = list.filter((s) => JSON.stringify([s.data, s.moderation.tags]).toLowerCase().includes(q));
    return list;
  }, [payload, filter, query, ordered]);

  const selected = payload?.submissions.find((s) => s.id === selectedId) ?? null;

  return (
    <main className="stage flex flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 lg:px-8">
        <div className="flex items-center gap-4">
          <Logo size="sm" />
          <span className="rounded-md border border-stamp/50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.25em] text-stamp">Submissions · private</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href="/admin" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold hover:bg-white/10">
            <ArrowLeft className="size-4" aria-hidden /> Run of show
          </a>
          <Button onClick={() => void load()} aria-label="Refresh">
            <RefreshCw className="size-4" aria-hidden />
          </Button>
          <Button onClick={onLock}>
            <Lock className="size-4" aria-hidden /> Lock
          </Button>
        </div>
      </header>

      {state === "loading" && <p className="m-auto text-haze" role="status">Loading submissions…</p>}
      {state === "error" && (
        <div className="m-auto flex flex-col items-center gap-3 text-center" role="alert">
          <p className="text-stamp">Couldn&apos;t load submissions: {error}</p>
          <Button onClick={() => void load()}>Try again</Button>
        </div>
      )}

      {state === "ready" && payload && (
        <div className="flex flex-1 flex-col gap-4 p-4 lg:p-8">
          <Stats payload={payload} />
          {error && (
            <p role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-stamp/40 bg-stamp/10 px-4 py-2 text-sm text-stamp">
              {error}
              <button onClick={() => setError(null)} aria-label="Dismiss">
                <X className="size-4" />
              </button>
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <div role="tablist" aria-label="Filter submissions" className="flex flex-wrap gap-1 rounded-xl border border-white/15 p-1">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  role="tab"
                  aria-selected={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={cx("min-h-9 rounded-lg px-3 text-sm font-semibold", filter === f.id ? "bg-gold text-ink-950" : "text-haze hover:text-cream")}
                >
                  {f.label}
                  {f.id === "pending" && payload.stats.pending > 0 && <span className="ml-1.5 rounded-full bg-stamp px-1.5 text-xs text-cream">{payload.stats.pending}</span>}
                </button>
              ))}
            </div>
            <label className="relative ml-auto min-w-48 flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-haze" aria-hidden />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search names, answers, tags" aria-label="Search" className="input !pl-9" />
            </label>
          </div>

          <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            <section aria-label="Submissions" className="flex min-w-0 flex-col gap-2">
              {filter === "order" && <p className="text-xs text-haze">Approved submissions the guest allowed us to show, in party order. Use the arrows to reorder.</p>}
              {visible.length === 0 ? (
                <EmptyState total={payload.stats.total} filter={filter} />
              ) : (
                <ul className="flex flex-col gap-2">
                  {visible.map((s, i) => (
                    <li key={s.id} className="flex items-stretch gap-2">
                      {filter === "order" && (
                        <div className="flex flex-col justify-center gap-1">
                          <button className="grid size-8 place-items-center rounded-lg border border-white/15 disabled:opacity-30" disabled={i === 0} onClick={() => move(s.id, -1)} aria-label={`Move ${s.data.name} up`}>
                            <ArrowUp className="size-4" />
                          </button>
                          <button className="grid size-8 place-items-center rounded-lg border border-white/15 disabled:opacity-30" disabled={i === visible.length - 1} onClick={() => move(s.id, 1)} aria-label={`Move ${s.data.name} down`}>
                            <ArrowDown className="size-4" />
                          </button>
                        </div>
                      )}
                      <button
                        onClick={() => {
                          setSelectedId(s.id);
                          if (window.innerWidth < 1024) setTimeout(() => document.getElementById("detail")?.scrollIntoView({ behavior: "smooth" }), 50);
                        }}
                        aria-current={selectedId === s.id}
                        className={cx("flex min-w-0 flex-1 flex-col gap-1.5 rounded-xl border px-4 py-3 text-left transition", selectedId === s.id ? "border-gold bg-gold/10" : "border-white/10 bg-white/5 hover:border-white/25")}
                      >
                        <div className="flex items-center gap-2">
                          {filter === "order" && <span className="font-mono text-sm text-gold">#{s.moderation.order}</span>}
                          <span className="min-w-0 flex-1 truncate font-semibold">{s.data.name}</span>
                          <span className={cx("rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_TONE[s.moderation.status])}>{s.moderation.status}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-haze">
                          <span className={cx("rounded-full px-2 py-0.5", RSVP_TONE[s.data.rsvp])}>{RSVP_SHORT[s.data.rsvp]}</span>
                          <span>{s.data.relationship}</span>
                          {s.photo && <ImageIcon className="size-3.5" aria-label="has photo" />}
                          {s.video && <Film className="size-3.5" aria-label="has video" />}
                          {!s.data.consent && <EyeOff className="size-3.5 text-stamp" aria-label="not to be shown at the party" />}
                          {s.moderation.honourable && <Award className="size-3.5 text-gold" aria-label="honourable mention" />}
                          {s.moderation.editedAfterReview && <span className="text-gold">edited since review</span>}
                          {s.moderation.tags.map((t) => (
                            <span key={t} className="rounded bg-white/10 px-1.5">#{t}</span>
                          ))}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section id="detail" aria-label="Selected submission" className="min-w-0">
              {selected ? (
                <Detail key={selected.id} s={selected} questions={payload.questions} onModerate={(p) => moderate(selected.id, p)} onDelete={() => remove(selected)} />
              ) : (
                <div className="panel grid min-h-60 place-items-center p-6 text-center text-haze">Select a submission to review it.</div>
              )}
            </section>
          </div>

          <QuestionsEditor questions={payload.questions} api={api} onSaved={load} />
        </div>
      )}
    </main>
  );
}

function Stats({ payload }: { payload: AdminPayload }) {
  const s = payload.stats;
  const items = [
    ["Coming", s.rsvp.yes],
    ["Maybe", s.rsvp.maybe],
    ["Remote", s.rsvp.remote],
    ["Not coming", s.rsvp.no],
    ["To review", s.pending],
    ["Approved", s.approved],
    ["Photos", s.withPhoto],
    ["Videos", s.withVideo],
    ["OK to show", s.consented],
  ] as const;
  return (
    <dl className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
      {items.map(([label, n]) => (
        <div key={label} className="panel px-3 py-2">
          <dt className="text-[11px] uppercase tracking-wider text-haze">{label}</dt>
          <dd className="font-mono text-2xl font-bold tabular-nums">{n}</dd>
        </div>
      ))}
    </dl>
  );
}

function EmptyState({ total, filter }: { total: number; filter: Filter }) {
  const [copied, setCopied] = useState(false);
  if (total > 0) {
    return (
      <div className="panel p-6 text-center text-haze">
        {filter === "pending" ? "All caught up: nothing waiting for review." : filter === "order" ? "Nothing approved to show yet. Approve submissions where the guest gave permission." : "Nothing matches this filter."}
      </div>
    );
  }
  return (
    <div className="panel flex flex-col items-center gap-3 p-6 text-center">
      <p className="font-semibold">No RSVPs yet</p>
      <p className="text-sm text-haze">Send guests the invitation link. Submissions appear here as they come in.</p>
      <Button
        onClick={async () => {
          await navigator.clipboard.writeText(`${window.location.origin}/invite`).catch(() => {});
          setCopied(true);
        }}
      >
        {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} {copied ? "Copied" : "Copy invite link"}
      </Button>
    </div>
  );
}

function Detail({
  s,
  questions,
  onModerate,
  onDelete,
}: {
  s: AdminView;
  questions: Question[];
  onModerate: (p: Partial<{ status: ModerationStatus; tags: string[]; honourable: boolean; note: string }>) => void;
  onDelete: () => void;
}) {
  const [tagInput, setTagInput] = useState("");
  const [note, setNote] = useState(s.moderation.note);
  const addTag = (t: string) => {
    const tag = t.trim().toLowerCase();
    if (tag && !s.moderation.tags.includes(tag)) onModerate({ tags: [...s.moderation.tags, tag] });
    setTagInput("");
  };
  const gender = GENDER_OPTIONS.find((g) => g.id === s.data.gender)?.label;
  const prize = PRIZE_OPTIONS.find((p) => p.id === s.data.prize)?.label;

  return (
    <article className="panel flex flex-col gap-5 p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-extrabold">{s.data.name}</h2>
          <p className="text-sm text-haze">
            {s.data.relationship}
            {s.data.relationshipDetail && ` · ${s.data.relationshipDetail}`} · {RSVP_OPTIONS.find((o) => o.id === s.data.rsvp)?.label}
          </p>
          <p className="mt-1 font-mono text-xs text-haze">
            Sent {new Date(s.createdAt).toLocaleString()} {s.updatedAt !== s.createdAt && `· edited ${new Date(s.updatedAt).toLocaleString()}`}
          </p>
        </div>
        <span className={cx("rounded-full px-3 py-1 text-sm font-semibold", STATUS_TONE[s.moderation.status])}>{s.moderation.status}</span>
      </header>

      {!s.data.consent && (
        <p className="flex items-start gap-2 rounded-xl border border-stamp/40 bg-stamp/10 p-3 text-sm">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-stamp" aria-hidden />
          <span>
            <strong>Private.</strong> The guest did not give permission to show this at the party. You can still approve it for {EVENT.guestOfHonour} to see, but it won&apos;t enter the running order.
          </span>
        </p>
      )}
      {s.moderation.editedAfterReview && <p className="rounded-xl border border-gold/40 bg-gold/10 p-3 text-sm text-gold">The guest changed this after it was reviewed. Please check it again.</p>}

      <div className="flex flex-wrap gap-2">
        <Button variant={s.moderation.status === "approved" ? "primary" : "ghost"} onClick={() => onModerate({ status: "approved" })}>
          <Check className="size-4" aria-hidden /> Approve
        </Button>
        <Button variant="danger" onClick={() => onModerate({ status: "rejected" })} disabled={s.moderation.status === "rejected"}>
          <X className="size-4" aria-hidden /> Reject
        </Button>
        {s.moderation.status !== "pending" && <Button onClick={() => onModerate({ status: "pending" })}>Back to review</Button>}
        <Button variant={s.moderation.honourable ? "primary" : "ghost"} onClick={() => onModerate({ honourable: !s.moderation.honourable })} aria-pressed={s.moderation.honourable}>
          <Award className="size-4" aria-hidden /> Honourable mention
        </Button>
      </div>

      {(s.photo || s.video) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {s.photo && (
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed link to a private file */}
              <img src={s.photo.url} alt={`Photo from ${s.data.name}`} className="max-h-80 w-full rounded-xl bg-black object-contain" />
              <figcaption className="mt-1 font-mono text-xs text-haze">{s.photo.mime} · {Math.round(s.photo.bytes / 1024)} KB</figcaption>
            </figure>
          )}
          {s.video && (
            <figure>
              <video src={s.video.url} controls playsInline preload="metadata" className="max-h-80 w-full rounded-xl bg-black" />
              <figcaption className="mt-1 font-mono text-xs text-haze">
                {s.video.durationSec} s · {(s.video.bytes / 1024 / 1024).toFixed(1)} MB{s.video.durationVerified === false && " · length reported by the browser"}
              </figcaption>
            </figure>
          )}
        </div>
      )}

      <dl className="flex flex-col gap-3 text-sm">
        {questions.map((q) => (
          <div key={q.id}>
            <dt className="text-xs text-haze">{q.prompt}</dt>
            <dd className="mt-0.5">{s.data.answers[q.id] || <span className="text-haze">—</span>}</dd>
          </div>
        ))}
        <div>
          <dt className="text-xs text-haze">Favourite memory</dt>
          <dd className="mt-0.5 whitespace-pre-line">{s.data.memory || <span className="text-haze">—</span>}</dd>
        </div>
        <div>
          <dt className="text-xs text-haze">{EVENT.guestOfHonour} stands accused of…</dt>
          <dd className="mt-0.5">{s.data.accusation || <span className="text-haze">—</span>}</dd>
        </div>
        <div className="grid grid-cols-2 gap-3 border-t border-white/10 pt-3">
          <div>
            <dt className="text-xs text-haze">Prize preference</dt>
            <dd className="mt-0.5">
              {prize}
              {s.data.prizeNote && ` · ${s.data.prizeNote}`}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-haze">Gender</dt>
            <dd className="mt-0.5">{s.data.gender === "self" ? s.data.genderSelf || "Self-described" : gender}</dd>
          </div>
        </div>
      </dl>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium uppercase tracking-widest text-haze">Tags</span>
        <div className="flex flex-wrap gap-1.5">
          {s.moderation.tags.map((t) => (
            <button key={t} onClick={() => onModerate({ tags: s.moderation.tags.filter((x) => x !== t) })} className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-2.5 py-1 text-xs text-gold" aria-label={`Remove tag ${t}`}>
              #{t} <X className="size-3" aria-hidden />
            </button>
          ))}
          {SUGGESTED_TAGS.filter((t) => !s.moderation.tags.includes(t)).map((t) => (
            <button key={t} onClick={() => addTag(t)} className="rounded-full border border-white/15 px-2.5 py-1 text-xs text-haze hover:text-cream">
              + {t}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addTag(tagInput);
          }}
        >
          <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} maxLength={24} placeholder="Add a tag" aria-label="New tag" className="input" />
          <Button type="submit" disabled={!tagInput.trim()}>
            Add
          </Button>
        </form>
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-xs font-medium uppercase tracking-widest text-haze">Private note</span>
        <textarea
          rows={2}
          maxLength={500}
          className="input resize-y"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== s.moderation.note && onModerate({ note })}
          placeholder="Only you see this"
        />
      </label>

      <button onClick={onDelete} className="inline-flex items-center gap-1.5 self-start text-sm text-stamp hover:underline">
        <Trash2 className="size-4" aria-hidden /> Delete submission and files
      </button>
    </article>
  );
}

function QuestionsEditor({ questions, api, onSaved }: { questions: Question[]; api: (url: string, init?: RequestInit) => Promise<unknown>; onSaved: () => void }) {
  const [draft, setDraft] = useState(questions);
  const [status, setStatus] = useState<string | null>(null);
  return (
    <details className="panel p-5">
      <summary className="cursor-pointer font-mono text-xs font-semibold uppercase tracking-[0.25em] text-gold">The three questions on the invite</summary>
      <form
        className="mt-4 flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setStatus("Saving…");
          try {
            await api("/api/invite/settings", { method: "PUT", body: JSON.stringify({ questions: draft }) });
            setStatus("Saved. New visitors see the new questions.");
            onSaved();
          } catch (err) {
            setStatus((err as Error).message);
          }
        }}
      >
        {draft.map((q, i) => (
          <div key={q.id} className="grid gap-2 sm:grid-cols-[2fr_1fr]">
            <input
              className="input"
              aria-label={`Question ${i + 1}`}
              value={q.prompt}
              maxLength={140}
              onChange={(e) => setDraft(draft.map((x) => (x.id === q.id ? { ...x, prompt: e.target.value } : x)))}
            />
            <input
              className="input"
              aria-label={`Hint for question ${i + 1}`}
              placeholder="Example answer (hint)"
              value={q.placeholder}
              maxLength={80}
              onChange={(e) => setDraft(draft.map((x) => (x.id === q.id ? { ...x, placeholder: e.target.value } : x)))}
            />
          </div>
        ))}
        <p className="text-xs text-haze">Answers already received stay attached to the question number, so change wording rather than meaning once RSVPs start arriving.</p>
        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary">
            Save questions
          </Button>
          {status && <span className="text-sm text-haze" role="status">{status}</span>}
        </div>
      </form>
    </details>
  );
}
