"use client";

import QRCode from "qrcode";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { cx, Leaderboard, Logo, StatusDot, TILE } from "@/components/ui";
import { HostLine } from "@/components/host-line";
import { useNow } from "@/lib/client/hooks";
import { useHostAudio } from "@/lib/host/client/use-host-audio";
import { BoardsScene, GameStage, SurpriseScene, useGameCues, WheelScene } from "./game-stage";
import { useRoom, type ConnectionStatus } from "@/lib/client/use-room";
import { CakeStage, Confetti, RehearsalRibbon, SceneStage, ShowOverlays, TvFrame } from "./show-stage";
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

type Sfx = Parameters<typeof useGameCues>[2];
interface StageAudio {
  sfx: Sfx;
  clipIfIdle?: (key: string, lang: "en" | "bn") => void;
}
const SILENT: StageAudio = { sfx: () => {} };

/** The TV. `?mirror=1` is a silent copy for the organiser's dashboard (no voice, no sound effects). */
export function DisplayScreen() {
  const mirror = useSyncExternalStore(
    noSubscribe,
    () => new URLSearchParams(window.location.search).get("mirror") === "1",
    () => null,
  );
  if (mirror === null) return <TvShell view={null} status={null} clockOffset={0} audio={SILENT} />;
  return mirror ? <MirrorScreen /> : <LiveScreen />;
}
const noSubscribe = () => () => {};

function MirrorScreen() {
  const { view, status, clockOffset } = useRoom("display");
  return <TvShell view={view} status={status} clockOffset={clockOffset} audio={SILENT} />;
}

function LiveScreen() {
  const { view, status, clockOffset } = useRoom("display");
  const audio = useHostAudio(view);
  useGameCues(view, clockOffset, audio.sfx);
  return (
    <TvShell view={view} status={status} clockOffset={clockOffset} audio={audio} speaking={!!audio.speaking} soundOn={audio.unlocked}>
      {view && !audio.unlocked && (
        <button
          onClick={() => void audio.unlock()}
          className="absolute bottom-28 right-6 z-50 inline-flex animate-pop items-center gap-3 rounded-2xl bg-gold px-6 py-4 font-display text-xl font-extrabold text-ink-950 shadow-[0_8px_0_0_var(--color-gold-deep)] active:translate-y-1"
        >
          <VolumeX className="size-6" aria-hidden /> Click to turn on the host&apos;s voice
        </button>
      )}
    </TvShell>
  );
}

export function TvShell({
  view,
  status,
  clockOffset,
  audio,
  speaking = false,
  soundOn = false,
  children,
}: {
  view: RoomView | null;
  status: ConnectionStatus | null;
  clockOffset: number;
  audio: StageAudio;
  speaking?: boolean;
  soundOn?: boolean;
  children?: React.ReactNode;
}) {
  const joinUrl = joinUrlFor(view);
  return (
    <TvFrame>
      <main className="stage relative flex size-full flex-col overflow-hidden">
        <div className="bulbs" aria-hidden />
        <header className="flex items-center justify-between gap-6 px-10 pt-4">
          <Logo size="sm" />
          <div className="flex items-center gap-6">
            {view?.show.rehearsal && <RehearsalRibbon />}
            {view && view.phase !== "lobby" && joinUrl && (
              <span className="font-mono text-sm text-haze">
                Join at <span className="text-gold">{joinUrl.replace(/^https?:\/\//, "")}</span>
              </span>
            )}
            <span className="font-mono text-sm text-haze">{view?.players.length ?? 0} players</span>
            {soundOn && (
              <span className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-widest text-haze" title="Sound is on">
                <Volume2 className="size-4 text-go" aria-hidden /> Sound
              </span>
            )}
            {status && <StatusDot status={status} />}
          </div>
        </header>

        <section className="flex min-h-0 flex-1 flex-col px-10 py-6">
          {!view ? (
            <p className="m-auto text-2xl text-haze">Warming up the stage…</p>
          ) : view.show.hold ? null : (
            // Emergency stop unmounts the scene entirely: no video or sound keeps going underneath.
            <Stage view={view} clockOffset={clockOffset} audio={audio} joinUrl={joinUrl} />
          )}
        </section>

        {view && view.host.subtitles && !view.show.hold && (
          <footer className="border-t border-white/10 bg-ink-950/70 px-10 py-4">
            <HostLine host={view.host} name={view.hostName} speaking={speaking} big />
          </footer>
        )}
        {view && <ShowOverlays view={view} />}
        {children}
      </main>
    </TvFrame>
  );
}

/** What's on the TV for the current phase. Pure: used live, in the silent mirror and in previews. */
export function Stage({ view, clockOffset, audio, joinUrl }: { view: RoomView; clockOffset: number; audio: StageAudio; joinUrl: string | null }) {
  return view.phase === "lobby" ? (
    <Lobby view={view} joinUrl={joinUrl} />
  ) : view.phase === "question" || view.phase === "reveal" ? (
    <QuestionBoard
      view={view}
      clockOffset={clockOffset}
      onCountdown={(left) => {
        if (!view.host.voice || view.show.paused) return;
        if (left === 5) audio.clipIfIdle?.("time_warning", view.host.utterance.lang === "bn" ? "bn" : "en");
        if (left <= 3 && left > 0) audio.sfx("tick");
      }}
    />
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
  ) : view.phase === "scene" && view.scene ? (
    <SceneStage view={view} />
  ) : view.phase === "cake" ? (
    <CakeStage view={view} />
  ) : (
    <Finale view={view} />
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
    <div className="file-card aspect-square w-full max-w-[min(calc(var(--tvh)*38),22rem)] p-3">
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
          <ul className="mt-3 flex max-h-[calc(var(--tvh)*26)] flex-wrap gap-2 overflow-hidden">
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
