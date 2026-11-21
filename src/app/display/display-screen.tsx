"use client";

import Image from "next/image";
import QRCode from "qrcode";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, Crown, Volume2, VolumeX } from "lucide-react";
import { Balloons, Streamers } from "@/components/party";
import { cx, TILE } from "@/components/ui";
import { mediaSrc } from "@/lib/client/upload";
import type { ConnectionStatus } from "@/lib/client/use-room";
import type { Bilingual, Lang, Player } from "@/lib/game/types";
import type { MediaItem } from "@/lib/game/media";
import { FLASHBACK_DATE, type FlashbackFact } from "@/lib/game/flashback";
import { premiereSlides, type Slide } from "@/lib/game/premiere";
import cakeArt from "@/assets/party/cake.png";
import discoBall from "@/assets/party/disco-ball.png";
import logo from "@/assets/party/logo.png";
import mezPhoto from "@/assets/party/mez-cake-photo.png";
import partyPopper from "@/assets/party/party-popper.png";
import { getCasper, getTvVoice } from "@/lib/casper";
import { useNow } from "@/lib/client/hooks";
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

/** The TV screen. It needs no key: it only receives wishes while the host is showing the wish wall. */
export function DisplayScreen() {
  return <Stage />;
}

function Stage() {
  const { view, status, clockOffset, send } = useRoom("display");
  const joinUrl = joinUrlFor(view);

  // Casper speaks each new line out loud (once the voice is turned on); the TV shows no captions.
  // Keyed on the words, not the object: every room update (a guest joining, an answer) sends a fresh copy of the same line.
  const en = view?.hostLine.en;
  const bn = view?.hostLine.bn;
  const lang = view?.hostLang;
  useEffect(() => {
    if (en === undefined || bn === undefined || !lang) return;
    const casper = getCasper();
    void casper.say({ text: { en, bn }, lang });
    return () => casper.stop();
  }, [en, bn, lang]);

  return (
    <main className="party-stage relative flex h-dvh flex-col overflow-hidden">
      <FallingConfetti />
      <Sparkles />
      <header className="relative z-10 flex items-center justify-between gap-[2vw] px-[3vw] pt-[2.2vh]">
        <Image src={logo} alt={EVENT.title} preload sizes="240px" className="h-[9vh] w-auto origin-left animate-wiggle drop-shadow-[0_8px_12px_rgb(0_0_0/0.3)]" />
        <div className="flex items-center gap-[1.2vw] text-[1.6vh] font-semibold">
          {view && view.phase !== "lobby" && joinUrl && (
            <span className="rotate-1 rounded-full bg-white px-[1.2vw] py-[0.8vh] text-party-ink shadow-[0_0.4vh_0_rgb(0_0_0/0.2)]">
              Join at <span className="font-bold text-party-purple">{joinUrl.replace(/^https?:\/\//, "")}</span>
            </span>
          )}
          <span className="-rotate-1 rounded-full bg-party-sun px-[1.2vw] py-[0.8vh] text-party-ink shadow-[0_0.4vh_0_rgb(0_0_0/0.2)]">
            {view?.players.length ?? 0} players
          </span>
          {view && <VoiceToggle line={view.hostLine} lang={view.hostLang} />}
          <LivePill status={status} />
        </div>
      </header>

      <section className="relative z-10 flex min-h-0 flex-1 flex-col px-[3vw] pb-[3.5vh] pt-[2vh]">
        {!view ? (
          <p className="m-auto animate-wiggle font-party text-[5vh]">Warming up the stage…</p>
        ) : view.phase === "premiere" ? (
          <Premiere view={view} joinUrl={joinUrl} />
        ) : view.phase === "lobby" ? (
          <Lobby view={view} joinUrl={joinUrl} onLaunch={() => send({ type: "launch" })} />
        ) : view.phase === "question" || view.phase === "reveal" ? (
          <QuestionBoard key={`${view.questionIndex}-${view.phase}`} view={view} clockOffset={clockOffset} />
        ) : view.phase === "leaderboard" ? (
          <Standings players={view.players} />
        ) : view.phase === "messages" ? (
          <MessageWall view={view} />
        ) : view.phase === "cake" ? (
          <Cake view={view} />
        ) : (
          <Finale view={view} />
        )}
      </section>
    </main>
  );
}

const noSubscribe = () => () => {};

/**
 * Browsers only let a page speak after a click, so the TV shows "Turn on voice"
 * until someone presses it. It speaks the current line straight away.
 */
function VoiceToggle({ line, lang }: { line: Bilingual; lang: Lang | "both" }) {
  // Only the browser knows whether it can speak; the server render shows nothing.
  const voice = useSyncExternalStore(noSubscribe, getTvVoice, () => null);
  const [onLocal, setOn] = useState(false);
  if (!voice) return null;
  const on = onLocal || voice.isEnabled;
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => {
        if (on) {
          voice.disable();
          setOn(false);
        } else {
          voice.enable();
          setOn(true);
          void voice.say({ text: line, lang });
        }
      }}
      className={cx(
        "inline-flex items-center gap-[0.5vw] rounded-full px-[1.2vw] py-[0.8vh] font-bold shadow-[0_0.4vh_0_rgb(0_0_0/0.2)]",
        on ? "bg-party-mint text-party-ink" : "animate-wiggle bg-party-pink text-white",
      )}
    >
      {on ? <Volume2 aria-hidden className="size-[2vh]" /> : <VolumeX aria-hidden className="size-[2vh]" />}
      {on ? "Voice on" : "Turn on voice"}
    </button>
  );
}

