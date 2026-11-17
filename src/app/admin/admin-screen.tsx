"use client";

import { Check, EyeOff, ExternalLink, Minus, Plus, RotateCcw, UserX } from "lucide-react";
import { useState } from "react";
import { Button, cx, Field, HostLine, Logo, StatusDot } from "@/components/ui";
import { useNow, useStored } from "@/lib/client/hooks";
import { useRoom, type RoomConnection } from "@/lib/client/use-room";
import { EVENT } from "@/lib/event";
import { HostControls, HostStatus, HostWriter, PushToTalk } from "./host-panel";
import type { HostAction, Phase, RoomView } from "@/lib/game/types";

export function AdminScreen() {
  const [hostKey, setHostKey] = useStored("session", "bf.hostKey");
  if (hostKey === undefined) return <main className="stage flex-1" />;
  if (hostKey === null) return <KeyGate onUnlock={setHostKey} />;
  return <Dashboard hostKey={hostKey} onLock={() => setHostKey(null)} />;
}

export function KeyGate({ onUnlock }: { onUnlock: (key: string) => void }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main className="stage grid flex-1 place-items-center px-4">
      <form
        className="panel flex w-full max-w-sm flex-col gap-5 p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const res = await fetch("/api/room/host-check", { method: "POST", headers: { "x-host-key": key } }).catch(() => null);
          setBusy(false);
          if (res?.ok) onUnlock(key);
          else setError(res ? "That key doesn't match." : "Can't reach the server.");
        }}
      >
        <Logo size="sm" />
        <div>
          <h1 className="font-display text-2xl font-extrabold">Host dashboard</h1>
          <p className="mt-1 text-sm text-haze">
            Enter the host key. In local development the default is <code className="font-mono text-gold">mez-host</code>.
          </p>
        </div>
        <Field label="Host key">
          <input type="password" required autoFocus value={key} onChange={(e) => setKey(e.target.value)} className="input" autoComplete="current-password" />
        </Field>
        {error && <p role="alert" className="text-sm text-stamp">{error}</p>}
        <Button variant="primary" type="submit" disabled={busy}>{busy ? "Checking…" : "Unlock"}</Button>
      </form>
    </main>
  );
}

const PHASE_LABEL: Record<Phase, string> = {
  lobby: "Lobby",
  question: "Question open",
  reveal: "Answer revealed",
  leaderboard: "Leaderboard",
  messages: "Message wall",
  cake: "Cake ceremony",
  finished: "Finale",
};

function Dashboard({ hostKey, onLock }: { hostKey: string; onLock: () => void }) {
  const room = useRoom("host", { hostKey });
  const { view, status } = room;
  const [error, setError] = useState<string | null>(null);

  const act = async (action: HostAction) => {
    const res = await room.send(action);
    setError(res.ok ? null : (res.error ?? "Action failed."));
  };

  return (
    <main className="stage flex flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-4 py-3 lg:px-8">
        <div className="flex items-center gap-4">
          <Logo size="sm" />
          <span className="rounded-md border border-stamp/50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.25em] text-stamp">Host · private</span>
        </div>
        <div className="flex items-center gap-3">
          <StatusDot status={status} />
          <a href="/admin/submissions" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold hover:bg-white/10">
            Guest submissions
          </a>
          <a href="/display" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold hover:bg-white/10">
            Open TV display <ExternalLink className="size-4" aria-hidden />
          </a>
          <Button onClick={onLock}>Lock</Button>
        </div>
      </header>

      {!view ? (
        <p className="m-auto text-haze">Connecting to the room…</p>
      ) : (
        <div className="grid flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:p-8">
          <div className="flex min-w-0 flex-col gap-4">
            <RunOfShow view={view} act={act} error={error} room={room} />
            <NowShowing view={view} />
            <Messages view={view} act={act} />
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <HostControls view={view} act={act} />
            <HostWriter act={act} hostKey={hostKey} />
            <PushToTalk hostKey={hostKey} />
            <Players view={view} act={act} />
            <HostStatus hostKey={hostKey} />
            <Roadmap />
          </div>
        </div>
      )}
    </main>
  );
}

type Act = (a: HostAction) => Promise<void>;

