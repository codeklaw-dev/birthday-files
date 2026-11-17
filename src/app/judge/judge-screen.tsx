"use client";

import { Crown, Gavel, Heart, Lock, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, cx, Logo, StatusDot } from "@/components/ui";
import { useCountdown } from "@/components/tv";
import { useStored } from "@/lib/client/hooks";
import { useRoom, type RoomConnection } from "@/lib/client/use-room";
import type { RoomView } from "@/lib/game/types";
import type { MysteryView, TrialView, WkmbView } from "@/lib/games/views";

/** Mez's phone: scoring and verdict controls. Opened from a private link: /judge#k=<key>. */
export function JudgeScreen() {
  const [key, setKey] = useStored("local", "bf.judgeKey");
  const [state, setState] = useState<"checking" | "ok" | "bad">("checking");

  useEffect(() => {
    const fromHash = /(?:^#|&)k=([A-Za-z0-9_-]{16,64})/.exec(window.location.hash)?.[1];
    if (fromHash) {
      setKey(fromHash);
      history.replaceState(null, "", window.location.pathname);
    }
  }, [setKey]);

  useEffect(() => {
    if (key === undefined) return;
    if (!key) return void setTimeout(() => setState("bad"), 0);
    let live = true;
    fetch("/api/room/judge-check", { method: "POST", headers: { "x-judge-key": key } })
      .then((r) => live && setState(r.ok ? "ok" : "bad"))
      .catch(() => live && setState("bad"));
    return () => {
      live = false;
    };
  }, [key]);

  if (state === "checking") return <main className="stage grid flex-1 place-items-center text-haze">Checking your judge badge…</main>;
  if (state === "bad" || !key)
    return (
      <main className="stage grid flex-1 place-items-center px-6 text-center">
        <div className="panel max-w-sm p-6">
          <Gavel className="mx-auto size-10 text-gold" aria-hidden />
          <h1 className="mt-3 font-display text-2xl font-extrabold">Judge phone not set up</h1>
          <p className="mt-2 text-haze">Ask the host for the judge link (or scan the judge QR on the host dashboard). If it was changed, the old one stops working.</p>
        </div>
      </main>
    );
  return <Judge judgeKey={key} />;
}

function Judge({ judgeKey }: { judgeKey: string }) {
  const room = useRoom("judge", { judgeKey });
  const { view, status } = room;
  const [error, setError] = useState<string | null>(null);
  const act = async (a: Parameters<RoomConnection["send"]>[0]) => {
    const r = await room.send(a);
    setError(r.ok ? null : (r.error ?? "That didn't work."));
    return r.ok;
  };
  const g = view?.games.game;

  return (
    <main className="stage flex flex-1 flex-col">
      <header className="flex items-center justify-between gap-3 px-4 pt-4">
        <div className="flex items-center gap-2">
          <Crown className="size-6 text-gold" aria-hidden />
          <span className="font-display text-xl font-extrabold">Judge Mez</span>
        </div>
        <StatusDot status={status} />
      </header>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pb-10 pt-5">
        {!view ? (
          <p className="m-auto text-haze">Connecting…</p>
        ) : (
          <>
            {view.show.rehearsal && <p className="rounded-lg border-2 border-dashed border-tile-b px-3 py-1.5 text-center font-mono text-xs font-bold uppercase tracking-[0.25em] text-tile-b">Rehearsal · sample data</p>}
            {view.phase === "cake" && <CakeControl view={view} act={act} />}
            {!g && view.phase !== "cake" && <p className="panel p-5 text-center text-haze">No game running. Your controls appear here when it&apos;s your turn to judge.</p>}
            {g?.id === "wkmb" && <WkmbJudge g={g} act={act} />}
            {g?.id === "trial" && <TrialJudge g={g} act={act} offset={room.clockOffset} />}
            {g?.id === "mystery" && <MysteryJudge g={g} act={act} />}
            {(g?.id === "imposter" || g?.id === "survey") && <p className="panel p-5 text-center text-haze">Sit back and enjoy this one. The guests are playing.</p>}
            {error && (
              <p role="alert" className="rounded-xl border border-stamp/40 bg-stamp/10 p-3 text-sm text-stamp">
                {error}
              </p>
            )}
            <Bonus view={view} act={act} />
            <ContactToggle view={view} act={act} />
          </>
        )}
        <div className="mt-auto flex justify-center pt-6">
          <Logo size="sm" />
        </div>
      </div>
    </main>
  );
}

type Act = (a: Parameters<RoomConnection["send"]>[0]) => Promise<boolean>;

/** Mez's own candle: guests blow out the other 23 from their phones. */
function CakeControl({ view, act }: { view: RoomView; act: Act }) {
  const { lit, candles, guestsDone, mezOut, stage } = view.cake;
  if (stage !== "candles" || mezOut)
    return (
      <section className="panel p-6 text-center">
        <div className="text-6xl" aria-hidden>🎉</div>
        <h2 className="mt-3 font-display text-2xl font-extrabold">Happy birthday, Mez!</h2>
        <p className="mt-1 text-haze">{stage === "real" ? "Time for the real cake." : stage === "cut" ? "The cake is cut." : "Make a wish."}</p>
      </section>
    );
  return (
    <section className="panel flex flex-col items-center gap-5 p-6 text-center">
      <h2 className="font-display text-2xl font-extrabold">{guestsDone ? "Your candle!" : "The guests are blowing…"}</h2>
      <p className="text-haze">{guestsDone ? "Make a wish, then blow out the last one." : `${Math.max(0, lit - 1)} of ${candles - 1} guest candles still lit. You can wait for them, or blow out everything now.`}</p>
      <button
        onClick={() => void act({ type: "judge/cake/blow" })}
        className="grid size-48 place-items-center rounded-full bg-gold text-6xl shadow-[0_10px_0_0_var(--color-gold-deep)] transition duration-100 active:translate-y-2 active:shadow-[0_2px_0_0_var(--color-gold-deep)]"
        aria-label="Blow out my candle"
      >
        🕯️
      </button>
      <p className="font-mono text-xs uppercase tracking-widest text-haze">Tap to blow</p>
    </section>
  );
}

function WkmbJudge({ g, act }: { g: WkmbView; act: Act }) {
  const unscored = g.answers.filter((a) => a.stars === null).length;
  return (
    <section className="flex flex-col gap-3">
      <p className="font-mono text-xs uppercase tracking-[0.25em] text-gold">Who Knows Mez Best · {g.index + 1}/{g.total}</p>
      <h1 className="font-display text-2xl font-extrabold">{g.prompt}</h1>
      <p className="text-sm text-haze">{g.step === "answers" ? "Give each answer 0–3 stars. Names stay hidden until you lock." : "Scores locked. The host reveals who wrote what."}</p>
      <ul className="flex flex-col gap-2">
        {g.answers.map((a) => (
          <li key={a.key} className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="flex gap-2">
              <span className="font-display font-extrabold text-gold">{a.key}</span>
              <span className="min-w-0 flex-1">{a.text}</span>
            </div>
            {a.author && <p className="mt-1 text-xs text-haze">— {a.author.name}{a.author.remote && " (remote)"}</p>}
            <div className="mt-2 flex gap-1.5" role="group" aria-label={`Stars for answer ${a.key}`}>
              {[0, 1, 2, 3].map((n) => (
                <button
                  key={n}
                  disabled={g.step !== "answers"}
                  aria-pressed={a.stars === n}
                  onClick={() => void act({ type: "judge/score", key: a.key, stars: n })}
                  className={cx("flex min-h-11 flex-1 items-center justify-center gap-0.5 rounded-lg border text-sm font-bold", a.stars === n ? "border-gold bg-gold text-ink-950" : "border-white/15")}
                >
                  {n === 0 ? "0" : Array.from({ length: n }, (_, i) => <Star key={i} className="size-4 fill-current" aria-hidden />)}
                  <span className="sr-only">{n} stars</span>
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {g.step === "answers" && (
        <Button
          variant="primary"
          className="min-h-14 text-lg"
          disabled={unscored > 0}
          onClick={() => {
            if (window.confirm("Lock these scores? You can't change them after.")) void act({ type: "judge/lock" });
          }}
        >
          <Lock className="size-5" aria-hidden /> {unscored ? `Score ${unscored} more` : "Lock scores"}
        </Button>
      )}
    </section>
  );
}

function TrialJudge({ g, act, offset }: { g: TrialView; act: Act; offset: number }) {
  const left = useCountdown(g.stepEndsAt, offset);
  return (
    <section className="flex flex-col gap-3">
      <p className="font-mono text-xs uppercase tracking-[0.25em] text-gold">Mez on Trial · charge {g.index + 1}/{g.total}</p>
      <div className="file-card p-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-ink-600">You stand accused of</p>
        <p className="mt-1 text-lg font-semibold">{g.charge}</p>
      </div>
      {(g.step === "charge" || g.step === "defence") && (
        <>
          <p className="text-sm text-haze">How do you plead?</p>
          <div className="grid grid-cols-2 gap-2">
            {(["guilty", "not_guilty"] as const).map((p) => (
              <Button key={p} variant={g.plea === p ? "primary" : "ghost"} className="min-h-14" onClick={() => void act({ type: "judge/plea", plea: p })} aria-pressed={g.plea === p}>
                {p === "guilty" ? "Guilty" : "Not guilty"}
              </Button>
            ))}
          </div>
        </>
      )}
      {g.step === "defence" && (
        <Button variant="danger" className="min-h-14 text-lg" onClick={() => void act({ type: "judge/rest" })}>
          <Gavel className="size-5" aria-hidden /> I rest my case {left !== null && `(${left}s)`}
        </Button>
      )}
      {g.step === "vote" && <p className="panel p-4 text-center">The jury is voting… {g.votesIn}/{g.jurors}</p>}
      {g.step === "verdict" && g.verdict && (
        <p className="panel p-4 text-center text-lg">
          {g.verdict.outcome === "guilty" ? "Guilty!" : g.verdict.outcome === "not_guilty" ? "Not guilty! 🎉" : "Hung jury."} Accused by {g.verdict.accuser.name}.
        </p>
      )}
    </section>
  );
}

function MysteryJudge({ g, act }: { g: MysteryView; act: Act }) {
  return (
    <section className="flex flex-col gap-3">
      <p className="font-mono text-xs uppercase tracking-[0.25em] text-gold">Mystery Files · exhibit {g.index + 1}/{g.total}</p>
      {g.exhibit.kind === "memory" && <blockquote className="file-card p-4 text-lg">“{g.exhibit.text}”</blockquote>}
      {g.exhibit.kind !== "memory" && <p className="text-sm text-haze">The {g.exhibit.kind} is on the TV.</p>}
      {g.step === "reveal" && g.reveal ? (
        <p className="panel p-4 text-center text-lg">
          It was <strong className="text-gold">{g.reveal.name}</strong>. {g.reveal.mezRight ? "You got it! 🎯" : g.mezGuess ? `You said ${g.mezGuess}.` : ""}
        </p>
      ) : (
        <>
          <p className="font-semibold">Whose file is it? {g.mezGuess && <span className="text-go">You said {g.mezGuess}</span>}</p>
          <ul className="grid gap-2">
            {g.suspects.map((s) => (
              <li key={s.id}>
                <Button className="w-full justify-start" variant={g.mezGuess === s.name ? "primary" : "ghost"} onClick={() => void act({ type: "judge/guess", suspectId: s.id })}>
                  {s.name}
                </Button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-haze">You can change your mind until the host reveals it.</p>
        </>
      )}
    </section>
  );
}

function Bonus({ view, act }: { view: RoomView; act: Act }) {
  const people = [
    ...view.players.map((p) => ({ key: `player:${p.id}`, label: p.name, board: "live" as const, subject: { kind: "player" as const, id: p.id } })),
    ...view.games.boards.expert.map((r) => ({ key: `contributor:${r.subject.id}`, label: `${r.subject.name} (Mez Expert)`, board: "expert" as const, subject: { kind: "contributor" as const, id: r.subject.id } })),
  ];
  const [who, setWho] = useState("");
  const [amount, setAmount] = useState(25);
  const [reason, setReason] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const max = view.games.points.judgeBonusMax;
  const pick = people.find((p) => p.key === who);
  return (
    <details className="panel p-4">
      <summary className="cursor-pointer font-semibold">Judge&apos;s bonus</summary>
      <form
        className="mt-3 flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!pick) return;
          if (await act({ type: "judge/bonus", board: pick.board, subject: pick.subject, delta: amount, reason })) {
            setDone(`+${amount} to ${pick.label}`);
            setReason("");
          }
        }}
      >
        <select className="input" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Who gets the bonus">
          <option value="">Choose someone…</option>
          {people.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
        <div className="flex gap-2" role="group" aria-label="Bonus points">
          {[10, 25, 50, 100].filter((n) => n <= max).map((n) => (
            <button type="button" key={n} aria-pressed={amount === n} onClick={() => setAmount(n)} className={cx("min-h-11 flex-1 rounded-lg border font-bold", amount === n ? "border-gold bg-gold text-ink-950" : "border-white/15")}>
              +{n}
            </button>
          ))}
        </div>
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={100} placeholder="Why? (shown in the score history)" aria-label="Reason" />
        <Button type="submit" variant="primary" disabled={!pick || reason.trim().length < 3}>
          Give bonus
        </Button>
        {done && <p className="text-sm text-go">{done}</p>}
        <p className="text-xs text-haze">Bonuses are public in the score history. Max +{max}.</p>
      </form>
    </details>
  );
}

function ContactToggle({ view, act }: { view: RoomView; act: Act }) {
  const on = view.games.wheel.allowContact;
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => void act({ type: "judge/allowContact", allowed: !on })}
      className={cx("flex items-center justify-between gap-3 rounded-2xl border p-4 text-left", on ? "border-go/50 bg-go/10" : "border-white/10 bg-white/5")}
    >
      <span className="flex items-center gap-2">
        <Heart className={cx("size-5", on ? "text-go" : "text-haze")} aria-hidden />
        <span>
          <span className="block font-semibold">Hug prizes on the wheel</span>
          <span className="block text-xs text-haze">Only if you&apos;re comfortable. Winners can always decline.</span>
        </span>
      </span>
      <span className={cx("font-mono text-sm", on ? "text-go" : "text-haze")}>{on ? "ON" : "OFF"}</span>
    </button>
  );
}
