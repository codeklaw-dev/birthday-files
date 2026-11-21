"use client";

import { Check, ChevronLeft, ChevronRight, EyeOff, ExternalLink, Minus, Plus, RotateCcw, UserX } from "lucide-react";
import { useEffect, useState } from "react";
import { KeyGate } from "@/components/key-gate";
import { Button, cx, HostLine, Logo, StatusDot } from "@/components/ui";
import { useNow, useStored } from "@/lib/client/hooks";
import { mediaSrc } from "@/lib/client/upload";
import { useRoom, type RoomConnection } from "@/lib/client/use-room";
import { EVENT } from "@/lib/event";
import { premiereSlides } from "@/lib/game/premiere";
import { SURVEY_QUESTIONS } from "@/lib/game/survey-content";
import type { HostAction, Phase, RoomView } from "@/lib/game/types";

export function AdminScreen() {
  const [hostKey, setHostKey] = useStored("session", "bf.hostKey");
  if (hostKey === undefined) return <main className="stage flex-1" />;
  if (hostKey === null) {
    return (
      <KeyGate
        title="Host dashboard"
        description={
          <>
            Enter the host key. In local development the default is <code className="font-mono text-gold">mez-host</code>.
          </>
        }
        label="Host key"
        checkUrl="/api/room/host-check"
        onUnlock={setHostKey}
      />
    );
  }
  return <Dashboard hostKey={hostKey} onLock={() => setHostKey(null)} />;
}

