"use client";

import { ArrowLeft, Check, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button, cx, Logo } from "@/components/ui";
import { useStored } from "@/lib/client/hooks";
import type { Lang } from "@/lib/game/types";
import { KeyGate } from "../admin-screen";

type Status = "pending" | "approved" | "rejected";
interface Knowledge {
  personality: { name: { en: string; bn: string }; style: string; rules: string[]; updatedAt: number | null };
  facts: { id: string; text: string; source: "organiser" | "invite"; status: Status }[];
  announcements: { id: string; title: string; text: { en: string; bn: string }; status: Status; prepared: Partial<Record<Lang, string>> }[];
  conversation: { at: number; heard: string; lang: Lang; reply: string }[];
}
interface ClipRow {
  key: string;
  lang: Lang;
  script: string;
  file: string | null;
  provider: string | null;
  placeholder: boolean;
  outdated: boolean;
  status: "approved" | "rejected" | "pending" | "missing";
}

const TONE: Record<string, string> = { approved: "text-go", rejected: "text-stamp", pending: "text-gold", missing: "text-haze" };

export function HostSetupScreen() {
  const [hostKey, setHostKey] = useStored("session", "bf.hostKey");
  if (hostKey === undefined) return <main className="stage flex-1" />;
  if (hostKey === null) return <KeyGate onUnlock={setHostKey} />;
  return <Setup hostKey={hostKey} />;
}