function LivePill({ status }: { status: ConnectionStatus }) {
  const label = { live: "Live", connecting: "Connecting…", reconnecting: "Reconnecting…" }[status];
  return (
    <span role="status" className="inline-flex items-center gap-[0.5vw] rounded-full bg-party-ink/35 px-[1.2vw] py-[0.8vh] font-mono uppercase tracking-widest">
      <span className={cx("size-[1.2vh] rounded-full", status === "live" ? "animate-pulse bg-party-mint" : "animate-pulse bg-party-sun")} />
      {label}
    </span>
  );
}

const PARTY = ["#ff4f81", "#23aae1", "#ffc93c", "#2bc48a", "#ffffff", "#fff791", "#e0a1e6"];

/** Slow paper confetti drifting down behind every screen. Positions are fixed so the server and TV agree. */
function FallingConfetti({ count = 26 }: { count?: number }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="absolute -top-[6vh] animate-fall rounded-[0.3vh] opacity-80"
          style={{
            left: `${(i * 41 + 7) % 100}%`,
            width: `${0.8 + (i % 3) * 0.4}vh`,
            height: `${1.4 + (i % 4) * 0.5}vh`,
            background: PARTY[i % PARTY.length],
            animationDelay: `${-((i * 1.7) % 12)}s`,
            animationDuration: `${10 + (i % 6) * 1.5}s`,
          }}
        />
      ))}
    </div>
  );
}

/** Twinkling four-point stars scattered around the edges. */
function Sparkles() {
  const spots = [
    [6, 22], [94, 18], [12, 78], [88, 70], [48, 10], [70, 88], [30, 90], [97, 45], [3, 50],
  ];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {spots.map(([x, y], i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          className="absolute animate-twinkle"
          style={{ left: `${x}%`, top: `${y}%`, width: `${2 + (i % 3)}vh`, animationDelay: `${(i * 0.37) % 1.8}s` }}
        >
          <path d="M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0Z" fill={i % 2 ? "#fff791" : "#ffffff"} />
        </svg>
      ))}
    </div>
  );
}

