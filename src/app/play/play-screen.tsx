"use client";

import Image from "next/image";
import { useState } from "react";
import { PartyField } from "@/components/party";
import { GAME_ART } from "@/components/game-art";
import { cx, HostLine, Leaderboard, TILE } from "@/components/ui";
import { useNow, usePlayerToken, useStored } from "@/lib/client/hooks";
import { useRoom, type ConnectionStatus, type RoomConnection } from "@/lib/client/use-room";
import { EVENT } from "@/lib/event";
import { AVATARS } from "@/lib/game/mock-data";
import type { RoomView } from "@/lib/game/types";
import cake from "@/assets/party/cake.png";
import partyPopper from "@/assets/party/party-popper.png";
import logo from "@/assets/party/logo.png";

export function PlayScreen() {
  const token = usePlayerToken();
  const room = useRoom("player", { token, enabled: !!token });
  const { view, status } = room;

  return (
    <main className="party-stage flex flex-1 flex-col">
      <header className="flex items-center justify-between gap-3 px-4 pt-3">
        <Image src={logo} alt={EVENT.title} preload sizes="96px" className="w-24 -rotate-3" />
        <ConnectionPill status={status} />
      </header>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-6 pt-4">
        {!view || !token ? (
          <p className="m-auto font-semibold">Opening your case file…</p>
        ) : !view.me ? (
          <JoinForm room={room} token={token} />
        ) : (
          <Controller room={room} view={view} token={token} />
        )}
      </div>
    </main>
  );
}

function ConnectionPill({ status }: { status: ConnectionStatus }) {
  const label = { live: "Live", connecting: "Connecting…", reconnecting: "Reconnecting…" }[status];
  return (
    <span role="status" className="inline-flex items-center gap-2 rounded-full bg-party-ink/35 px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-widest">
      <span className={cx("size-2 rounded-full", status === "live" ? "bg-party-mint" : "animate-pulse bg-party-sun")} />
      {label}
    </span>
  );
}

/** Name saved by the invite's "Virtual trooper" profile, if any. */
function useSavedName(): string {
  const [raw] = useStored("local", "bf.profile");
  try {
    const p = raw ? JSON.parse(raw) : null;
    return typeof p?.name === "string" ? p.name : "";
  } catch {
    return "";
  }
}

function JoinForm({ room, token }: { room: RoomConnection; token: string }) {
  const savedName = useSavedName();
  const [typed, setName] = useState<string | null>(null);
  const name = typed ?? savedName;
  const [avatar, setAvatar] = useState<string>(AVATARS[0]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="party-card my-auto flex flex-col gap-5 p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const res = await room.send({ type: "join", token, name, avatar });
        setBusy(false);
        setError(res.ok ? null : (res.error ?? null));
      }}
    >
      <div>
        <h1 className="font-party text-3xl text-party-purple">Open your case file</h1>
        <p className="mt-1 text-party-ink/70">Pick a name the room will recognise.</p>
      </div>
      <PartyField label="Detective name">
        <input
          required
          autoFocus
          maxLength={20}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="given-name"
          className="party-input"
          aria-describedby={error ? "join-error" : undefined}
        />
      </PartyField>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-party-ink/80">Badge</legend>
        <div className="grid grid-cols-6 gap-2">
          {AVATARS.map((a) => (
            <button
              key={a}
              type="button"
              aria-pressed={avatar === a}
              aria-label={`Badge ${a}`}
              onClick={() => setAvatar(a)}
              className={cx(
                "grid aspect-square place-items-center rounded-2xl border-2 text-2xl transition duration-150",
                avatar === a ? "scale-105 border-party-purple bg-party-yellow" : "border-transparent bg-party-purple/8",
              )}
            >
              {a}
            </button>
          ))}
        </div>
      </fieldset>
      {error && (
        <p id="join-error" role="alert" className="text-sm font-semibold text-party-berry">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className="party-pill bg-party-green text-white">
        {busy ? "Joining…" : "Join the show"}
      </button>
    </form>
  );
}

