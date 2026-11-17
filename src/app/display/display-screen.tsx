"use client";

import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { cx, Leaderboard, Logo, StatusDot, TILE } from "@/components/ui";
import { HostLine } from "@/components/host-line";
import { useNow } from "@/lib/client/hooks";
import { useHostAudio } from "@/lib/host/client/use-host-audio";
import { BoardsScene, GameStage, SurpriseScene, useGameCues, WheelScene } from "./game-stage";
import { useRoom } from "@/lib/client/use-room";
import { EVENT } from "@/lib/event";
import type { RoomView } from "@/lib/game/types";

/** Where phones should go. On localhost we swap in the laptop's LAN address. */
function joinUrlFor(view: RoomView | null): string | null {
  if (typeof window === "undefined" || !view) return null;
  const override = process.env.NEXT_PUBLIC_BASE_URL;
  if (override) return `${override.replace(/\/$/, "")}/play`;
  const { protocol, hostname, port, origin } = window.location;
  const local = hostname === "localhost" || hostname === "127.0.0.1";
  if (local && view.lanHosts?.[0]) return `${protocol}//${view.lanHosts[0]}${port ? `:${port}` : ""}/play`;
  return `${origin}/play`;
}

export function DisplayScreen() {
  const { view, status, clockOffset } = useRoom("display");
  const joinUrl = joinUrlFor(view);

  const audio = useHostAudio(view);
  useGameCues(view, clockOffset, audio.sfx);

  return (
    <main className="stage flex h-dvh flex-col overflow-hidden">
      <div className="bulbs" aria-hidden />
      <header className="flex items-center justify-between gap-6 px-6 pt-4 lg:px-10">
        <Logo size="sm" />
        <div className="flex items-center gap-6">
          {view && view.phase !== "lobby" && joinUrl && (
            <span className="hidden font-mono text-sm text-haze md:inline">
              Join at <span className="text-gold">{joinUrl.replace(/^https?:\/\//, "")}</span>
            </span>
          )}
          <span className="font-mono text-sm text-haze">{view?.players.length ?? 0} players</span>
          {audio.unlocked && (
            <span className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-widest text-haze" title="Sound is on">
              <Volume2 className="size-4 text-go" aria-hidden /> Sound
            </span>
          )}
          <StatusDot status={status} />
        </div>
      </header>

      <section className="flex min-h-0 flex-1 flex-col px-6 py-6 lg:px-10">
        {!view ? (
          <p className="m-auto text-2xl text-haze">Warming up the stage…</p>
        ) : view.phase === "lobby" ? (
          <Lobby view={view} joinUrl={joinUrl} />
        ) : view.phase === "question" || view.phase === "reveal" ? (
          <QuestionBoard view={view} clockOffset={clockOffset} onCountdown={(left) => {
            if (!view.host.voice) return;
            if (left === 5) audio.clipIfIdle("time_warning", view.host.utterance.lang === "bn" ? "bn" : "en");
            if (left <= 3 && left > 0) audio.sfx("tick");
          }} />
        ) : view.phase === "leaderboard" ? (
          <Board title="Standings" view={view} />
        ) : view.phase === "messages" ? (
          <MessageWall view={view} />
        ) : view.phase === "game" && view.games.game ? (
          <GameStage view={view} clockOffset={clockOffset} sfx={audio.sfx} />
        ) : view.phase === "wheel" ? (
          <WheelScene view={view} sfx={audio.sfx} />
        ) : view.phase === "boards" ? (
          <BoardsScene view={view} />
        ) : view.phase === "surprise" && view.surprise ? (
          <SurpriseScene view={view} />
        ) : view.phase === "cake" ? (
          <Cake view={view} />
        ) : (
          <Finale view={view} />
        )}
      </section>

      {view && view.host.subtitles && (
        <footer className="border-t border-white/10 bg-ink-950/70 px-6 py-4 lg:px-10">
          <HostLine host={view.host} name={view.hostName} speaking={!!audio.speaking} big />
        </footer>
      )}

      {view && !audio.unlocked && (
        <button
          onClick={() => void audio.unlock()}
          className="fixed bottom-28 right-6 z-50 inline-flex animate-pop items-center gap-3 rounded-2xl bg-gold px-6 py-4 font-display text-xl font-extrabold text-ink-950 shadow-[0_8px_0_0_var(--color-gold-deep)] active:translate-y-1"
        >
          <VolumeX className="size-6" aria-hidden /> Click to turn on the host&apos;s voice
        </button>
      )}
    </main>
  );
}

function Qr({ url }: { url: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(url, { margin: 1, width: 560, color: { dark: "#110e26", light: "#f7f0df" } })
      .then((d) => live && setSrc(d))
      .catch(() => live && setSrc(null));
    return () => {
      live = false;
    };
  }, [url]);
  return (
    <div className="file-card aspect-square w-full max-w-[min(38vh,22rem)] p-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- data URL, nothing to optimise */}
      {src ? <img src={src} alt={`QR code to join at ${url}`} className="size-full" /> : <div className="size-full animate-pulse bg-ink-900/10" />}
    </div>
  );
}

function Lobby({ view, joinUrl }: { view: RoomView; joinUrl: string | null }) {
  return (
    <div className="grid min-h-0 flex-1 items-center gap-10 lg:grid-cols-[1.2fr_1fr]">
      <div>
        <Logo size="xl" />
        <p className="mt-6 max-w-xl text-2xl text-haze">
          Every guest is a detective. Every answer is evidence. Tonight&apos;s subject: <strong className="text-cream">{EVENT.guestOfHonour}</strong>.
        </p>
        <div className="mt-8">
          <div className="font-mono text-sm uppercase tracking-[0.3em] text-gold">
            Detectives on the case · {view.players.length}
          </div>
          <ul className="mt-3 flex max-h-[26vh] flex-wrap gap-2 overflow-hidden">
            {view.players.length === 0 && <li className="text-xl text-haze">Waiting for the first detective…</li>}
            {[...view.players].sort((a, b) => a.joinedAt - b.joinedAt).map((p) => (
              <li key={p.id} className="animate-pop rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xl font-semibold">
                <span aria-hidden>{p.avatar}</span> {p.name}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="flex flex-col items-center gap-5 text-center">
        {joinUrl && <Qr url={joinUrl} />}
        <div>
          <div className="font-mono text-sm uppercase tracking-[0.3em] text-haze">Scan, or open</div>
          <div className="mt-1 break-all font-mono text-2xl font-bold text-gold lg:text-3xl">{joinUrl?.replace(/^https?:\/\//, "") ?? "…"}</div>
        </div>
      </div>
    </div>
  );
}

function QuestionBoard({ view, clockOffset, onCountdown }: { view: RoomView; clockOffset: number; onCountdown?: (left: number) => void }) {
  const q = view.question!;
  const now = useNow(200);
  const revealed = view.phase === "reveal";
  const leftMs = q.endsAt && now ? Math.max(0, q.endsAt - (now + clockOffset)) : null;
  const left = leftMs === null ? null : Math.ceil(leftMs / 1000);
  const total = q.tally?.reduce((a, b) => a + b, 0) ?? 0;
  const announced = useRef<string | null>(null);
  useEffect(() => {
    if (revealed || left === null) return;
    const mark = `${q.id}:${left}`;
    if (announced.current === mark) return;
    announced.current = mark;
    onCountdown?.(left);
  }, [left, q.id, revealed, onCountdown]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex items-center justify-between gap-6">
        <span className="font-mono text-lg uppercase tracking-[0.3em] text-gold">
          Question {view.questionIndex + 1} / {view.totalQuestions}
        </span>
        <div className="flex items-center gap-6 font-mono text-lg text-haze">
          <span>
            {view.answeredCount} / {view.players.length} answered
          </span>
          {!revealed && (
            <span
              className={cx(
                "grid size-20 place-items-center rounded-full border-4 text-4xl font-bold tabular-nums",
                left !== null && left <= 5 ? "border-stamp text-stamp" : "border-gold text-gold",
              )}
              aria-label="Seconds left"
            >
              {left ?? "–"}
            </span>
          )}
        </div>
      </div>

      {!revealed && (
        <div className="h-2 overflow-hidden rounded-full bg-white/10" aria-hidden>
          <div className="h-full bg-gold transition-[width] duration-200 ease-linear" style={{ width: `${leftMs === null ? 100 : (leftMs / (q.seconds * 1000)) * 100}%` }} />
        </div>
      )}

      <h1 className="font-display text-4xl font-extrabold leading-tight lg:text-6xl">{q.prompt}</h1>

      <ul className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-2">
        {q.options.map((opt, i) => {
          const correct = revealed && q.correctIndex === i;
          const count = q.tally?.[i] ?? 0;
          return (
            <li
              key={i}
              className={cx(
                "relative flex items-center gap-5 overflow-hidden rounded-3xl px-8 py-5 text-3xl font-extrabold text-ink-950 transition duration-300 lg:text-4xl",
                TILE[i % 4].bg,
                revealed && !correct && "opacity-25",
                correct && "animate-pop ring-8 ring-cream",
              )}
            >
              <span aria-hidden className="text-3xl">{TILE[i % 4].glyph}</span>
              <span className="min-w-0 flex-1">{opt}</span>
              {revealed && (
                <span className="font-mono text-2xl tabular-nums">
                  {correct && "✓ "}
                  {count}
                  <span className="sr-only"> of {total} answers</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Board({ title, view }: { title: string; view: RoomView }) {
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col gap-6">
      <h1 className="font-display text-5xl font-extrabold lg:text-6xl">{title}</h1>
      <div className="min-h-0 flex-1 overflow-hidden">
        <Leaderboard players={view.players} limit={7} big />
      </div>
    </div>
  );
}

function MessageWall({ view }: { view: RoomView }) {
  const notes = view.messages.slice(-9).reverse();
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <h1 className="font-display text-5xl font-extrabold">The evidence locker</h1>
      {notes.length === 0 ? (
        <p className="m-auto text-2xl text-haze">No messages revealed yet. Send one from your phone.</p>
      ) : (
        <ul className="grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-5 overflow-hidden md:grid-cols-2 xl:grid-cols-3">
          {notes.map((m, i) => (
            <li key={m.id} className="file-card animate-rise p-6" style={{ rotate: `${((i % 3) - 1) * 1.2}deg` }}>
              <p className="text-2xl font-medium leading-snug">“{m.text}”</p>
              <p className="mt-3 font-mono text-sm uppercase tracking-[0.2em] text-ink-600">— {m.author}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Cake({ view }: { view: RoomView }) {
  const { candles, lit } = view.cake;
  const out = lit === 0;
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-8 text-center">
      {out && <Confetti />}
      <h1 className="font-display text-5xl font-extrabold lg:text-7xl">
        {out ? <span className="gold-text">Happy birthday, {EVENT.guestOfHonour}!</span> : "Tap your phones. Blow them out!"}
      </h1>
      <div role="img" aria-label={`Birthday cake with ${lit} of ${candles} candles lit`} className="flex flex-col items-center">
        <div className="flex items-end gap-8">
          {Array.from({ length: candles }, (_, i) => (
            <div key={i} className="flex flex-col items-center">
              <div
                className={cx(
                  "mb-1 h-10 w-6 origin-bottom rounded-[50%_50%_50%_50%/60%_60%_40%_40%] bg-gradient-to-t from-stamp via-gold to-cream transition-opacity duration-500",
                  i < lit ? "animate-flicker shadow-[0_0_30px_8px_rgb(246_196_83/0.6)]" : "opacity-0",
                )}
              />
              <div className="h-20 w-4 rounded-sm bg-[repeating-linear-gradient(135deg,var(--color-cream)_0_8px,var(--color-tile-b)_8px_16px)]" />
            </div>
          ))}
        </div>
        <div className="h-16 w-[26rem] max-w-[80vw] rounded-t-3xl bg-cream" />
        <div className="h-6 w-[26rem] max-w-[80vw] bg-stamp" />
        <div className="h-20 w-[30rem] max-w-[90vw] rounded-b-2xl rounded-t-md bg-[#f3b7c4]" />
        <div className="h-3 w-[34rem] max-w-[96vw] rounded-full bg-white/20" />
      </div>
      <p className="font-mono text-xl uppercase tracking-[0.3em] text-haze">
        {out ? "Make a wish" : `${lit} of ${candles} candles lit`}
      </p>
    </div>
  );
}

function Finale({ view }: { view: RoomView }) {
  const [first, second, third] = view.players;
  const podium = [
    { p: second, h: "h-32", place: 2 },
    { p: first, h: "h-48", place: 1 },
    { p: third, h: "h-24", place: 3 },
  ];
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-10 text-center">
      <Confetti />
      <div>
        <div className="stamp text-xl text-stamp">Case closed</div>
        <h1 className="mt-6 font-display text-6xl font-extrabold lg:text-7xl">
          <span className="gold-text">Top detectives</span>
        </h1>
      </div>
      <ol className="flex items-end gap-4">
        {podium.map(({ p, h, place }) => (
          <li key={place} className="flex w-44 flex-col items-center lg:w-56">
            <div className="text-5xl" aria-hidden>{p?.avatar ?? "·"}</div>
            <div className="mt-1 w-full truncate text-2xl font-bold">{p?.name ?? "—"}</div>
            <div className="font-mono text-lg tabular-nums text-gold">{p ? `${p.score} pts` : ""}</div>
            <div className={cx("mt-2 grid w-full place-items-center rounded-t-2xl font-display text-5xl font-extrabold text-ink-950", h, place === 1 ? "bg-gold" : "bg-haze")}>
              {place}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

const CONFETTI = ["🎉", "🎈", "✨", "🎂", "⭐", "🎊"];
function Confetti() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 24 }, (_, i) => (
        <span
          key={i}
          className="absolute -top-12 animate-drift text-4xl"
          style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i * 0.43) % 9}s`, animationDuration: `${7 + (i % 5)}s` }}
        >
          {CONFETTI[i % CONFETTI.length]}
        </span>
      ))}
    </div>
  );
}
