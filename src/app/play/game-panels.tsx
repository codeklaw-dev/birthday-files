"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Button, cx } from "@/components/ui";
import { useCountdown } from "@/components/tv";
import type { RoomConnection } from "@/lib/client/use-room";
import type { RoomView } from "@/lib/game/types";
import { IMPOSTER, PRIZES, SURVEY } from "@/lib/games/config";
import type { ImposterView, MysteryView, SurveyView, TrialView } from "@/lib/games/views";

/** Phone controls for the live games and the prize wheel. */

function useSend(room: RoomConnection) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const send = async (a: Parameters<RoomConnection["send"]>[0]) => {
    setBusy(true);
    const r = await room.send(a);
    setBusy(false);
    setError(r.ok ? null : (r.error ?? "That didn't work."));
    return r.ok;
  };
  return { send, error, busy };
}

function Countdown({ endsAt, offset }: { endsAt: number | null; offset: number }) {
  const left = useCountdown(endsAt, offset);
  if (left === null) return null;
  return <span className={cx("font-mono text-2xl font-bold tabular-nums", left <= 5 ? "text-stamp" : "text-gold")} aria-label="Seconds left">{left}s</span>;
}

function Head({ title, endsAt, offset }: { title: string; endsAt: number | null; offset: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h1 className="font-display text-2xl font-extrabold">{title}</h1>
      <Countdown endsAt={endsAt} offset={offset} />
    </div>
  );
}

const Note = ({ children, tone = "haze" }: { children: React.ReactNode; tone?: "haze" | "go" | "stamp" }) => (
  <p aria-live="polite" className={cx("text-center text-sm", { haze: "text-haze", go: "text-go", stamp: "text-stamp" }[tone])}>
    {children}
  </p>
);

function TextSubmit({ label, max, placeholder, onSubmit, busy }: { label: string; max: number; placeholder?: string; onSubmit: (t: string) => Promise<boolean>; busy: boolean }) {
  const [text, setText] = useState("");
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await onSubmit(text)) setText("");
      }}
    >
      <label className="text-sm font-medium" htmlFor="game-text">
        {label}
      </label>
      <input id="game-text" className="input text-lg" value={text} maxLength={max} placeholder={placeholder} autoComplete="off" onChange={(e) => setText(e.target.value)} autoFocus />
      <Button variant="primary" type="submit" disabled={busy || !text.trim()} className="min-h-12 text-base">
        Send
      </Button>
    </form>
  );
}