function Setup({ hostKey }: { hostKey: string }) {
  const [k, setK] = useState<Knowledge | null>(null);
  const [clips, setClips] = useState<ClipRow[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const api = useCallback(
    async (url: string, method = "GET", body?: unknown) => {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json", "x-host-key": hostKey }, body: body === undefined ? undefined : JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) throw new Error(json.error ?? `Request failed (${res.status})`);
      return json;
    },
    [hostKey],
  );
  const load = useCallback(async () => {
    try {
      setK(await api("/api/host/knowledge"));
      setClips((await api("/api/host/narration/review")).clips);
    } catch (e) {
      setMsg((e as Error).message);
    }
  }, [api]);
  useEffect(() => {
    const id = setTimeout(load, 0);
    return () => clearTimeout(id);
  }, [load]);
  const run = async (fn: () => Promise<unknown>, ok = "Saved.") => {
    try {
      await fn();
      setMsg(ok);
      await load();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  return (
    <main className="stage flex flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 lg:px-8">
        <div className="flex items-center gap-4">
          <Logo size="sm" />
          <span className="rounded-md border border-stamp/50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.25em] text-stamp">AI host · private</span>
        </div>
        <a href="/admin" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold hover:bg-white/10">
          <ArrowLeft className="size-4" aria-hidden /> Run of show
        </a>
      </header>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 lg:p-8">
        <p className="text-sm text-haze">
          Everything here stays on the organiser side and is never shown in the guest invitation. The AI host only speaks: it can&apos;t change scores, see secret roles or move the game on.
        </p>
        {msg && (
          <p role="status" className="flex items-center justify-between rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm">
            {msg}
            <button onClick={() => setMsg(null)} aria-label="Dismiss">
              <X className="size-4" />
            </button>
          </p>
        )}
        {!k || !clips ? (
          <p className="text-haze">Loading…</p>
        ) : (
          <>
            <Personality k={k} onSave={(p) => run(() => api("/api/host/knowledge", "PUT", p))} onReset={() => run(() => api("/api/host/knowledge", "PUT", { reset: true }), "Reset to the default personality.")} />
            <Narration clips={clips} onSet={(items) => run(() => api("/api/host/narration/review", "PATCH", { items }))} onApproveAll={() => run(() => api("/api/host/narration/review", "PATCH", { approveAll: true }), "Approved every recorded clip (placeholders excluded).")} />
            <Announcements
              k={k}
              onSave={(a) => run(() => api("/api/host/announcements", "POST", a))}
              onStatus={(id, status) => run(() => api("/api/host/announcements", "PATCH", { id, status }), status === "approved" ? "Approved. Preparing the voice in the background…" : "Saved.")}
              onDelete={(id) => run(() => api(`/api/host/announcements?id=${id}`, "DELETE"))}
            />
            <Facts
              k={k}
              onAdd={(text) => run(() => api("/api/host/facts", "POST", { text }))}
              onSuggest={() => run(() => api("/api/host/facts", "POST", { suggest: true }), "Suggestions added for review.")}
              onStatus={(id, status) => run(() => api("/api/host/facts", "PATCH", { id, status }))}
              onDelete={(id) => run(() => api(`/api/host/facts?id=${id}`, "DELETE"))}
            />
            <section className="panel flex flex-col gap-2 p-5">
              <h2 className="font-display text-2xl font-extrabold">Conversation memory</h2>
              <p className="text-sm text-haze">The last few push-to-talk exchanges, so replies stay in context. Cleared when you press Forget.</p>
              {k.conversation.length === 0 ? (
                <p className="text-sm text-haze">Empty.</p>
              ) : (
                <ul className="flex flex-col gap-1 text-sm">
                  {k.conversation.map((t) => (
                    <li key={t.at}>
                      <span className="text-haze">Mez:</span> {t.heard} <span className="text-haze">→</span> {t.reply}
                    </li>
                  ))}
                </ul>
              )}
              <Button className="self-start" onClick={() => run(() => api("/api/host/knowledge", "DELETE"), "Forgotten.")}>
                Forget conversation
              </Button>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Personality({ k, onSave, onReset }: { k: Knowledge; onSave: (p: unknown) => void; onReset: () => void }) {
  const [name, setName] = useState(k.personality.name);
  const [style, setStyle] = useState(k.personality.style);
  const [rules, setRules] = useState(k.personality.rules.join("\n"));
  return (
    <section className="panel flex flex-col gap-3 p-5">
      <h2 className="font-display text-2xl font-extrabold">Personality</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Name (English)
          <input className="input" value={name.en} maxLength={40} onChange={(e) => setName({ ...name, en: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Name (বাংলা)
          <input className="input font-bangla" value={name.bn} maxLength={40} onChange={(e) => setName({ ...name, bn: e.target.value })} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        Style
        <textarea className="input resize-y" rows={3} maxLength={400} value={style} onChange={(e) => setStyle(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        House rules (one per line)
        <textarea className="input resize-y font-mono !text-sm" rows={6} value={rules} onChange={(e) => setRules(e.target.value)} />
      </label>
      <p className="text-xs text-haze">Pre-recorded clips keep the name they were recorded with; re-render narration after renaming.</p>
      <div className="flex gap-2">
        <Button variant="primary" onClick={() => onSave({ name, style, rules: rules.split("\n") })}>
          Save personality
        </Button>
        <Button onClick={onReset}>Reset to default</Button>
      </div>
    </section>
  );
}

function Narration({ clips, onSet, onApproveAll }: { clips: ClipRow[]; onSet: (items: { key: string; lang: Lang; status: string }[]) => void; onApproveAll: () => void }) {
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const shown = clips.filter((c) => filter === "all" || c.status === "pending");
  const counts = clips.reduce<Record<string, number>>((m, c) => ({ ...m, [c.status]: (m[c.status] ?? 0) + 1 }), {});
  return (
    <section className="panel flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-2xl font-extrabold">Narration clips</h2>
        <span className="font-mono text-xs text-haze">
          {counts.approved ?? 0} approved · {counts.pending ?? 0} to review · {counts.rejected ?? 0} rejected · {counts.missing ?? 0} missing
        </span>
      </div>
      <p className="text-sm text-haze">The TV only plays clips you approve here. Listen first: robotic placeholders and re-rendered clips need a fresh review.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={onApproveAll}>
          Approve all recorded clips
        </Button>
        <Button onClick={() => setFilter(filter === "pending" ? "all" : "pending")}>{filter === "pending" ? "Show all" : "Show only to review"}</Button>
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-haze">Nothing to review.</p>
      ) : (
        <ul className="flex max-h-[32rem] flex-col gap-2 overflow-y-auto pr-1">
          {shown.map((c) => (
            <li key={`${c.key}:${c.lang}`} className="grid gap-2 rounded-xl border border-white/10 bg-white/5 p-3 sm:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <p className="font-mono text-xs text-haze">
                  {c.key} · {c.lang} · <span className={TONE[c.status]}>{c.status}</span>
                  {c.placeholder && <span className="text-gold"> · robotic placeholder</span>}
                  {c.outdated && <span className="text-stamp"> · out of date, re-render</span>}
                  {c.provider && ` · ${c.provider}`}
                </p>
                <p lang={c.lang} className={cx("mt-1 text-sm", c.lang === "bn" && "font-bangla")}>
                  {c.script}
                </p>
                {c.file && <audio controls preload="none" src={`/narration/${c.file}`} className="mt-2 h-9 w-full max-w-md" />}
              </div>
              {c.file && !c.outdated && (
                <div className="flex items-start gap-2">
                  <Button onClick={() => onSet([{ key: c.key, lang: c.lang, status: "approved" }])} aria-label={`Approve ${c.key} ${c.lang}`}>
                    <Check className="size-4" aria-hidden />
                  </Button>
                  <Button variant="danger" onClick={() => onSet([{ key: c.key, lang: c.lang, status: "rejected" }])} aria-label={`Reject ${c.key} ${c.lang}`}>
                    <X className="size-4" aria-hidden />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Announcements({
  k,
  onSave,
  onStatus,
  onDelete,
}: {
  k: Knowledge;
  onSave: (a: { id?: string; title: string; text: { en: string; bn: string } }) => void;
  onStatus: (id: string, s: Status) => void;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState<{ id?: string; title: string; text: { en: string; bn: string } }>({ title: "", text: { en: "", bn: "" } });
  return (
    <section className="panel flex flex-col gap-3 p-5">
      <h2 className="font-display text-2xl font-extrabold">Surprise announcements</h2>
      <p className="text-sm text-haze">Write it, approve it, and the voice is generated and cached in advance, so it plays instantly. If no cloud voice is available it plays with subtitles and a fanfare.</p>
      <div className="grid gap-2">
        <input className="input" placeholder="Title (e.g. Cake is coming)" maxLength={60} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} aria-label="Announcement title" />
        <textarea className="input resize-none" rows={2} maxLength={300} placeholder="English" value={draft.text.en} onChange={(e) => setDraft({ ...draft, text: { ...draft.text, en: e.target.value } })} aria-label="Announcement in English" />
        <textarea lang="bn" className="input resize-none font-bangla" rows={2} maxLength={300} placeholder="বাংলা" value={draft.text.bn} onChange={(e) => setDraft({ ...draft, text: { ...draft.text, bn: e.target.value } })} aria-label="Announcement in Bangla" />
        <div className="flex gap-2">
          <Button
            variant="primary"
            disabled={!draft.title.trim() || (!draft.text.en.trim() && !draft.text.bn.trim())}
            onClick={() => {
              onSave(draft);
              setDraft({ title: "", text: { en: "", bn: "" } });
            }}
          >
            {draft.id ? "Save changes" : "Add announcement"}
          </Button>
          {draft.id && <Button onClick={() => setDraft({ title: "", text: { en: "", bn: "" } })}>Cancel</Button>}
        </div>
      </div>
      <ul className="flex flex-col gap-2">
        {k.announcements.map((a) => (
          <li key={a.id} className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong>{a.title}</strong>
              <span className="font-mono text-xs">
                <span className={TONE[a.status]}>{a.status}</span>
                {a.status === "approved" && <span className="text-haze"> · voice {(["en", "bn"] as const).filter((l) => a.text[l]).map((l) => `${l}: ${a.prepared[l] ?? "…"}`).join(", ")}</span>}
              </span>
            </div>
            {a.text.en && <p className="mt-1">{a.text.en}</p>}
            {a.text.bn && <p className="mt-1 font-bangla text-haze">{a.text.bn}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              {a.status !== "approved" && <Button onClick={() => onStatus(a.id, "approved")}>Approve</Button>}
              {a.status !== "rejected" && <Button variant="danger" onClick={() => onStatus(a.id, "rejected")}>Reject</Button>}
              <Button onClick={() => setDraft({ id: a.id, title: a.title, text: a.text })}>Edit</Button>
              <Button variant="danger" onClick={() => onDelete(a.id)} aria-label={`Delete ${a.title}`}>
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Facts({ k, onAdd, onSuggest, onStatus, onDelete }: { k: Knowledge; onAdd: (t: string) => void; onSuggest: () => void; onStatus: (id: string, s: Status) => void; onDelete: (id: string) => void }) {
  const [text, setText] = useState("");
  return (
    <section className="panel flex flex-col gap-3 p-5">
      <h2 className="font-display text-2xl font-extrabold">Guest facts</h2>
      <p className="text-sm text-haze">Things the AI may mention in jokes and replies. Only approved facts are ever sent to it. Suggestions come from approved invite answers the guest allowed to be shown.</p>
      <div className="flex gap-2">
        <input className="input" value={text} maxLength={200} onChange={(e) => setText(e.target.value)} placeholder="e.g. Mez once got lost in IKEA for two hours" aria-label="New fact" />
        <Button
          variant="primary"
          disabled={text.trim().length < 5}
          onClick={() => {
            onAdd(text);
            setText("");
          }}
        >
          Add
        </Button>
      </div>
      <Button className="self-start" onClick={onSuggest}>
        Suggest from invite answers
      </Button>
      <ul className="flex flex-col gap-1.5">
        {k.facts.map((f) => (
          <li key={f.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
            <span className="min-w-0 flex-1">
              {f.text} <span className={cx("font-mono text-xs", TONE[f.status])}>· {f.status}</span>
              {f.source === "invite" && <span className="font-mono text-xs text-haze"> · from invite</span>}
            </span>
            {f.status !== "approved" && (
              <Button onClick={() => onStatus(f.id, "approved")} aria-label="Approve fact">
                <Check className="size-4" aria-hidden />
              </Button>
            )}
            {f.status !== "rejected" && (
              <Button variant="danger" onClick={() => onStatus(f.id, "rejected")} aria-label="Reject fact">
                <X className="size-4" aria-hidden />
              </Button>
            )}
            <Button variant="danger" onClick={() => onDelete(f.id)} aria-label="Delete fact">
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