function Controller({ room, view, token }: { room: RoomConnection; view: RoomView; token: string }) {
  const me = view.me!;
  const rank = view.players.findIndex((p) => p.id === me.id) + 1;
  const [attendance] = useStored("local", "bf.attendance");
  const remote = attendance === "virtual";

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="party-card flex items-center gap-3 px-4 py-3">
        <span className="grid size-11 place-items-center rounded-full bg-party-yellow text-2xl" aria-hidden>
          {me.avatar}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{me.name}</div>
          <div className="font-mono text-xs text-party-ink/65">
            Rank {rank} of {view.players.length}
          </div>
        </div>
        <div className="text-right">
          <div className="font-party text-3xl leading-none tabular-nums text-party-purple">{me.score}</div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-party-ink/65">points</div>
        </div>
      </div>

      {view.phase === "lobby" && (
        <Section
          title="You're in!"
          body={
            remote
              ? "Playing from afar. Keep this page open: the questions appear here when the host starts the show."
              : "Watch the big screen. The questions appear here when the host starts the show."
          }
        >
          <GameLineup />
        </Section>
      )}

      {view.phase === "question" && view.question && <AnswerPad room={room} view={view} token={token} />}

      {view.phase === "reveal" && view.question && (
        <div className="flex flex-1 flex-col justify-center">
          <div className="party-card relative animate-pop overflow-hidden px-6 pb-8 pt-6 text-center">
            {view.myAnswer === null ? (
              <Result tone="miss" title="No answer" body="Too slow this time, detective." />
            ) : view.myAnswer === view.question.correctIndex ? (
              <Result tone="hit" title={`+${view.myGain} points`} body="Correct! Case cracked." />
            ) : (
              <Result tone="miss" title="Not quite" body={`It was “${view.question.options[view.question.correctIndex ?? 0]}”.`} />
            )}
          </div>
        </div>
      )}

      {(view.phase === "leaderboard" || view.phase === "finished") && (
        <Section
          title={view.phase === "finished" ? "Case closed" : "Standings"}
          body={view.phase === "finished" ? "Thanks for playing. Happy birthday, Mez!" : "Next round coming up."}
        >
          <div className="rounded-[1.75rem] bg-party-ink/40 p-3">
            <Leaderboard players={view.players} meId={me.id} limit={10} />
          </div>
        </Section>
      )}

      {view.phase === "messages" && (
        <Section title="Message wall" body={`Wishes for ${EVENT.guestOfHonour} are being revealed. Eyes on the big screen!`} />
      )}

      {view.phase === "cake" && <CakePad room={room} view={view} token={token} />}

      <div className="mt-auto rounded-2xl bg-party-ink/45 p-3">
        <HostLine line={view.hostLine} lang={view.hostLang} />
      </div>
    </div>
  );
}

