"use client";

import Image from "next/image";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { KeyGate } from "@/components/key-gate";
import { Balloons, Streamers } from "@/components/party";
import { cx, TILE } from "@/components/ui";
import { mediaSrc } from "@/lib/client/upload";
import type { ConnectionStatus } from "@/lib/client/use-room";
import type { Bilingual, Lang, Player } from "@/lib/game/types";
import cakeArt from "@/assets/party/cake.png";
import discoBall from "@/assets/party/disco-ball.png";
import logo from "@/assets/party/logo.png";
import mezPhoto from "@/assets/party/mez-cake-photo.png";
import partyPopper from "@/assets/party/party-popper.png";
import { getCasper } from "@/lib/casper";
import { useNow, useStored } from "@/lib/client/hooks";
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

/** The TV is locked: wishes appear on it, so only someone with the TV (or host) key can open it. */
export function DisplayScreen() {
  const [displayKey, setDisplayKey] = useStored("local", "bf.displayKey");

  // If the key changes on the server, a remembered key stops working: ask again.
  useEffect(() => {
    if (!displayKey) return;
    let cancelled = false;
    fetch("/api/room/display-check", { method: "POST", headers: { "x-host-key": displayKey } })
      .then((res) => {
        if (!cancelled && res.status === 401) setDisplayKey(null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [displayKey, setDisplayKey]);

  if (displayKey === undefined) return <main className="stage flex-1" />;
  if (displayKey === null) {
    return (
      <KeyGate
        title="TV screen"
        description="Enter the TV key (or the host key). This TV remembers it, so you only do this once."
        label="TV key"
        checkUrl="/api/room/display-check"
        onUnlock={setDisplayKey}
      />
    );
  }
  return <Stage displayKey={displayKey} />;
}

function Stage({ displayKey }: { displayKey: string }) {
  const { view, status, clockOffset } = useRoom("display", { hostKey: displayKey });
  const joinUrl = joinUrlFor(view);

  // Hand each new host line to Casper. The mock adapter is silent, so the
  // captions below are the whole experience until the real adapter exists.
  const line = view?.hostLine;
  const lang = view?.hostLang;
  useEffect(() => {
    if (!line || !lang) return;
    const casper = getCasper();
    void casper.say({ text: line, lang });
    return () => casper.stop();
  }, [line, lang]);

  return (
    <main className="party-stage relative flex h-dvh flex-col overflow-hidden">
      <header className="relative z-10 flex items-center justify-between gap-[2vw] px-[3vw] pt-[2.2vh]">
        <Image src={logo} alt={EVENT.title} preload sizes="240px" className="h-[9vh] w-auto -rotate-3 drop-shadow-[0_8px_12px_rgb(0_0_0/0.3)]" />
        <div className="flex items-center gap-[1.2vw] text-[1.6vh] font-semibold">
          {view && view.phase !== "lobby" && joinUrl && (
            <span className="rounded-full bg-white px-[1.2vw] py-[0.8vh] text-party-ink">
              Join at <span className="font-bold text-party-purple">{joinUrl.replace(/^https?:\/\//, "")}</span>
            </span>
          )}
          <span className="rounded-full bg-party-ink/35 px-[1.2vw] py-[0.8vh]">{view?.players.length ?? 0} players</span>
          <LivePill status={status} />
        </div>
      </header>

      <section className="relative z-10 flex min-h-0 flex-1 flex-col px-[3vw] py-[2.5vh]">
        {!view ? (
          <p className="m-auto font-party text-[4vh]">Warming up the stage…</p>
        ) : view.phase === "lobby" ? (
          <Lobby view={view} joinUrl={joinUrl} />
        ) : view.phase === "question" || view.phase === "reveal" ? (
          <QuestionBoard view={view} clockOffset={clockOffset} />
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

      {view && <HostBar line={view.hostLine} lang={view.hostLang} />}
    </main>
  );
}

function LivePill({ status }: { status: ConnectionStatus }) {
  const label = { live: "Live", connecting: "Connecting…", reconnecting: "Reconnecting…" }[status];
  return (
    <span role="status" className="inline-flex items-center gap-[0.5vw] rounded-full bg-party-ink/35 px-[1.2vw] py-[0.8vh] font-mono uppercase tracking-widest">
      <span className={cx("size-[1.2vh] rounded-full", status === "live" ? "bg-party-mint" : "animate-pulse bg-party-sun")} />
      {label}
    </span>
  );
}

/** Casper's caption bar along the bottom of the TV. */
function HostBar({ line, lang }: { line: Bilingual; lang: Lang | "both" }) {
  const show: Lang[] = lang === "both" ? ["en", "bn"] : [lang];
  return (
    <footer className="relative z-10 mx-[3vw] mb-[2.5vh] flex items-center gap-[1.5vw] rounded-[2.5vh] bg-party-ink/55 px-[2vw] py-[1.8vh]" aria-live="polite">
      <div aria-hidden className="grid size-[7vh] shrink-0 place-items-center rounded-full bg-party-yellow font-party text-[3.5vh] text-party-ink shadow-[0_0.5vh_0_rgb(0_0_0/0.25)]">
        C
      </div>
      <div className="min-w-0">
        <div className="font-mono text-[1.4vh] font-semibold uppercase tracking-[0.3em] text-party-yellow">Casper · host</div>
        {show.map((l) => (
          <p key={l} lang={l} className={cx("text-[2.6vh] leading-snug", l === "bn" ? "font-bangla" : "font-semibold", l === "bn" && lang === "both" && "text-white/80")}>
            {line[l]}
          </p>
        ))}
      </div>
    </footer>
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
    <div className="aspect-square h-[42vh] max-w-full rotate-2 rounded-[3vh] bg-white p-[1.5vh] shadow-[0_1.5vh_0_rgb(94_31_107/0.45)]">
      {/* eslint-disable-next-line @next/next/no-img-element -- data URL, nothing to optimise */}
      {src ? <img src={src} alt={`QR code to join at ${url}`} className="size-full" /> : <div className="size-full animate-pulse rounded-[2vh] bg-party-purple/10" />}
    </div>
  );
}

function Lobby({ view, joinUrl }: { view: RoomView; joinUrl: string | null }) {
  const players = [...view.players].sort((a, b) => a.joinedAt - b.joinedAt);
  return (
    <div className="relative grid min-h-0 flex-1 grid-cols-[1.25fr_1fr] items-center gap-[4vw]">
      <Streamers className="absolute inset-0 h-full w-full opacity-70" />
      <div className="relative flex min-h-0 flex-col">
        <div className="flex items-end gap-[2vw]">
          <div>
            <p className="inline-block rounded-full bg-white/15 px-[1.2vw] py-[0.6vh] font-mono text-[1.6vh] font-semibold uppercase tracking-[0.3em] text-party-yellow">
              Tonight&apos;s subject
            </p>
            <h1 className="font-party text-[19vh] leading-[0.9] drop-shadow-[0_0.8vh_0_rgb(255_201_60/0.9)]">{EVENT.guestOfHonour}</h1>
          </div>
          <Image src={mezPhoto} alt="" sizes="300px" className="mb-[1vh] h-[24vh] w-auto drop-shadow-[0_1vh_1.5vh_rgb(0_0_0/0.35)]" />
        </div>
        <p className="mt-[2vh] max-w-[46vw] text-[2.8vh] font-semibold">
          A live game show all about {EVENT.guestOfHonour}. Every guest is a detective. Grab your phone and join in!
        </p>
        <div className="mt-[3.5vh] font-mono text-[1.7vh] font-semibold uppercase tracking-[0.3em] text-party-yellow">
          Detectives in the room · {players.length}
        </div>
        <ul className="mt-[1.2vh] flex max-h-[22vh] flex-wrap gap-[0.8vw] overflow-hidden">
          {players.length === 0 && <li className="text-[2.6vh] text-white/85">Waiting for the first detective…</li>}
          {players.map((p) => (
            <li key={p.id} className="animate-pop rounded-full bg-white px-[1.2vw] py-[0.8vh] text-[2.4vh] font-bold text-party-ink shadow-[0_0.5vh_0_rgb(0_0_0/0.2)]">
              <span aria-hidden>{p.avatar}</span> {p.name}
            </li>
          ))}
        </ul>
      </div>
      <div className="relative flex flex-col items-center gap-[2.5vh] text-center">
        <Image src={discoBall} alt="" sizes="200px" className="absolute -top-[10vh] -right-[2vw] h-[16vh] w-auto origin-top animate-sway" />
        <Balloons className="absolute -left-[3vw] top-[2vh] h-[22vh] w-auto animate-float" />
        {joinUrl && <Qr url={joinUrl} />}
        <div>
          <div className="font-party text-[3.6vh]">Scan to join the game</div>
          <div className="mt-[1vh] inline-block break-all rounded-full bg-party-yellow px-[1.5vw] py-[0.8vh] font-mono text-[2.4vh] font-bold text-party-ink">
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
    <div className="flex min-h-0 flex-1 flex-col gap-[2.5vh]">
      <div className="flex items-center justify-between gap-[2vw]">
        <span className="rounded-full bg-party-ink/35 px-[1.4vw] py-[0.8vh] font-mono text-[2vh] font-semibold uppercase tracking-[0.25em]">
          Question {view.questionIndex + 1} of {view.totalQuestions}
        </span>
        <div className="flex items-center gap-[1.5vw]">
          <span className="rounded-full bg-white px-[1.4vw] py-[0.8vh] text-[2.2vh] font-bold text-party-ink">
            {view.answeredCount} of {view.players.length} answered
          </span>
          {!revealed && (
            <span
              aria-label="Seconds left"
              className={cx(
                "grid size-[11vh] place-items-center rounded-full font-party text-[5.5vh] tabular-nums shadow-[0_0.8vh_0_rgb(0_0_0/0.25)]",
                urgent ? "animate-pulse bg-party-berry text-white" : "bg-party-yellow text-party-ink",
              )}
            >
              {left ?? "–"}
            </span>
          )}
        </div>
      </div>

      {!revealed && (
        <div className="h-[1.2vh] overflow-hidden rounded-full bg-white/20" aria-hidden>
          <div
            className={cx("h-full rounded-full transition-[width] duration-200 ease-linear", urgent ? "bg-party-berry" : "bg-party-yellow")}
            style={{ width: `${leftMs === null ? 100 : (leftMs / (q.seconds * 1000)) * 100}%` }}
          />
        </div>
      )}

      <h1 className="font-party text-[6.5vh] leading-[1.1] [text-wrap:balance]">{q.prompt}</h1>

      <ul className="grid min-h-0 flex-1 grid-cols-2 gap-[1.6vw]">
        {q.options.map((opt, i) => {
          const { Icon, bg } = TILE[i % 4];
          const correct = revealed && q.correctIndex === i;
          const count = q.tally?.[i] ?? 0;
          return (
            <li
              key={i}
              className={cx(
                "relative flex items-center gap-[1.5vw] rounded-[3.5vh] px-[2vw] py-[2vh] text-[4.6vh] font-extrabold leading-tight text-party-ink transition duration-300",
                "shadow-[0_1vh_0_rgb(0_0_0/0.22)]",
                bg,
                revealed && !correct && "opacity-30 saturate-50",
                correct && "animate-pop ring-[1vh] ring-white",
              )}
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
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Standings({ players }: { players: Player[] }) {
  const rows = players.slice(0, 7);
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[70vw] flex-1 flex-col gap-[2.5vh]">
      <h1 className="text-center font-party text-[8vh] leading-none">Standings</h1>
      {rows.length === 0 ? (
        <p className="m-auto text-[3vh]">No detectives yet.</p>
      ) : (
        <ol className="flex min-h-0 flex-1 flex-col gap-[1.4vh] overflow-hidden">
          {rows.map((p, i) => (
            <li
              key={p.id}
              style={{ animationDelay: `${i * 70}ms` }}
              className={cx(
                "flex animate-rise items-center gap-[1.5vw] rounded-[2.5vh] px-[2vw] py-[1.3vh] text-[3.6vh] font-bold text-party-ink shadow-[0_0.6vh_0_rgb(0_0_0/0.2)]",
                i === 0 ? "bg-party-yellow" : "bg-white",
              )}
            >
              <span className={cx("grid size-[6vh] shrink-0 place-items-center rounded-full font-party text-[3.2vh]", i === 0 ? "bg-party-ink text-party-yellow" : "bg-party-purple/15 text-party-purple")}>
                {i + 1}
              </span>
              <span aria-hidden className="text-[4vh]">{p.avatar}</span>
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              {p.remote && <span className="rounded-full bg-party-sky/25 px-[0.9vw] py-[0.3vh] font-mono text-[1.6vh] uppercase tracking-widest">virtual</span>}
              <span className="font-party text-[4.2vh] tabular-nums text-party-purple">{p.score}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function MessageWall({ view }: { view: RoomView }) {
  const notes = view.messages.slice(-6).reverse();
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[2.5vh]">
      <h1 className="font-party text-[7vh] leading-none">
        Wishes for <span className="text-party-yellow">{EVENT.guestOfHonour}</span>
      </h1>
      {notes.length === 0 ? (
        <p className="m-auto text-[3vh] font-semibold">No wishes revealed yet. They appear here once the host approves them.</p>
      ) : (
        <ul className="grid min-h-0 flex-1 auto-rows-min grid-cols-3 gap-[1.6vw] overflow-hidden">
          {notes.map((m, i) => (
            <li
              key={m.id}
              className="flex animate-rise flex-col rounded-[3vh] bg-white p-[2vh] text-party-ink shadow-[0_1vh_0_rgb(94_31_107/0.4)]"
              style={{ rotate: `${((i % 3) - 1) * 1.2}deg`, animationDelay: `${i * 90}ms` }}
            >
              {m.media && m.media.length > 0 && (
                <div className={cx("mb-[1.5vh] grid gap-[0.6vw]", m.media.length > 1 && "grid-cols-2")}>
                  {m.media.slice(0, 4).map((x) =>
                    x.kind === "video" ? (
                      <video key={x.url} src={mediaSrc(x.url)} autoPlay muted loop playsInline className="max-h-[26vh] w-full rounded-[2vh] bg-black object-cover" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element -- guest upload served by our API
                      <img key={x.url} src={mediaSrc(x.url)} alt="" className={cx("w-full rounded-[2vh] object-cover", m.media!.length > 1 ? "aspect-square" : "max-h-[26vh]")} />
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
      {out && <Confetti />}
      <h1 className="font-party text-[8vh] leading-none">
        {out ? (
          <>
            Happy birthday, <span className="text-party-yellow">{EVENT.guestOfHonour}!</span>
          </>
        ) : (
          "Tap your phones. Blow them out!"
        )}
      </h1>
      <div className="relative flex items-end justify-center gap-[3vw]">
        {out && <Image src={partyPopper} alt="" sizes="260px" className="h-[24vh] w-auto -scale-x-100" />}
        <Image src={cakeArt} alt="" sizes="520px" className="h-[42vh] w-auto drop-shadow-[0_1.5vh_2vh_rgb(0_0_0/0.3)]" />
        {out && <Image src={partyPopper} alt="" sizes="260px" className="h-[24vh] w-auto" />}
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
        <span className="font-mono text-[2.2vh] font-semibold uppercase tracking-[0.25em]">
          {out ? "Make a wish" : `${lit} of ${candles} still lit`}
        </span>
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
      <Confetti />
      <div>
        <div className="stamp bg-white text-[2.4vh] text-party-berry">Case closed</div>
        <h1 className="mt-[2.5vh] font-party text-[10vh] leading-none drop-shadow-[0_0.8vh_0_rgb(255_201_60/0.9)]">Top detectives</h1>
      </div>
      <ol className="flex items-end gap-[1.5vw]">
        {podium.map(({ p, h, place, tone }) => (
          <li key={place} className="flex w-[18vw] flex-col items-center">
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

const CONFETTI_COLOURS = ["#ff4f81", "#23aae1", "#ffc93c", "#2bc48a", "#ffffff", "#fff791"];
function Confetti() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 40 }, (_, i) => (
        <span
          key={i}
          className="absolute -top-[4vh] animate-drift rounded-[0.3vh]"
          style={{
            left: `${(i * 37) % 100}%`,
            width: `${0.9 + (i % 3) * 0.4}vh`,
            height: `${1.6 + (i % 4) * 0.5}vh`,
            background: CONFETTI_COLOURS[i % CONFETTI_COLOURS.length],
            animationDelay: `${(i * 0.43) % 9}s`,
            animationDuration: `${7 + (i % 5)}s`,
          }}
        />
      ))}
    </div>
  );
}
