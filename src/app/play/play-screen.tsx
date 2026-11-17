"use client";

import { useState } from "react";
import { Button, cx, Field, Leaderboard, Logo, MessageForm, StatusDot, TILE } from "@/components/ui";
import { HostLine } from "@/components/host-line";
import { useNow, usePlayerToken } from "@/lib/client/hooks";
import { useRoom, type RoomConnection } from "@/lib/client/use-room";
import { AVATARS } from "@/lib/game/mock-data";
import type { RoomView } from "@/lib/game/types";
import { GamePanel, WheelPanel } from "./game-panels";

export function PlayScreen() {
  const token = usePlayerToken();
  const room = useRoom("player", { token, enabled: !!token });
  const { view, status } = room;

  return (
    <main className="stage flex flex-1 flex-col">
      <header className="flex items-center justify-between gap-3 px-4 pt-4">
        <Logo size="sm" />
        <StatusDot status={status} />
      </header>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-8 pt-6">
        {!view || !token ? (
          <p className="m-auto text-haze">Opening your case file…</p>
        ) : !view.me ? (
          <JoinForm room={room} token={token} />
        ) : (
          <Controller room={room} view={view} token={token} />
        )}
      </div>
    </main>
  );
}

function JoinForm({ room, token }: { room: RoomConnection; token: string }) {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<string>(AVATARS[0]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="panel my-auto flex flex-col gap-5 p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const res = await room.send({ type: "join", token, name, avatar });
        setBusy(false);
        setError(res.ok ? null : (res.error ?? null));
      }}
    >
      <div>
        <h1 className="font-display text-3xl font-extrabold">Open your case file</h1>
        <p className="mt-1 text-sm text-haze">Pick a name the room will recognise.</p>
      </div>
      <Field label="Detective name">
        <input
          required
          autoFocus
          maxLength={20}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="given-name"
          className="input"
          aria-describedby={error ? "join-error" : undefined}
        />
      </Field>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-haze">Badge</legend>
        <div className="grid grid-cols-6 gap-2">
          {AVATARS.map((a) => (
            <button
              key={a}
              type="button"
              aria-pressed={avatar === a}
              aria-label={`Badge ${a}`}
              onClick={() => setAvatar(a)}
              className={cx(
                "grid aspect-square place-items-center rounded-xl border text-2xl transition duration-150",
                avatar === a ? "border-gold bg-gold/20" : "border-white/10 bg-white/5",
              )}
            >
              {a}
            </button>
          ))}
        </div>
      </fieldset>
      {error && (
        <p id="join-error" role="alert" className="text-sm text-stamp">
          {error}
        </p>
      )}
      <Button variant="primary" type="submit" disabled={busy} className="text-base">
        {busy ? "Joining…" : "Join the show"}
      </Button>
    </form>
  );
}

function Controller({ room, view, token }: { room: RoomConnection; view: RoomView; token: string }) {
  const me = view.me!;
  const rank = view.players.findIndex((p) => p.id === me.id) + 1;

  return (
    <div className="flex flex-1 flex-col gap-5">
      {view.show.rehearsal && (
        <p className="rounded-lg border-2 border-dashed border-tile-b px-3 py-1.5 text-center font-mono text-xs font-bold uppercase tracking-[0.25em] text-tile-b">Rehearsal · sample data</p>
      )}
      {(view.show.hold || view.show.paused) && (
        <p role="status" className="rounded-xl bg-gold px-4 py-3 text-center font-semibold text-ink-950">
          {view.show.hold ? "Short break — back in a moment." : "Paused. Hang tight."}
        </p>
      )}
      <div className="panel flex items-center gap-3 px-4 py-3">
        <span className="text-2xl" aria-hidden>{me.avatar}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{me.name}</div>
          <div className="font-mono text-xs text-haze">
            Rank {rank} of {view.players.length}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-2xl font-bold tabular-nums text-gold">{me.score}</div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-haze">points</div>
        </div>
      </div>

      {view.phase === "lobby" && (
        <Section title="You're in!" body="Watch the big screen. The show starts when the host is ready.">
          <MessageBox room={room} author={me.name} />
        </Section>
      )}

      {view.phase === "question" && view.question && <AnswerPad room={room} view={view} token={token} />}

      {view.phase === "reveal" && view.question && (
        <div className="panel animate-pop p-6 text-center">
          {view.myAnswer === null ? (
            <Result tone="miss" title="No answer" body="Too slow this time, detective." />
          ) : view.myAnswer === view.question.correctIndex ? (
            <Result tone="hit" title={`+${view.myGain} points`} body="Correct! Case cracked." />
          ) : (
            <Result tone="miss" title="Not quite" body={`It was “${view.question.options[view.question.correctIndex ?? 0]}”.`} />
          )}
        </div>
      )}

      {(view.phase === "leaderboard" || view.phase === "finished") && (
        <Section
          title={view.phase === "finished" ? "Case closed" : "Standings"}
          body={view.phase === "finished" ? "Thanks for playing. Happy birthday, Mez!" : "Next round coming up."}
        >
          <Leaderboard players={view.players} meId={me.id} limit={10} />
        </Section>
      )}

      {view.phase === "messages" && (
        <Section title="Message wall" body="Add yours. It shows on the big screen once approved.">
          <MessageBox room={room} author={me.name} />
        </Section>
      )}

      {view.phase === "cake" && <CakePad room={room} view={view} token={token} />}

      {view.phase === "game" && view.games.game && <GamePanel view={view} room={room} token={token} />}
      {view.phase === "wheel" && <WheelPanel view={view} room={room} token={token} />}
      {view.phase === "surprise" && <Section title="Surprise!" body="Eyes on the big screen." />}
      {view.phase === "scene" && <Section title={view.scene?.title ?? "Showtime"} body={view.scene?.kind === "spotlight" ? "Eyes on the big screen. Who do you think sent it?" : "Eyes on the big screen."} />}
      {view.phase === "boards" && (
        <Section title="Leaderboards" body="Live Games Champion standings. Mez Expert is up on the TV.">
          <Leaderboard players={view.players} meId={me.id} limit={10} />
        </Section>
      )}

      <div className="mt-auto pt-2">
        <HostLine host={view.host} name={view.hostName} />
      </div>
    </div>
  );
}