const PHASE_LABEL: Record<Phase, string> = {
  lobby: "Lobby",
  premiere: "Premiere slideshow",
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
            {view.phase === "premiere" && <Premiere view={view} act={act} />}
            <NowShowing view={view} />
            <Messages view={view} act={act} />
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <Players view={view} act={act} />
            <SurveyResults view={view} />
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
      ? { label: "Start the premiere (wish slideshow)", action: { type: "host/premiere" } }
      : phase === "premiere"
        ? { label: "Start the game show", action: { type: "host/start" } }
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
          disabled={phase === "premiere" && view.players.length === 0}
          onClick={() => act(primary.action)}
        >
          {primary.label}
        </Button>
        {phase === "premiere" && view.players.length === 0 && (
          <p className="text-sm text-haze">Waiting for at least one player to join from the TV&apos;s QR code.</p>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Button disabled={open || phase === "premiere"} onClick={() => act({ type: "host/premiere" })}>Premiere</Button>
          <Button disabled={open} onClick={() => act({ type: "host/showLeaderboard" })}>Leaderboard</Button>
          <Button disabled={open} onClick={() => act({ type: "host/showMessages" })}>Message wall</Button>
          <Button disabled={open} onClick={() => act({ type: "host/startCake" })}>Cake</Button>
          <Button disabled={phase === "finished"} onClick={() => act({ type: "host/finish" })}>Finale</Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
          <div role="group" aria-label="Casper language" className="flex items-center gap-1 rounded-xl border border-white/15 p-1">
            {(["en", "bn", "both"] as const).map((l) => (
              <button
                key={l}
                aria-pressed={view.hostLang === l}
                onClick={() => act({ type: "host/setLang", lang: l })}
                className={cx("min-h-9 rounded-lg px-3 text-sm font-semibold", view.hostLang === l ? "bg-gold text-ink-950" : "text-haze hover:text-cream")}
              >
                {l === "en" ? "English" : l === "bn" ? "বাংলা" : "Both"}
              </button>
            ))}
          </div>
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

/** Previous / Next for the wish slideshow on the TV. Arrow keys work too. */
function Premiere({ view, act }: { view: RoomView; act: Act }) {
  const slides = premiereSlides(view.messages);
  const index = Math.min(view.slide, slides.length - 1);
  const slide = slides[index];
  const go = (i: number) => void act({ type: "host/slide", index: Math.max(0, Math.min(slides.length - 1, i)) });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        void act({ type: "host/slide", index: Math.min(slides.length - 1, index + 1) });
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        void act({ type: "host/slide", index: Math.max(0, index - 1) });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [act, index, slides.length]);

  const what =
    slide.kind === "intro"
      ? "Casper's introduction"
      : slide.kind === "outro"
        ? "The end: time for the game show"
        : slide.kind === "flashback"
          ? `Flashback: ${slide.fact.title}`
        : `${slide.message.author}${slide.item ? ` · ${slide.item.kind} ${slide.part} of ${slide.parts}` : " · note"}`;

  return (
    <Card title="Premiere" aside={<span className="font-mono text-xs text-haze">Slide {index + 1} of {slides.length}</span>}>
      <div className="flex flex-col gap-4">
        <p className="text-lg font-semibold">On the TV: {what}</p>
        <div className="grid grid-cols-2 gap-3">
          <Button className="min-h-14 text-lg" disabled={index === 0} onClick={() => go(index - 1)}>
            <ChevronLeft className="size-5" aria-hidden /> Previous
          </Button>
          <Button variant="primary" className="min-h-14 text-lg" disabled={index === slides.length - 1} onClick={() => go(index + 1)}>
            Next <ChevronRight className="size-5" aria-hidden />
          </Button>
        </div>
        <p className="text-sm text-haze">
          Tip: use the ← and → keys. Every wish is included except ones you&apos;ve hidden. When you reach the end, press{" "}
          <strong className="text-cream">Start the game show</strong>.
        </p>
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
      <HostLine line={view.hostLine} lang="both" />
      <p className="mt-3 text-xs text-haze">Casper is running on the silent mock adapter: captions only, no audio.</p>
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
              {p.remote && <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-haze">virtual</span>}
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

/** How party guests answered the before-the-party questions (the answer key for the survey game). */
function SurveyResults({ view }: { view: RoomView }) {
  if (!view.survey) return null;
  const { responses, tallies } = view.survey;
  return (
    <Card title="Before-the-party answers" aside={<span className="font-mono text-xs text-haze">{responses} guests</span>}>
      {responses === 0 ? (
        <p className="text-sm text-haze">No answers yet. Party guests answer after sending their wish on the invite.</p>
      ) : (
        <ol className="flex flex-col gap-4">
          {SURVEY_QUESTIONS.map((q, i) => {
            const max = Math.max(...tallies[i]);
            return (
              <li key={q.id}>
                <p className="text-sm font-semibold">{q.prompt}</p>
                <ul className="mt-1 flex flex-col gap-1">
                  {q.options.map((opt, o) => (
                    <li key={o} className={cx("flex justify-between text-sm", tallies[i][o] === max && max > 0 ? "text-gold" : "text-haze")}>
                      <span>{opt}</span>
                      <span className="font-mono tabular-nums">{tallies[i][o]}</span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
      )}
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
              {m.photo && (
                // eslint-disable-next-line @next/next/no-img-element -- inline data URL from the guest's phone
                <img src={m.photo} alt={`${m.author}'s profile picture`} className="size-10 shrink-0 rounded-full object-cover" />
              )}
              <div className="min-w-0 flex-1">
                {m.media && m.media.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {m.media.map((x, i) =>
                      x.kind === "video" ? (
                        <video key={x.url} src={mediaSrc(x.url)} controls preload="metadata" playsInline className="h-28 max-w-full rounded-lg bg-black" />
                      ) : (
                        <a key={x.url} href={mediaSrc(x.url)} target="_blank" rel="noreferrer" aria-label={`Open photo ${i + 1} from ${m.author}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element -- guest upload served by our API */}
                          <img src={mediaSrc(x.url)} alt="" className="size-16 rounded-lg object-cover" />
                        </a>
                      ),
                    )}
                  </div>
                )}
                {m.text ? <p className="break-words text-sm">{m.text}</p> : <p className="text-sm italic text-haze">No note</p>}
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