/** Tonight's games, shown while waiting in the lobby. */
function GameLineup() {
  return (
    <div>
      <h2 className="mb-3 font-mono text-xs font-semibold uppercase tracking-[0.25em]">Tonight&apos;s games</h2>
      <ul className="grid grid-cols-2 gap-3">
        {EVENT.games.map((g) => {
          const art = GAME_ART[g.id];
          return (
            <li key={g.id} className="party-card flex flex-col items-center p-3 text-center">
              {art && <Image src={art.src} alt={art.alt} sizes="96px" className="h-20 w-auto object-contain" />}
              <h3 className="mt-2 font-party text-lg leading-tight text-party-purple">{g.name}</h3>
              <p className="mt-1 text-xs text-party-ink/75">{g.blurb}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Section({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="font-party text-4xl">{title}</h1>
        <p className="mt-1 text-white/90">{body}</p>
      </div>
      {children}
    </section>
  );
}

function Result({ tone, title, body }: { tone: "hit" | "miss"; title: string; body: string }) {
  return (
    <>
      {tone === "hit" && <Image src={partyPopper} alt="" sizes="160px" className="mx-auto -mb-2 w-36" />}
      <div className={cx("stamp text-sm", tone === "hit" ? "text-party-green" : "text-party-berry")}>
        {tone === "hit" ? "Solved" : "Unsolved"}
      </div>
      <h1 className="mt-4 font-party text-5xl text-party-purple">{title}</h1>
      <p className="mt-2 text-party-ink/75">{body}</p>
    </>
  );
}

function AnswerPad({ room, view, token }: { room: RoomConnection; view: RoomView; token: string }) {
  const q = view.question!;
  const now = useNow(200);
  const [picked, setPicked] = useState<{ id: string; index: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Optimistic pick, confirmed by the server echo in `view.myAnswer`.
  const mine = view.myAnswer ?? (picked?.id === q.id ? picked.index : null);
  const left = q.endsAt && now ? Math.max(0, Math.ceil((q.endsAt - (now + room.clockOffset)) / 1000)) : null;
  const closed = left === 0;
  const urgent = left !== null && left <= 5;

  return (
    <section className="flex flex-1 flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-party-ink/35 px-3 py-1 font-mono text-xs font-semibold uppercase tracking-widest">
          Question {view.questionIndex + 1}/{view.totalQuestions}
        </span>
        <span
          aria-label="Seconds left"
          className={cx(
            "grid size-14 place-items-center rounded-full font-party text-2xl tabular-nums shadow-[0_4px_0_rgb(0_0_0/0.2)]",
            urgent ? "animate-pulse bg-party-berry text-white" : "bg-party-yellow text-party-ink",
          )}
        >
          {left ?? "–"}
        </span>
      </div>
      <h1 className="font-party text-[1.75rem] leading-tight">{q.prompt}</h1>
      <div className="grid grid-cols-2 gap-3">
        {q.options.map((opt, i) => {
          const { Icon, bg } = TILE[i % 4];
          return (
            <button
              key={i}
              disabled={mine !== null || closed}
              aria-pressed={mine === i}
              onClick={async () => {
                setPicked({ id: q.id, index: i });
                setError(null);
                const res = await room.send({ type: "answer", token, optionIndex: i });
                if (!res.ok) {
                  setPicked(null);
                  setError(res.error ?? null);
                }
              }}
              className={cx(
                "flex min-h-40 flex-col items-center justify-center gap-3 rounded-[1.75rem] p-3 text-center text-lg font-bold leading-snug text-party-ink",
                "shadow-[0_6px_0_rgb(0_0_0/0.2)] transition duration-150 active:translate-y-1 active:shadow-[0_2px_0_rgb(0_0_0/0.2)]",
                bg,
                mine !== null && mine !== i && "opacity-35",
                mine === i && "scale-[1.03] ring-4 ring-white",
                closed && mine === null && "opacity-45",
              )}
            >
              <span aria-hidden className="grid size-14 place-items-center rounded-full bg-white/45">
                <Icon className="size-8" fill="currentColor" strokeWidth={2} />
              </span>
              <span className="break-words">{opt}</span>
            </button>
          );
        })}
      </div>
      <p aria-live="polite" className="min-h-6 text-center font-semibold">
        {error ? (
          <span className="rounded-full bg-white px-3 py-1 text-party-berry">{error}</span>
        ) : mine !== null ? (
          "Locked in. Eyes on the big screen."
        ) : closed ? (
          "Time's up."
        ) : (
          "Tap once. No take-backs."
        )}
      </p>
    </section>
  );
}

function CakePad({ room, view, token }: { room: RoomConnection; view: RoomView; token: string }) {
  const out = view.cake.lit === 0;
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
      <h1 className="font-party text-4xl">{out ? "Happy birthday, Mez!" : "Blow out the candles!"}</h1>
      <button
        disabled={out}
        onClick={() => room.send({ type: "blow", token })}
        aria-label="Blow"
        className="relative grid size-64 place-items-center rounded-full bg-party-yellow shadow-[0_10px_0_0_rgb(0_0_0/0.2)] transition duration-100 active:translate-y-2 active:shadow-[0_2px_0_0_rgb(0_0_0/0.2)] disabled:shadow-none"
      >
        <Image src={out ? partyPopper : cake} alt="" sizes="200px" className="w-48" />
      </button>
      <div aria-live="polite" className="flex flex-col items-center gap-2">
        <div aria-hidden className="flex gap-1.5">
          {Array.from({ length: view.cake.candles }, (_, i) => (
            <span key={i} className={cx("text-2xl transition", i < view.cake.lit ? "" : "opacity-30 grayscale")}>
              🕯️
            </span>
          ))}
        </div>
        <p className="font-mono text-sm font-semibold uppercase tracking-widest">
          {out ? "All candles out" : `${view.cake.lit} of ${view.cake.candles} still lit · tap fast`}
        </p>
      </div>
    </section>
  );
}