function Card({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="panel p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.25em] text-gold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function RunOfShow({ view, act, error, room }: { view: RoomView; act: Act; error: string | null; room: RoomConnection }) {
  const now = useNow(250);
  const { phase } = view;
  const open = phase === "question";
  const hasNext = view.questionIndex + 1 < view.totalQuestions;
  const left = view.question?.endsAt && now ? Math.max(0, Math.ceil((view.question.endsAt - (now + room.clockOffset)) / 1000)) : null;

  // One unmistakable next step per phase.
  const primary: { label: string; action: HostAction } =
    phase === "lobby"
      ? { label: "Start the show", action: { type: "host/start" } }
      : open
        ? { label: `Reveal answer${left !== null ? ` (${left}s)` : ""}`, action: { type: "host/reveal" } }
        : phase === "reveal"
          ? { label: "Show leaderboard", action: { type: "host/showLeaderboard" } }
          : phase === "cake"
            ? { label: "Go to finale", action: { type: "host/finish" } }
            : hasNext
              ? { label: `Next question (${view.questionIndex + 2}/${view.totalQuestions})`, action: { type: "host/next" } }
              : phase === "finished"
                ? { label: "Back to leaderboard", action: { type: "host/showLeaderboard" } }
                : { label: "Start cake ceremony", action: { type: "host/startCake" } };

  return (
    <Card
      title="Run of show"
      aside={<span className="rounded-full bg-gold/15 px-3 py-1 font-mono text-xs font-semibold text-gold">{PHASE_LABEL[phase]}</span>}
    >
      <div className="flex flex-col gap-4">
        <Button
          variant="primary"
          className="min-h-14 text-lg"
          disabled={phase === "lobby" && view.players.length === 0}
          onClick={() => act(primary.action)}
        >
          {primary.label}
        </Button>
        {phase === "lobby" && view.players.length === 0 && (
          <p className="text-sm text-haze">Waiting for at least one player to join from the TV&apos;s QR code.</p>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Button disabled={open} onClick={() => act({ type: "host/showLeaderboard" })}>Leaderboard</Button>
          <Button disabled={open} onClick={() => act({ type: "host/showMessages" })}>Message wall</Button>
          <Button disabled={open} onClick={() => act({ type: "host/startCake" })}>Cake</Button>
          <Button disabled={phase === "finished"} onClick={() => act({ type: "host/finish" })}>Finale</Button>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-white/10 pt-4">
          <Button
            variant="danger"
            onClick={() => {
              if (window.confirm("Reset scores and return to the lobby? Players and messages are kept.")) void act({ type: "host/reset" });
            }}
          >
            <RotateCcw className="size-4" aria-hidden /> Reset game
          </Button>
        </div>
        {error && <p role="alert" className="text-sm text-stamp">{error}</p>}
      </div>
    </Card>
  );
}

function NowShowing({ view }: { view: RoomView }) {
  const q = view.question;
  return (
    <Card
      title="On the TV now"
      aside={q && <span className="font-mono text-xs text-haze">{view.answeredCount}/{view.players.length} answered</span>}
    >
      {q ? (
        <div className="mb-4">
          <p className="text-lg font-semibold">{q.prompt}</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {q.options.map((opt, i) => (
              <li
                key={i}
                className={cx(
                  "flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm",
                  q.correctIndex === i ? "border-go/60 bg-go/10" : "border-white/10 bg-white/5",
                )}
              >
                <span className="min-w-0 truncate">
                  {q.correctIndex === i && <Check className="mr-1 inline size-4 text-go" aria-label="Correct answer" />}
                  {opt}
                </span>
                <span className="font-mono tabular-nums text-haze">{q.tally?.[i] ?? 0}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mb-4 text-sm text-haze">{PHASE_LABEL[view.phase]} screen is showing.</p>
      )}
      <HostLine host={view.host} />
    </Card>
  );
}

function Players({ view, act }: { view: RoomView; act: Act }) {
  return (
    <Card title={`Players · ${view.players.length}`}>
      {view.players.length === 0 ? (
        <p className="text-sm text-haze">Nobody yet. Open the TV display and have guests scan the QR code.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {view.players.map((p, i) => (
            <li key={p.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <span className="w-5 font-mono text-xs text-haze">{i + 1}</span>
              <span aria-hidden>{p.avatar}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
              <span className="font-mono font-bold tabular-nums">{p.score}</span>
              <IconButton label={`Take 50 points from ${p.name}`} onClick={() => act({ type: "host/award", playerId: p.id, delta: -50, reason: "Mez's verdict" })}>
                <Minus className="size-4" />
              </IconButton>
              <IconButton label={`Give ${p.name} 50 points`} onClick={() => act({ type: "host/award", playerId: p.id, delta: 50, reason: "Mez's verdict" })}>
                <Plus className="size-4" />
              </IconButton>
              <IconButton
                label={`Remove ${p.name}`}
                danger
                onClick={() => {
                  if (window.confirm(`Remove ${p.name} from the game?`)) void act({ type: "host/kick", playerId: p.id });
                }}
              >
                <UserX className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-haze">± buttons are Mez&apos;s bonus points. Every change is written to the score log.</p>
    </Card>
  );
}

function IconButton({ label, danger, ...props }: { label: string; danger?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      aria-label={label}
      title={label}
      className={cx(
        "grid size-9 shrink-0 place-items-center rounded-lg border transition duration-150",
        danger ? "border-stamp/40 text-stamp hover:bg-stamp/15" : "border-white/15 hover:bg-white/10",
      )}
    />
  );
}

function Messages({ view, act }: { view: RoomView; act: Act }) {
  const pending = view.messages.filter((m) => m.status === "pending").length;
  const ordered = [...view.messages].sort((a, b) => b.createdAt - a.createdAt);
  return (
    <Card title="Guest messages" aside={<span className="font-mono text-xs text-haze">{pending} awaiting review</span>}>
      {ordered.length === 0 ? (
        <p className="text-sm text-haze">No messages yet. Guests can send them from /invite or their phones.</p>
      ) : (
        <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto pr-1">
          {ordered.map((m) => (
            <li key={m.id} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm">{m.text}</p>
                <p className="mt-1 font-mono text-xs text-haze">
                  — {m.author} ·{" "}
                  <span className={cx(m.status === "approved" && "text-go", m.status === "hidden" && "text-stamp", m.status === "pending" && "text-gold")}>
                    {m.status}
                  </span>
                </p>
              </div>
              {m.status !== "approved" && (
                <IconButton label="Approve for the big screen" onClick={() => act({ type: "host/moderate", messageId: m.id, status: "approved" })}>
                  <Check className="size-4" />
                </IconButton>
              )}
              {m.status !== "hidden" && (
                <IconButton label="Hide message" danger onClick={() => act({ type: "host/moderate", messageId: m.id, status: "hidden" })}>
                  <EyeOff className="size-4" />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Roadmap() {
  return (
    <Card title="Game modules">
      <ul className="flex flex-col gap-2 text-sm">
        <li className="flex justify-between gap-3">
          <span>Warm-up quiz</span>
          <span className="font-mono text-xs text-go">playable · mock questions</span>
        </li>
        {EVENT.games.map((g) => (
          <li key={g.id} className="flex justify-between gap-3 text-haze">
            <span>{g.name}</span>
            <span className="font-mono text-xs">not built yet</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