function Section({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-3xl font-extrabold">{title}</h1>
        <p className="mt-1 text-sm text-haze">{body}</p>
      </div>
      {children}
    </section>
  );
}

function Result({ tone, title, body }: { tone: "hit" | "miss"; title: string; body: string }) {
  return (
    <>
      <div className={cx("stamp text-sm", tone === "hit" ? "text-go" : "text-stamp")}>{tone === "hit" ? "Solved" : "Unsolved"}</div>
      <h1 className="mt-4 font-display text-4xl font-extrabold">{title}</h1>
      <p className="mt-2 text-haze">{body}</p>
    </>
  );
}

function MessageBox({ room, author }: { room: RoomConnection; author: string }) {
  return (
    <div className="panel p-5">
      <MessageForm defaultAuthor={author} onSubmit={(a, text) => room.send({ type: "submitMessage", author: a, text })} />
    </div>
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

  return (
    <section className="flex flex-1 flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-xs uppercase tracking-widest text-haze">
          Question {view.questionIndex + 1}/{view.totalQuestions}
        </span>
        <span className={cx("font-mono text-2xl font-bold tabular-nums", left !== null && left <= 5 ? "text-stamp" : "text-gold")} aria-label="Seconds left">
          {left ?? "–"}s
        </span>
      </div>
      <h1 className="font-display text-2xl font-extrabold leading-tight">{q.prompt}</h1>
      <div className="grid flex-1 grid-cols-1 gap-3">
        {q.options.map((opt, i) => (
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
              "flex min-h-16 items-center gap-3 rounded-2xl px-5 text-left text-lg font-bold text-ink-950 transition duration-150 active:scale-[0.98]",
              TILE[i % 4].bg,
              mine !== null && mine !== i && "opacity-30",
              mine === i && "ring-4 ring-cream",
              closed && mine === null && "opacity-40",
            )}
          >
            <span aria-hidden className="text-xl">{TILE[i % 4].glyph}</span>
            {opt}
          </button>
        ))}
      </div>
      <p aria-live="polite" className="min-h-6 text-center text-sm text-haze">
        {error ? <span className="text-stamp">{error}</span> : mine !== null ? "Locked in. Eyes on the big screen." : closed ? "Time's up." : "Tap once. No take-backs."}
      </p>
    </section>
  );
}

function CakePad({ room, view, token }: { room: RoomConnection; view: RoomView; token: string }) {
  const { lit, candles, guestsDone, mezOut, stage } = view.cake;
  const [error, setError] = useState<string | null>(null);
  if (stage === "real") return <Section title="Real cake time! 🎂" body="Put the phone down and head to the cake." />;
  if (stage === "cut") return <Section title="The cake is cut! 🔪" body="First slice goes to Mez." />;
  const done = guestsDone || mezOut;
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <h1 className="font-display text-3xl font-extrabold">{mezOut ? "Happy birthday, Mez!" : guestsDone ? "Over to Mez!" : "Blow out the candles!"}</h1>
      <button
        disabled={done}
        onClick={async () => {
          const r = await room.send({ type: "blow", token });
          setError(r.ok ? null : (r.error ?? null));
        }}
        className="grid size-56 place-items-center rounded-full bg-gold text-7xl shadow-[0_10px_0_0_var(--color-gold-deep)] transition duration-100 active:translate-y-2 active:shadow-[0_2px_0_0_var(--color-gold-deep)] disabled:opacity-50 disabled:shadow-none"
        aria-label="Blow"
      >
        {mezOut ? "🎉" : guestsDone ? "🎂" : "💨"}
      </button>
      <p className="font-mono text-sm uppercase tracking-widest text-haze" aria-live="polite">
        {mezOut ? "All 24 candles out" : guestsDone ? "The last candle is Mez's" : `${Math.max(0, lit - 1)} of ${candles - 1} candles still lit · tap fast`}
      </p>
      {error && !done && <p className="text-sm text-stamp">{error}</p>}
    </section>
  );
}