/** A one-off burst of confetti from the centre, for big moments. */
function Burst() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 36 }, (_, i) => {
        const angle = (i / 36) * Math.PI * 2;
        const dist = 30 + (i % 5) * 8;
        return (
          <span
            key={i}
            className="absolute left-1/2 top-1/2 h-[1.8vh] w-[1vh] rounded-[0.3vh]"
            style={
              {
                background: PARTY[i % PARTY.length],
                animation: `burst 1.1s cubic-bezier(0.2, 0.7, 0.3, 1) ${(i % 6) * 0.03}s both`,
                "--bx": `${Math.cos(angle) * dist}vw`,
                "--by": `${Math.sin(angle) * dist * 0.8}vh`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
}

function Qr({ url }: { url: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(url, { margin: 1, width: 640, color: { dark: "#2b1233", light: "#ffffff" } })
      .then((d) => live && setSrc(d))
      .catch(() => live && setSrc(null));
    return () => {
      live = false;
    };
  }, [url]);
  return (
    <div className="relative">
      <div className="aspect-square h-[42vh] max-w-full rotate-2 rounded-[3vh] bg-white p-[1.5vh] shadow-[0_1.5vh_0_rgb(94_31_107/0.45)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL, nothing to optimise */}
        {src ? <img src={src} alt={`QR code to join at ${url}`} className="size-full" /> : <div className="size-full animate-pulse rounded-[2vh] bg-party-purple/10" />}
      </div>
      <span className="absolute -left-[3vw] -top-[2.5vh] origin-center animate-wiggle rounded-full bg-party-pink px-[1.4vw] py-[1vh] font-party text-[3.2vh] text-white shadow-[0_0.6vh_0_rgb(0_0_0/0.25)]">
        Scan me!
      </span>
    </div>
  );
}

const CHIP_TONES = ["bg-party-pink text-white", "bg-party-sky text-party-ink", "bg-party-sun text-party-ink", "bg-party-mint text-party-ink", "bg-white text-party-ink", "bg-party-lilac text-party-ink"];

function Lobby({ view, joinUrl, onLaunch }: { view: RoomView; joinUrl: string | null; onLaunch: () => Promise<{ ok: boolean }> }) {
  const players = [...view.players].sort((a, b) => a.joinedAt - b.joinedAt);
  const [launching, setLaunching] = useState(false);
  const launch = async () => {
    // The click also unlocks sound, so Casper can introduce himself straight away.
    getTvVoice()?.enable();
    setLaunching(true);
    const res = await onLaunch();
    if (!res.ok) setLaunching(false);
  };
  return (
    <div className="relative grid min-h-0 flex-1 grid-cols-[1.25fr_1fr] items-center gap-[4vw]">
      <Streamers className="absolute inset-0 h-full w-full opacity-70" />
      <div className="relative flex min-h-0 flex-col">
        <div className="flex items-end gap-[2vw]">
          <div>
            <p className="inline-block -rotate-2 rounded-full bg-party-sun px-[1.2vw] py-[0.6vh] font-mono text-[1.6vh] font-bold uppercase tracking-[0.3em] text-party-ink">
              It&apos;s party time for
            </p>
            <h1 className="origin-bottom-left animate-wiggle font-party text-[19vh] leading-[0.9] drop-shadow-[0_0.8vh_0_rgb(255_201_60/0.9)]">{EVENT.guestOfHonour}</h1>
          </div>
          <Image src={mezPhoto} alt="" sizes="300px" className="mb-[1vh] h-[24vh] w-auto animate-float drop-shadow-[0_1vh_1.5vh_rgb(0_0_0/0.35)]" />
        </div>
        <p className="mt-[2vh] max-w-[46vw] text-[2.9vh] font-semibold">
          A live game show all about {EVENT.guestOfHonour}. Grab your phone, scan the code and get ready to play!
        </p>
        <button
          type="button"
          onClick={() => void launch()}
          disabled={launching}
          className="mt-[3vh] inline-flex w-fit -rotate-1 items-center gap-[1vw] rounded-full bg-party-yellow px-[3vw] py-[2vh] font-party text-[5.5vh] leading-none text-party-ink shadow-[0_1vh_0_rgb(94_31_107/0.6)] transition hover:scale-105 active:translate-y-[0.6vh] active:shadow-[0_0.3vh_0_rgb(94_31_107/0.6)] disabled:opacity-60"
        >
          🚀 {launching ? "Launching…" : "Launch party"}
        </button>
        <div className="mt-[3.5vh] font-mono text-[1.7vh] font-bold uppercase tracking-[0.3em] text-party-yellow">
          Detectives in the room · {players.length}
        </div>
        <ul className="mt-[1.4vh] flex max-h-[22vh] flex-wrap gap-[0.9vw] overflow-hidden p-[0.5vh]">
          {players.length === 0 && <li className="animate-pulse text-[2.6vh] text-white/85">Waiting for the first detective…</li>}
          {players.map((p, i) => (
            <li
              key={p.id}
              className={cx("animate-bounce-in rounded-full px-[1.3vw] py-[0.9vh] text-[2.5vh] font-bold shadow-[0_0.5vh_0_rgb(0_0_0/0.22)]", CHIP_TONES[i % CHIP_TONES.length])}
              style={{ rotate: `${((i * 7) % 5) - 2}deg` }}
            >
              <span aria-hidden>{p.avatar}</span> {p.name}
            </li>
          ))}
        </ul>
      </div>
      <div className="relative flex flex-col items-center gap-[2.5vh] text-center">
        <Image src={discoBall} alt="" sizes="200px" className="absolute -right-[2vw] -top-[11vh] h-[17vh] w-auto origin-top animate-sway" />
        <Balloons className="absolute -left-[4vw] top-[4vh] h-[24vh] w-auto animate-float" />
        {joinUrl && <Qr url={joinUrl} />}
        <div>
          <div className="font-party text-[3.6vh]">Join the game</div>
          <div className="mt-[1vh] inline-block -rotate-1 break-all rounded-full bg-party-yellow px-[1.5vw] py-[0.8vh] font-mono text-[2.4vh] font-bold text-party-ink shadow-[0_0.5vh_0_rgb(0_0_0/0.2)]">
            {joinUrl?.replace(/^https?:\/\//, "") ?? "…"}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuestionBoard({ view, clockOffset }: { view: RoomView; clockOffset: number }) {
  const q = view.question!;
  const now = useNow(200);
  const revealed = view.phase === "reveal";
  const leftMs = q.endsAt && now ? Math.max(0, q.endsAt - (now + clockOffset)) : null;
  const left = leftMs === null ? null : Math.ceil(leftMs / 1000);
  const total = q.tally?.reduce((a, b) => a + b, 0) ?? 0;
  const urgent = left !== null && left <= 5;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-[2.5vh]">
      {revealed && <Burst />}
      <div className="flex items-start justify-between gap-[2vw]">
        <div className="relative flex-1 -rotate-1 rounded-[3vh] bg-white px-[2.2vw] py-[2.2vh] text-party-ink shadow-[0_1vh_0_rgb(94_31_107/0.45)]">
          <span className="absolute -top-[2vh] left-[2vw] rotate-[-4deg] rounded-full bg-party-pink px-[1.2vw] py-[0.6vh] font-mono text-[1.8vh] font-bold uppercase tracking-[0.25em] text-white">
            Question {view.questionIndex + 1} of {view.totalQuestions}
          </span>
          <h1 className="font-party text-[6vh] leading-[1.1] [text-wrap:balance]">{q.prompt}</h1>
        </div>
        <div className="flex flex-col items-center gap-[1.2vh]">
          {!revealed ? (
            <span aria-label="Seconds left" className="relative grid size-[14vh] place-items-center">
              <span className={cx("absolute inset-0 animate-spin-slow rounded-full border-[0.8vh] border-dashed", urgent ? "border-party-berry" : "border-party-yellow")} />
              <span
                className={cx(
                  "grid size-[11vh] place-items-center rounded-full font-party text-[5.5vh] tabular-nums shadow-[0_0.8vh_0_rgb(0_0_0/0.25)]",
                  urgent ? "animate-pulse bg-party-berry text-white" : "bg-party-yellow text-party-ink",
                )}
              >
                {left ?? "–"}
              </span>
            </span>
          ) : (
            <span className="animate-bounce-in rotate-3 rounded-[2vh] bg-party-mint px-[1.5vw] py-[1.2vh] font-party text-[3.6vh] text-party-ink shadow-[0_0.8vh_0_rgb(0_0_0/0.25)]">
              The answer!
            </span>
          )}
          <span className="rounded-full bg-party-ink/40 px-[1vw] py-[0.6vh] text-[1.9vh] font-semibold">
            {view.answeredCount} of {view.players.length} answered
          </span>
        </div>
      </div>

      {!revealed && (
        <div className="h-[1.4vh] overflow-hidden rounded-full bg-white/20" aria-hidden>
          <div
            className={cx("h-full rounded-full transition-[width] duration-200 ease-linear", urgent ? "bg-party-berry" : "bg-gradient-to-r from-party-pink via-party-sun to-party-mint")}
            style={{ width: `${leftMs === null ? 100 : (leftMs / (q.seconds * 1000)) * 100}%` }}
          />
        </div>
      )}

      <ul className="grid min-h-0 flex-1 grid-cols-2 gap-[1.8vw] p-[1vh]">
        {q.options.map((opt, i) => {
          const { Icon, bg } = TILE[i % 4];
          const correct = revealed && q.correctIndex === i;
          const count = q.tally?.[i] ?? 0;
          return (
            <li key={i} className="animate-bounce-in" style={{ animationDelay: revealed ? "0ms" : `${i * 90}ms` }}>
              <div
                className={cx(
                  "relative flex h-full items-center gap-[1.5vw] rounded-[3.5vh] px-[2vw] py-[2vh] text-[4.6vh] font-extrabold leading-tight text-party-ink transition duration-300",
                  "shadow-[0_1vh_0_rgb(0_0_0/0.22)]",
                  bg,
                  revealed && !correct && "scale-95 opacity-30 saturate-50",
                  correct && "animate-wiggle ring-[1vh] ring-white",
                )}
                style={correct ? undefined : { rotate: `${i % 2 ? 1 : -1}deg` }}
              >
                <span aria-hidden className="grid size-[10vh] shrink-0 place-items-center rounded-full bg-white/45">
                  <Icon className="size-[5.5vh]" fill="currentColor" strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">{opt}</span>
                {revealed && (
                  <span className="flex items-center gap-[0.5vw] rounded-full bg-white px-[1.2vw] py-[0.6vh] font-mono text-[3vh] tabular-nums">
                    {correct && <Check aria-hidden className="size-[3.5vh] text-party-green" strokeWidth={3} />}
                    {count}
                    <span className="sr-only"> of {total} answers</span>
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const RANK_TONES = ["bg-party-yellow", "bg-party-sky", "bg-party-pink", "bg-white"];

function Standings({ players }: { players: Player[] }) {
  const rows = players.slice(0, 7);
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[72vw] flex-1 flex-col gap-[2.5vh]">
      <h1 className="text-center font-party text-[8vh] leading-none drop-shadow-[0_0.7vh_0_rgb(255_201_60/0.9)]">Who&apos;s winning?</h1>
      {rows.length === 0 ? (
        <p className="m-auto text-[3vh]">No detectives yet.</p>
      ) : (
        <ol className="flex min-h-0 flex-1 flex-col gap-[1.4vh] overflow-visible">
          {rows.map((p, i) => (
            <li
              key={p.id}
              style={{ animationDelay: `${i * 110}ms`, rotate: `${i % 2 ? 0.6 : -0.6}deg` }}
              className={cx(
                "relative flex animate-bounce-in items-center gap-[1.5vw] rounded-[2.5vh] px-[2vw] py-[1.3vh] text-[3.6vh] font-bold text-party-ink shadow-[0_0.6vh_0_rgb(0_0_0/0.22)]",
                RANK_TONES[Math.min(i, 3)],
                i === 0 && "scale-[1.03]",
              )}
            >
              {i === 0 && <Crown aria-hidden className="absolute -left-[1.5vw] -top-[3vh] size-[6vh] -rotate-12 animate-wiggle fill-party-sun text-party-ink" strokeWidth={1.5} />}
              <span className="grid size-[6vh] shrink-0 place-items-center rounded-full bg-party-ink font-party text-[3.2vh] text-white">{i + 1}</span>
              <span aria-hidden className="text-[4.2vh]">{p.avatar}</span>
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              {p.remote && <span className="rounded-full bg-white/70 px-[0.9vw] py-[0.3vh] font-mono text-[1.6vh] uppercase tracking-widest">virtual</span>}
              <span className="font-party text-[4.4vh] tabular-nums">{p.score}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** The premiere: one wish photo/video per slide, moved on from the host's laptop. */
function Premiere({ view, joinUrl }: { view: RoomView; joinUrl: string | null }) {
  const slides = premiereSlides(view.messages);
  const index = Math.min(view.slide, slides.length - 1);
  const slide = slides[index];
  const wishCount = new Set(slides.flatMap((s) => (s.kind === "wish" ? [s.message.id] : []))).size;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[2vh]">
      <div key={index} className="flex min-h-0 flex-1 animate-bounce-in flex-col">
        {slide.kind === "intro" ? (
          <PremiereIntro wishes={wishCount} />
        ) : slide.kind === "outro" ? (
          <PremiereOutro joinUrl={joinUrl} />
        ) : slide.kind === "flashback" ? (
          <FlashbackSlide fact={slide.fact} />
        ) : (
          <WishSlide slide={slide} />
        )}
      </div>
      <div className="flex items-center gap-[1.5vw]" aria-hidden>
        <div className="h-[1.2vh] flex-1 overflow-hidden rounded-full bg-white/20">
          <div className="h-full rounded-full bg-party-yellow transition-[width] duration-500" style={{ width: `${((index + 1) / slides.length) * 100}%` }} />
        </div>
        <span className="font-mono text-[1.8vh] font-semibold tabular-nums">
          {index + 1} / {slides.length}
        </span>
      </div>
    </div>
  );
}

function PremiereIntro({ wishes }: { wishes: number }) {
  return (
    <div className="relative grid flex-1 grid-cols-[1.15fr_1fr] items-center gap-[4vw]">
      <div className="flex flex-col gap-[3vh]">
        <span className="w-fit -rotate-2 rounded-full bg-party-pink px-[1.6vw] py-[1vh] font-mono text-[2.2vh] font-bold uppercase tracking-[0.3em] text-white shadow-[0_0.6vh_0_rgb(0_0_0/0.25)]">
          Tonight&apos;s premiere
        </span>
        <h1 className="font-party text-[11vh] leading-[0.95] drop-shadow-[0_0.8vh_0_rgb(94_31_107/0.5)]">
          Hello, I&apos;m <span className="inline-block animate-wiggle text-party-yellow">Casper</span> 👋
        </h1>
        <p className="max-w-[48vw] text-[3.6vh] font-semibold leading-snug">
          The AI voice of <span className="text-party-yellow">RACO AI Technologies</span>, and your host tonight!
        </p>
        <p className="w-fit rotate-1 rounded-[2vh] bg-white px-[1.6vw] py-[1.4vh] text-[3vh] font-bold text-party-ink shadow-[0_0.8vh_0_rgb(0_0_0/0.2)]">
          First up: {wishes} {wishes === 1 ? "wish" : "wishes"} for {EVENT.guestOfHonour} 💌
        </p>
      </div>
      <div className="relative flex items-center justify-center">
        <Image src={discoBall} alt="" sizes="20vw" className="absolute -right-[1vw] -top-[6vh] h-[20vh] w-auto animate-sway" />
        <div className="rotate-3 bg-white p-[1.6vh] pb-[5vh] shadow-[0_2vh_3vh_rgb(43_18_51/0.4)]">
          <Image src={mezPhoto} alt={EVENT.guestOfHonour} sizes="35vw" className="h-[50vh] w-auto object-cover" />
          <p className="absolute bottom-[1.2vh] left-0 right-0 text-center font-party text-[3.2vh] text-party-purple">Happy birthday, {EVENT.guestOfHonour}!</p>
        </div>
        <Image src={partyPopper} alt="" sizes="12vw" className="absolute -bottom-[4vh] -left-[2vw] h-[16vh] w-auto animate-float" />
      </div>
    </div>
  );
}

function FlashbackSlide({ fact }: { fact: FlashbackFact }) {
  if (fact.cover) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-[3vh] text-center">
        <span className="animate-float text-[18vh] leading-none drop-shadow-[0_1vh_0_rgb(0_0_0/0.2)]">{fact.emoji}</span>
        <span className="-rotate-2 rounded-full bg-party-pink px-[1.8vw] py-[1vh] font-mono text-[2.4vh] font-bold uppercase tracking-[0.35em] text-white shadow-[0_0.6vh_0_rgb(0_0_0/0.25)]">
          {fact.kicker}
        </span>
        <h1 className="max-w-[80vw] font-party text-[9vh] leading-[1.02] drop-shadow-[0_0.8vh_0_rgb(94_31_107/0.5)]">
          All the cool stuff that happened on{" "}
          <span className="inline-block animate-wiggle text-party-yellow">{FLASHBACK_DATE}</span>
        </h1>
        <p className="text-[3.4vh] font-semibold">{fact.body}</p>
      </div>
    );
  }
  return (
    <div className="grid flex-1 grid-cols-[minmax(0,0.8fr)_minmax(0,1.5fr)] items-center gap-[4vw]">
      <div className="relative flex items-center justify-center">
        <div className="grid aspect-square w-[30vw] max-w-full -rotate-3 place-items-center rounded-[5vh] bg-white shadow-[0_2vh_0_rgb(94_31_107/0.45)]">
          <span className="animate-float text-[24vh] leading-none">{fact.emoji}</span>
        </div>
        <span className="absolute -top-[3vh] right-0 rotate-6 rounded-full bg-party-sun px-[1.4vw] py-[1vh] font-party text-[3vh] text-party-ink shadow-[0_0.6vh_0_rgb(0_0_0/0.25)]">
          {FLASHBACK_DATE}
        </span>
      </div>
      <div className="flex flex-col gap-[3vh]">
        <span className="w-fit -rotate-1 rounded-full bg-party-pink px-[1.6vw] py-[0.9vh] font-mono text-[2.2vh] font-bold uppercase tracking-[0.3em] text-white">
          {fact.kicker}
        </span>
        <h1 className="font-party text-[9vh] leading-[0.98] drop-shadow-[0_0.8vh_0_rgb(94_31_107/0.5)]">{fact.title}</h1>
        <p className="rotate-[0.5deg] rounded-[3vh] bg-white px-[2vw] py-[2.6vh] text-[3.4vh] font-semibold leading-snug text-party-ink shadow-[0_1vh_0_rgb(0_0_0/0.2)]">
          {fact.body}
        </p>
      </div>
    </div>
  );
}

function PremiereOutro({ joinUrl }: { joinUrl: string | null }) {
  return (
    <div className="grid flex-1 grid-cols-[1.3fr_1fr] items-center gap-[4vw]">
      <div className="flex flex-col gap-[3vh]">
        <h1 className="font-party text-[11vh] leading-[0.95] drop-shadow-[0_0.8vh_0_rgb(94_31_107/0.5)]">
          Let the <span className="inline-block animate-wiggle text-party-yellow">game show</span> begin! 🎉
        </h1>
        <p className="text-[3.6vh] font-semibold">Grab your phone and scan the code to join. Get ready, detectives!</p>
        {joinUrl && (
          <p className="w-fit rounded-full bg-white px-[1.6vw] py-[1vh] text-[2.6vh] font-bold text-party-purple">{joinUrl.replace(/^https?:\/\//, "")}</p>
        )}
      </div>
      <div className="flex justify-center">{joinUrl && <Qr url={joinUrl} />}</div>
    </div>
  );
}

function WishSlide({ slide }: { slide: Extract<Slide, { kind: "wish" }> }) {
  const { message: m, item } = slide;
  const author = (
    <div className="flex items-center gap-[1vw]">
      {m.photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- inline data URL from the guest's phone
        <img src={m.photo} alt="" className="size-[10vh] shrink-0 rounded-full object-cover ring-[0.6vh] ring-party-yellow" />
      ) : (
        <span aria-hidden className="grid size-[10vh] shrink-0 place-items-center rounded-full bg-party-lilac font-party text-[5vh] text-party-plum ring-[0.6vh] ring-party-yellow">
          {m.author.slice(0, 1).toUpperCase()}
        </span>
      )}
      <div className="min-w-0">
        <p className="font-mono text-[1.8vh] font-semibold uppercase tracking-[0.25em] text-party-yellow">A wish from</p>
        <p className={cx("font-party leading-none break-words", m.author.length > 12 ? "text-[4.5vh]" : "text-[6vh]")}>{m.author}</p>
      </div>
    </div>
  );

  if (!item) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-[5vh]">
        <blockquote className="relative max-w-[72vw] -rotate-1 rounded-[4vh] bg-white px-[4vw] py-[6vh] text-center text-party-ink shadow-[0_2vh_0_rgb(94_31_107/0.45)]">
          <span aria-hidden className="absolute -top-[5vh] left-[3vw] font-party text-[14vh] leading-none text-party-pink">“</span>
          <p className={cx("font-party leading-tight", m.text.length > 220 ? "text-[4vh]" : m.text.length > 100 ? "text-[5.5vh]" : "text-[7vh]")}>{m.text}</p>
        </blockquote>
        {author}
      </div>
    );
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)] gap-[3vw]">
      <div className="flex min-h-0 items-center justify-center">
        <div className="flex h-full max-h-full min-h-0 -rotate-1 items-center justify-center bg-white p-[1.4vh] shadow-[0_2vh_3vh_rgb(43_18_51/0.4)]">
          <WishMedia item={item} />
        </div>
      </div>
      <div className="flex min-h-0 flex-col justify-center gap-[3vh]">
        {author}
        {m.text && (
          <p className={cx("rotate-1 rounded-[3vh] bg-white px-[1.8vw] py-[2.4vh] font-semibold leading-snug text-party-ink shadow-[0_1vh_0_rgb(0_0_0/0.2)]", m.text.length > 260 ? "text-[2.4vh]" : m.text.length > 120 ? "text-[2.9vh]" : "text-[3.6vh]")}>
            “{m.text}”
          </p>
        )}
        {slide.parts > 1 && (
          <div className="flex flex-wrap items-center gap-[0.6vw]" aria-label={`${slide.part} of ${slide.parts}`}>
            {Array.from({ length: slide.parts }, (_, i) => (
              <span key={i} className={cx("h-[1.4vh] rounded-full", i + 1 === slide.part ? "w-[3vw] bg-party-yellow" : "w-[1.4vh] bg-white/40")} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Photos fill the frame; videos play with sound (muted only if the browser refuses). */
function WishMedia({ item }: { item: MediaItem }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = false;
    v.play().catch(() => {
      v.muted = true;
      void v.play().catch(() => {});
    });
  }, [item.url]);
  return item.kind === "video" ? (
    <video ref={ref} key={item.url} src={mediaSrc(item.url)} controls playsInline className="max-h-[70vh] max-w-full bg-black object-contain" />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element -- guest upload served by our API
    <img key={item.url} src={mediaSrc(item.url)} alt="" className="max-h-[70vh] max-w-full object-contain" />
  );
}

const TAPE = ["bg-party-pink/70", "bg-party-sky/70", "bg-party-sun/80", "bg-party-mint/70"];

function MessageWall({ view }: { view: RoomView }) {
  const notes = view.messages.slice(-6).reverse();
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[3vh]">
      <h1 className="font-party text-[7vh] leading-none">
        Wishes for <span className="inline-block animate-wiggle text-party-yellow">{EVENT.guestOfHonour}</span> 💌
      </h1>
      {notes.length === 0 ? (
        <p className="m-auto text-[3vh] font-semibold">No wishes revealed yet. They appear here once the host approves them.</p>
      ) : (
        <ul className="grid min-h-0 flex-1 auto-rows-min grid-cols-3 gap-[2vw] overflow-hidden px-[1vw] pt-[2vh]">
          {notes.map((m, i) => (
            <li
              key={m.id}
              className="relative flex animate-bounce-in flex-col bg-white p-[1.6vh] pb-[2.2vh] text-party-ink shadow-[0_1.2vh_2vh_rgb(43_18_51/0.35)]"
              style={{ rotate: `${[-2.5, 1.5, -1, 2.2, -1.8, 1][i % 6]}deg`, animationDelay: `${i * 120}ms` }}
            >
              <span aria-hidden className={cx("absolute -top-[1.6vh] left-1/2 h-[3.2vh] w-[9vw] -translate-x-1/2 rotate-[-3deg]", TAPE[i % TAPE.length])} />
              {m.media && m.media.length > 0 && (
                <div className={cx("mb-[1.5vh] grid gap-[0.5vw]", m.media.length > 1 && "grid-cols-2")}>
                  {m.media.slice(0, 4).map((x) =>
                    x.kind === "video" ? (
                      <video key={x.url} src={mediaSrc(x.url)} autoPlay muted loop playsInline className="max-h-[26vh] w-full bg-black object-cover" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element -- guest upload served by our API
                      <img key={x.url} src={mediaSrc(x.url)} alt="" className={cx("w-full object-cover", m.media!.length > 1 ? "aspect-square" : "max-h-[26vh]")} />
                    ),
                  )}
                </div>
              )}
              {m.text && <p className="text-[2.7vh] font-semibold leading-snug">“{m.text}”</p>}
              <div className="mt-auto flex items-center gap-[0.8vw] pt-[1.5vh]">
                {m.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- inline data URL from the guest's phone
                  <img src={m.photo} alt="" className="size-[6vh] shrink-0 rounded-full object-cover ring-[0.4vh] ring-party-yellow" />
                ) : (
                  <span aria-hidden className="grid size-[6vh] shrink-0 place-items-center rounded-full bg-party-lilac font-party text-[2.8vh] text-party-plum">
                    {m.author.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <p className="font-party text-[2.6vh] text-party-purple">{m.author}</p>
              </div>
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
    <div className="relative flex flex-1 flex-col items-center justify-center gap-[3vh] text-center">
      {out && <Burst />}
      <h1 className={cx("font-party text-[8vh] leading-none drop-shadow-[0_0.7vh_0_rgb(0_0_0/0.2)]", out && "animate-bounce-in")}>
        {out ? (
          <>
            Happy birthday, <span className="inline-block animate-wiggle text-party-yellow">{EVENT.guestOfHonour}!</span>
          </>
        ) : (
          "Tap your phones. Blow them out!"
        )}
      </h1>
      <div className="relative flex items-end justify-center gap-[3vw]">
        {out && <Image src={partyPopper} alt="" sizes="260px" className="h-[24vh] w-auto -scale-x-100 animate-bounce-in" />}
        <Image src={cakeArt} alt="" sizes="520px" className={cx("h-[42vh] w-auto drop-shadow-[0_1.5vh_2vh_rgb(0_0_0/0.3)]", out ? "animate-wiggle" : "animate-float")} />
        {out && <Image src={partyPopper} alt="" sizes="260px" className="h-[24vh] w-auto animate-bounce-in" />}
      </div>
      <div
        role="img"
        aria-label={out ? "All candles are out" : `${lit} of ${candles} candles still lit`}
        className="flex items-center gap-[1.6vw] rounded-full bg-white px-[2vw] py-[1.2vh] text-party-ink shadow-[0_0.8vh_0_rgb(94_31_107/0.4)]"
      >
        <div className="flex items-end gap-[1.2vw]" aria-hidden>
          {Array.from({ length: candles }, (_, i) => (
            <div key={i} className="flex flex-col items-center">
              <div
                className={cx(
                  "mb-[0.3vh] h-[3.6vh] w-[1.8vh] origin-bottom rounded-[50%_50%_50%_50%/60%_60%_40%_40%] bg-gradient-to-t from-party-berry via-party-sun to-white transition-opacity duration-500",
                  i < lit ? "animate-flicker shadow-[0_0_2vh_0.6vh_rgb(255_201_60/0.7)]" : "opacity-0",
                )}
              />
              <div className={cx("h-[5vh] w-[1.3vh] rounded-sm bg-[repeating-linear-gradient(135deg,#fff_0_0.7vh,var(--color-party-sky)_0.7vh_1.4vh)] ring-1 ring-party-ink/10", i >= lit && "opacity-50")} />
            </div>
          ))}
        </div>
        <span className="font-mono text-[2.2vh] font-semibold uppercase tracking-[0.25em]">{out ? "Make a wish" : `${lit} of ${candles} still lit`}</span>
      </div>
    </div>
  );
}

function Finale({ view }: { view: RoomView }) {
  const [first, second, third] = view.players;
  const podium = [
    { p: second, h: "h-[18vh]", place: 2, tone: "bg-party-sky" },
    { p: first, h: "h-[27vh]", place: 1, tone: "bg-party-yellow" },
    { p: third, h: "h-[13vh]", place: 3, tone: "bg-party-pink" },
  ];
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-[4vh] text-center">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-[10vh] bottom-0 bg-[conic-gradient(from_200deg_at_50%_0%,transparent_0deg,rgb(255_247_145/0.22)_12deg,transparent_24deg,transparent_40deg,rgb(255_255_255/0.16)_52deg,transparent_64deg,transparent_80deg,rgb(255_247_145/0.22)_92deg,transparent_104deg)]" />
      <Burst />
      <div className="relative">
        <div className="stamp animate-bounce-in bg-white text-[2.4vh] text-party-berry">Case closed</div>
        <h1 className="mt-[2.5vh] animate-bounce-in font-party text-[10vh] leading-none drop-shadow-[0_0.8vh_0_rgb(255_201_60/0.9)]">Top detectives</h1>
      </div>
      <ol className="relative flex items-end gap-[1.5vw]">
        {podium.map(({ p, h, place, tone }, i) => (
          <li key={place} className="flex w-[18vw] animate-bounce-in flex-col items-center" style={{ animationDelay: `${300 + i * 200}ms` }}>
            {place === 1 && <Crown aria-hidden className="mb-[0.5vh] size-[7vh] animate-wiggle fill-party-sun text-party-ink" strokeWidth={1.5} />}
            <div className="text-[7vh]" aria-hidden>
              {p?.avatar ?? "·"}
            </div>
            <div className="mt-[0.5vh] w-full truncate font-party text-[3.6vh]">{p?.name ?? "—"}</div>
            <div className="font-mono text-[2.2vh] font-semibold tabular-nums text-party-yellow">{p ? `${p.score} pts` : ""}</div>
            <div className={cx("mt-[1vh] grid w-full place-items-center rounded-t-[3vh] font-party text-[8vh] text-party-ink shadow-[inset_0_-1vh_0_rgb(0_0_0/0.12)]", h, tone)}>
              {place}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