function ChoiceList({ options, chosen, onPick, disabled }: { options: { id: string; label: string }[]; chosen: string | null; onPick: (id: string) => void; disabled: boolean }) {
  return (
    <ul className="grid gap-2">
      {options.map((o) => (
        <li key={o.id}>
          <button
            disabled={disabled || chosen !== null}
            aria-pressed={chosen === o.id}
            onClick={() => onPick(o.id)}
            className={cx(
              "flex min-h-14 w-full items-center rounded-2xl border px-5 text-left text-lg font-semibold transition",
              chosen === o.id ? "border-gold bg-gold text-ink-950" : "border-white/15 bg-white/5",
              chosen !== null && chosen !== o.id && "opacity-40",
            )}
          >
            {o.label}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function GamePanel({ view, room, token }: { view: RoomView; room: RoomConnection; token: string }) {
  const g = view.games.game;
  if (!g) return null;
  switch (g.id) {
    case "imposter":
      return <Imposter g={g} view={view} room={room} token={token} />;
    case "wkmb":
      return (
        <div className="panel p-6 text-center">
          <h1 className="font-display text-2xl font-extrabold">Who Knows Mez Best</h1>
          <p className="mt-2 text-haze">{g.step === "revealed" ? "Names are up on the big screen!" : "Eyes on the TV. Mez is judging everyone's answers."}</p>
        </div>
      );
    case "survey":
      return <Survey g={g} room={room} token={token} offset={room.clockOffset} />;
    case "trial":
      return <Trial g={g} room={room} token={token} offset={room.clockOffset} />;
    case "mystery":
      return <Mystery g={g} room={room} token={token} offset={room.clockOffset} />;
  }
}

function Imposter({ g, view, room, token }: { g: ImposterView; view: RoomView; room: RoomConnection; token: string }) {
  const [peek, setPeek] = useState(false);
  const { send, error, busy } = useSend(room);
  const me = g.me;
  if (!me || me.role === "spectator") return <Note>You joined after this round was dealt. You&apos;re in the next one!</Note>;
  const secret = (
    <button
      onClick={() => setPeek((p) => !p)}
      className={cx("flex min-h-28 w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 p-4", peek ? (me.role === "imposter" ? "border-stamp bg-stamp/15" : "border-gold bg-gold/15") : "border-white/20 bg-white/5")}
      aria-label={peek ? "Hide my secret" : "Show my secret"}
    >
      {peek ? (
        <>
          <span className="font-mono text-xs uppercase tracking-[0.25em] text-haze">{me.role === "imposter" ? "You are the" : "Your word"}</span>
          <span className={cx("font-display text-4xl font-extrabold", me.role === "imposter" ? "text-stamp" : "text-gold")}>{me.role === "imposter" ? "IMPOSTER" : me.word}</span>
          <span className="text-sm text-haze">{me.role === "imposter" ? `Category: ${g.category}. Blend in!` : `Category: ${g.category}`}</span>
          <span className="mt-1 inline-flex items-center gap-1 text-xs text-haze"><EyeOff className="size-3.5" aria-hidden /> tap to hide</span>
        </>
      ) : (
        <span className="inline-flex items-center gap-2 text-lg font-semibold"><Eye className="size-5" aria-hidden /> Tap to see your secret (hide it from your neighbours!)</span>
      )}
    </button>
  );
  return (
    <section className="flex flex-col gap-4">
      <Head title="Mez Imposter" endsAt={g.stepEndsAt} offset={room.clockOffset} />
      {g.step !== "reveal" && secret}
      {g.step === "deal" && <Note>Memorise it. Clues start in a moment.</Note>}
      {g.step === "clues" &&
        (me.clue ? (
          <Note tone="go">Your clue: “{me.clue}”. Wait for the others.</Note>
        ) : (
          <TextSubmit label="Your one-word clue" max={IMPOSTER.clueMax} placeholder="Don't make it too obvious" busy={busy} onSubmit={(text) => send({ type: "game/clue", token, text })} />
        ))}
      {(g.step === "cluesShown" || g.step === "vote") && me.role === "imposter" && !me.guess && (
        <TextSubmit label="Imposter bonus: guess the secret word (one try)" max={40} busy={busy} onSubmit={(text) => send({ type: "game/guess", token, text })} />
      )}
      {me.guess && g.step !== "reveal" && <Note>Your guess is in: “{me.guess}”</Note>}
      {g.step === "cluesShown" && <Note>Read the clues on the TV. Voting opens soon.</Note>}
      {g.step === "vote" && (
        <>
          <p className="font-semibold">Who is the imposter?</p>
          <ChoiceList
            options={g.players.filter((p) => p.id !== view.me?.id).map((p) => ({ id: p.id, label: p.name }))}
            chosen={me.vote}
            disabled={busy}
            onPick={(choice) => void send({ type: "game/vote", token, choice })}
          />
          {me.vote && <Note tone="go">Vote locked in.</Note>}
        </>
      )}
      {g.step === "reveal" && g.reveal && (
        <div className="panel p-5 text-center">
          <p className="text-lg">
            The imposter was <strong className="text-gold">{g.reveal.imposters.map((i) => i.name).join(" & ")}</strong>.
          </p>
          <p className="text-haze">The word was “{g.reveal.word}”. {g.reveal.caught ? "Caught!" : "They escaped!"}</p>
        </div>
      )}
      {error && <Note tone="stamp">{error}</Note>}
    </section>
  );
}

function Survey({ g, room, token, offset }: { g: SurveyView; room: RoomConnection; token: string; offset: number }) {
  const { send, error, busy } = useSend(room);
  return (
    <section className="flex flex-col gap-4">
      <Head title="Mez Survey" endsAt={g.stepEndsAt} offset={offset} />
      <p className="text-lg font-semibold">{g.prompt}</p>
      {g.step === "guess" &&
        (g.me?.guess ? (
          <Note tone="go">Your answer: “{g.me.guess}”. Survey says… soon.</Note>
        ) : (
          <TextSubmit label="What did most guests say?" max={SURVEY.guessMax} busy={busy} onSubmit={(text) => send({ type: "game/guess", token, text })} />
        ))}
      {g.step === "reveal" && (
        <div className="panel p-5 text-center">
          {g.me?.guess ? (
            g.me.match !== null ? (
              <p className="text-lg text-go">“{g.me.guess}” is on the board{g.me.matchedLabel ? ` as “${g.me.matchedLabel}”` : " (watch the TV!)"}.</p>
            ) : (
              <p className="text-lg">“{g.me.guess}” isn&apos;t on the board. ✗</p>
            )
          ) : (
            <p className="text-haze">You didn&apos;t answer this one.</p>
          )}
        </div>
      )}
      {error && <Note tone="stamp">{error}</Note>}
    </section>
  );
}

function Trial({ g, room, token, offset }: { g: TrialView; room: RoomConnection; token: string; offset: number }) {
  const { send, error, busy } = useSend(room);
  return (
    <section className="flex flex-col gap-4">
      <Head title="Mez on Trial" endsAt={g.stepEndsAt} offset={offset} />
      <div className="file-card p-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-ink-600">Mez stands accused of</p>
        <p className="mt-1 text-lg font-semibold">{g.charge}</p>
      </div>
      {g.step === "vote" ? (
        <div className="grid grid-cols-2 gap-3">
          {(["guilty", "not_guilty"] as const).map((v) => (
            <button
              key={v}
              disabled={busy || g.myVote !== null}
              aria-pressed={g.myVote === v}
              onClick={() => void send({ type: "game/vote", token, choice: v })}
              className={cx(
                "min-h-28 rounded-2xl text-2xl font-extrabold transition active:scale-[0.98]",
                v === "guilty" ? "bg-stamp text-cream" : "bg-go text-ink-950",
                g.myVote !== null && g.myVote !== v && "opacity-30",
                g.myVote === v && "ring-4 ring-cream",
              )}
            >
              {v === "guilty" ? "Guilty" : "Not guilty"}
            </button>
          ))}
        </div>
      ) : g.step === "verdict" && g.verdict ? (
        <Note>
          Verdict: {g.verdict.outcome === "guilty" ? "Guilty" : g.verdict.outcome === "not_guilty" ? "Not guilty" : "Hung jury"} ({g.verdict.guilty}–{g.verdict.notGuilty})
        </Note>
      ) : (
        <Note>{g.step === "charge" ? "Listen to the charge…" : "Mez is defending. The jury votes next."}</Note>
      )}
      {g.myVote && g.step === "vote" && <Note tone="go">Your vote is in.</Note>}
      {error && <Note tone="stamp">{error}</Note>}
    </section>
  );
}

function Mystery({ g, room, token, offset }: { g: MysteryView; room: RoomConnection; token: string; offset: number }) {
  const { send, error, busy } = useSend(room);
  const chosen = g.myGuess ? (g.suspects.find((s) => s.name === g.myGuess)?.id ?? null) : null;
  return (
    <section className="flex flex-col gap-4">
      <Head title="Mystery Files" endsAt={g.stepEndsAt} offset={offset} />
      {g.step === "exhibit" && <Note>Look at the exhibit on the TV. Guessing opens soon.</Note>}
      {g.step === "guess" && (
        <>
          <p className="font-semibold">Whose file is it?</p>
          <ChoiceList options={g.suspects.map((s) => ({ id: s.id, label: s.name }))} chosen={chosen} disabled={busy} onPick={(choice) => void send({ type: "game/vote", token, choice })} />
        </>
      )}
      {g.step === "reveal" && g.reveal && (
        <div className="panel p-5 text-center">
          <p className="text-lg">
            It was <strong className="text-gold">{g.reveal.name}</strong>.
          </p>
          <p className={g.myGuess === g.reveal.name ? "text-go" : "text-haze"}>{g.myGuess ? (g.myGuess === g.reveal.name ? "You got it! 🎯" : `You guessed ${g.myGuess}.`) : "You didn't guess."}</p>
        </div>
      )}
      {error && <Note tone="stamp">{error}</Note>}
    </section>
  );
}

export function WheelPanel({ view, room, token }: { view: RoomView; room: RoomConnection; token: string }) {
  const { send, error, busy } = useSend(room);
  const cur = view.games.wheel.current;
  const prize = cur ? PRIZES.find((p) => p.id === cur.prize) : null;
  if (!cur || !prize) return <Note>Watch the prize wheel on the TV.</Note>;
  if (!view.games.wheel.mine)
    return (
      <div className="panel p-5 text-center">
        <p>
          {cur.recipient.name} spun: <strong className="text-gold">{prize.label}</strong>
        </p>
        <p className="text-sm text-haze">{cur.status === "offered" ? "Waiting for their answer…" : cur.status}</p>
      </div>
    );
  return (
    <section className="flex flex-col gap-4 text-center">
      <h1 className="font-display text-3xl font-extrabold">You won: {prize.label}!</h1>
      <p className="text-haze">Totally optional. Accept it, or decline with no hard feelings.</p>
      <div className="grid grid-cols-2 gap-3">
        <Button variant="primary" className="min-h-14 text-lg" disabled={busy} onClick={() => void send({ type: "wheel/respond", token, accept: true })}>
          Accept
        </Button>
        <Button className="min-h-14 text-lg" disabled={busy} onClick={() => void send({ type: "wheel/respond", token, accept: false })}>
          No thanks
        </Button>
      </div>
      {error && <Note tone="stamp">{error}</Note>}
    </section>
  );
}
