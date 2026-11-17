"use client";

import { useEffect, useRef, useState } from "react";
import { useNow } from "@/lib/client/hooks";
import { cx, TILE } from "@/components/ui";
import { BoardColumn, Counter, GameTitle, PrizeWheel, RevealCard, Scene, Stamp, stepSfx, TimerRing, useCountdown, VoteBars } from "@/components/tv";
import type { RoomView } from "@/lib/game/types";
import { PRIZES, timerMs, TIMERS } from "@/lib/games/config";
import type { GameView, ImposterView, MysteryView, SurveyView, TrialView, WkmbView } from "@/lib/games/views";
import type { SfxKind } from "@/lib/host/types";
import { EVENT } from "@/lib/event";

type Sfx = (k: SfxKind) => void;

const GAME_NAME: Record<GameView["id"], string> = {
  imposter: "Mez Imposter",
  wkmb: "Who Knows Mez Best",
  survey: "Mez Survey",
  trial: "Mez on Trial",
  mystery: "Mystery Files",
};

/** Plays a cue when a game moves to a new step, and ticks through the last seconds of a timer. */
export function useGameCues(view: RoomView | null, clockOffset: number, sfx: Sfx) {
  const g = view?.games.game ?? null;
  const key = g ? `${g.id}:${g.step}:${"index" in g ? g.index : 0}` : null;
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!key || key === last.current) return;
    const first = last.current === null;
    last.current = key;
    if (!first) {
      const fx = stepSfx(key.split(":").slice(0, 2).join(":"));
      if (fx) sfx(fx);
    }
  }, [key, sfx]);
  const left = useCountdown(g?.stepEndsAt ?? null, clockOffset);
  const ticked = useRef<string | null>(null);
  useEffect(() => {
    if (left === null || left > 3 || left === 0) return;
    const mark = `${key}:${left}`;
    if (ticked.current === mark) return;
    ticked.current = mark;
    sfx("tick");
  }, [left, key, sfx]);
}

export function GameStage({ view, clockOffset, sfx }: { view: RoomView; clockOffset: number; sfx: Sfx }) {
  const g = view.games.game!;
  const key = `${g.id}:${g.step}:${"index" in g ? g.index : 0}`;
  return (
    <Scene sceneKey={key} variant={g.step === "reveal" || g.step === "verdict" || g.step === "revealed" ? "curtain" : "rise"} className="gap-6">
      {g.id === "imposter" && <Imposter g={g} clockOffset={clockOffset} />}
      {g.id === "wkmb" && <Wkmb g={g} />}
      {g.id === "survey" && <Survey g={g} clockOffset={clockOffset} sfx={sfx} />}
      {g.id === "trial" && <Trial g={g} clockOffset={clockOffset} />}
      {g.id === "mystery" && <Mystery g={g} clockOffset={clockOffset} />}
    </Scene>
  );
}

function Header({ g, step, clockOffset, total, counter }: { g: GameView; step: string; clockOffset: number; total?: keyof typeof TIMERS; counter?: { label: string; value: number; of: number } }) {
  const progress = "index" in g ? `${g.index + 1} / ${g.total}` : undefined;
  return (
    <div className="flex items-center justify-between gap-6">
      <div className="min-w-0 flex-1">
        <GameTitle name={GAME_NAME[g.id]} step={step} progress={progress} />
      </div>
      {counter && <Counter {...counter} />}
      {total && g.stepEndsAt && <TimerRing endsAt={g.stepEndsAt} totalMs={timerMs(total)} clockOffset={clockOffset} />}
    </div>
  );
}

function Imposter({ g, clockOffset }: { g: ImposterView; clockOffset: number }) {
  if (g.step === "deal")
    return (
      <>
        <Header g={g} step="Secret words dealt" clockOffset={clockOffset} />
        <div className="m-auto flex flex-col items-center gap-6 text-center">
          <div className="text-8xl" aria-hidden>🕵️</div>
          <h1 className="font-display text-6xl font-extrabold">Check your phone. Secretly.</h1>
          <p className="text-3xl text-haze">
            Everyone has the same word, except the imposter. Category: <span className="text-gold">{g.category}</span>
          </p>
          <p className="font-mono text-xl text-haze">{g.total} detectives in this round</p>
        </div>
      </>
    );
  if (g.step === "clues")
    return (
      <>
        <Header g={g} step="Clue time" clockOffset={clockOffset} total="imposterClues" counter={{ label: "clues in", value: g.cluesIn, of: g.total }} />
        <div className="m-auto max-w-4xl text-center">
          <h1 className="font-display text-6xl font-extrabold">One word. Don&apos;t give it away.</h1>
          <p className="mt-4 text-3xl text-haze">Category: {g.category}</p>
        </div>
      </>
    );
  if (g.step === "cluesShown" || g.step === "vote")
    return (
      <>
        <Header
          g={g}
          step={g.step === "vote" ? "Vote now" : "The clues"}
          clockOffset={clockOffset}
          total={g.step === "vote" ? "imposterVote" : undefined}
          counter={g.step === "vote" ? { label: "votes in", value: g.votesIn, of: g.total } : undefined}
        />
        <ul className="grid flex-1 auto-rows-min grid-cols-2 gap-4 xl:grid-cols-4">
          {g.clues.map((c, i) => (
            <li key={c.id} className="file-card animate-flip p-5 text-center" style={{ animationDelay: `${i * 90}ms` }}>
              <div className="font-display text-4xl font-extrabold">{c.clue}</div>
              <div className="mt-2 font-mono text-sm uppercase tracking-[0.2em] text-ink-600">{c.name}</div>
            </li>
          ))}
        </ul>
        {g.step === "vote" && <p className="text-center text-3xl text-haze">Who&apos;s bluffing? Vote on your phone.</p>}
      </>
    );
  const r = g.reveal!;
  return (
    <>
      <Header g={g} step="The reveal" clockOffset={clockOffset} />
      <div className="grid flex-1 items-center gap-10 lg:grid-cols-2">
        <div className="flex flex-col items-center gap-6 text-center">
          <Stamp text={r.caught ? "Caught!" : "Escaped!"} tone={r.caught ? "go" : "stamp"} />
          <p className="text-3xl">
            The imposter was <strong className="text-gold">{r.imposters.map((i) => i.name).join(" & ")}</strong>
          </p>
          <p className="text-2xl text-haze">
            The word was <strong className="text-cream">{r.word}</strong>
          </p>
          {r.guessedWord.length > 0 && <p className="text-xl text-go">…and {r.guessedWord.join(" & ")} guessed it!</p>}
        </div>
        <VoteBars items={r.tally.filter((t) => t.votes > 0).map((t) => ({ id: t.id, label: t.name, value: t.votes }))} highlight={r.imposters.map((i) => i.id)} />
      </div>
    </>
  );
}

function Stars({ n }: { n: number | null }) {
  if (n === null) return null;
  return (
    <span className="text-gold" aria-label={`${n} of 3 stars`}>
      {"★".repeat(n)}
      <span className="text-white/20">{"★".repeat(3 - n)}</span>
    </span>
  );
}

function Wkmb({ g }: { g: WkmbView }) {
  const step = g.step === "answers" ? "Mez is judging" : g.step === "scored" ? "Scores are in" : "Who wrote what";
  return (
    <>
      <Header g={g} step={step} clockOffset={0} />
      <h1 className="font-display text-5xl font-extrabold leading-tight">{g.prompt}</h1>
      <ul className={cx("grid flex-1 auto-rows-min gap-4", g.answers.length > 8 ? "grid-cols-3 xl:grid-cols-4" : "grid-cols-2 xl:grid-cols-3")}>
        {g.answers.map((a, i) => (
          <li key={a.key} className="file-card relative p-5" style={{ animationDelay: `${i * 60}ms` }}>
            <span className="absolute -left-3 -top-3 grid size-10 place-items-center rounded-full bg-gold font-display text-xl font-extrabold text-ink-950">{a.key}</span>
            <p className={cx("font-semibold leading-snug", g.answers.length > 8 ? "text-xl" : "text-2xl")}>{a.text}</p>
            <div className="mt-3 flex items-center justify-between gap-2 text-2xl">
              <Stars n={a.stars} />
              <RevealCard
                revealed={!!a.author}
                front={<span className="font-mono text-sm text-ink-600">???</span>}
                back={
                  <span className="font-mono text-base font-bold uppercase tracking-wider text-ink-900">
                    {a.author?.name}
                    {a.author?.remote && <span className="ml-1 text-tile-b">· remote</span>}
                  </span>
                }
              />
            </div>
          </li>
        ))}
      </ul>
      {g.step === "answers" && <p className="text-center text-2xl text-haze">Answers are anonymous. Mez scores them from the judge phone.</p>}
    </>
  );
}

function Survey({ g, clockOffset, sfx }: { g: SurveyView; clockOffset: number; sfx: Sfx }) {
  const shown = g.answers.filter((a) => a.label !== null).length;
  const prev = useRef(shown);
  useEffect(() => {
    if (shown > prev.current) sfx("ding");
    prev.current = shown;
  }, [shown, sfx]);
  return (
    <>
      <Header
        g={g}
        step={g.step === "guess" ? "Guess the top answers" : "Survey says"}
        clockOffset={clockOffset}
        total={g.step === "guess" ? "surveyGuess" : undefined}
        counter={g.step === "guess" ? { label: "answers in", value: g.guessesIn, of: g.players } : undefined}
      />
      <div>
        <p className="font-mono text-lg uppercase tracking-[0.25em] text-haze">We asked {g.respondents} guests</p>
        <h1 className="mt-1 font-display text-5xl font-extrabold leading-tight">{g.prompt}</h1>
      </div>
      <ol className="grid auto-rows-[5.5rem] grid-cols-1 content-start gap-3 md:grid-cols-2">
        {g.answers.map((a) => (
          <li key={a.rank} className={cx("flex items-center gap-4 rounded-2xl border-2 px-6", a.label ? "border-gold bg-gold/15 animate-flip" : "border-white/15 bg-ink-800")}>
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-ink-950 font-display text-2xl font-extrabold text-gold">{a.rank}</span>
            {a.label ? (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-3xl font-extrabold">{a.label}</span>
                  {a.matchedBy.length > 0 && <span className="block truncate text-base text-go">✓ {a.matchedBy.join(", ")}</span>}
                </span>
                <span className="font-mono text-4xl font-bold tabular-nums">{a.count}</span>
              </>
            ) : (
              <span className="h-3 flex-1 rounded-full bg-white/10" aria-label="hidden answer" />
            )}
          </li>
        ))}
      </ol>
      {g.step === "reveal" && g.misses > 0 && (
        <p className="text-center text-4xl font-extrabold text-stamp" aria-label={`${g.misses} guesses not on the board`}>
          {"✗ ".repeat(Math.min(g.misses, 8))}
        </p>
      )}
    </>
  );
}

function Trial({ g, clockOffset }: { g: TrialView; clockOffset: number }) {
  const step = { charge: "The charge", defence: "The defence", vote: "The jury decides", verdict: "The verdict" }[g.step];
  return (
    <>
      <Header
        g={g}
        step={step}
        clockOffset={clockOffset}
        total={g.step === "defence" ? "trialDefence" : g.step === "vote" ? "trialVote" : undefined}
        counter={g.step === "vote" ? { label: "jurors voted", value: g.votesIn, of: g.jurors } : undefined}
      />
      <div className="m-auto flex w-full max-w-5xl flex-col items-center gap-8 text-center">
        <div className="text-7xl" aria-hidden>⚖️</div>
        <div className="file-card w-full p-8">
          <p className="font-mono text-sm uppercase tracking-[0.3em] text-ink-600">{EVENT.guestOfHonour} stands accused of</p>
          <p className="mt-3 font-display text-5xl font-extrabold leading-tight">{g.charge}</p>
        </div>
        {g.plea && g.step !== "verdict" && <p className="text-3xl">Plea: <strong className={g.plea === "guilty" ? "text-stamp" : "text-go"}>{g.plea === "guilty" ? "Guilty" : "Not guilty"}</strong></p>}
        {g.step === "vote" && <p className="text-3xl text-haze">Guilty or not guilty? Vote on your phone.</p>}
        {g.step === "verdict" && g.verdict && (
          <>
            <Stamp text={g.verdict.outcome === "guilty" ? "Guilty" : g.verdict.outcome === "not_guilty" ? "Not guilty" : "Hung jury"} tone={g.verdict.outcome === "guilty" ? "stamp" : g.verdict.outcome === "not_guilty" ? "go" : "gold"} />
            <div className="w-full max-w-3xl">
              <VoteBars
                items={[
                  { id: "g", label: "Guilty", value: g.verdict.guilty },
                  { id: "n", label: "Not guilty", value: g.verdict.notGuilty },
                ]}
                highlight={g.verdict.outcome === "guilty" ? ["g"] : g.verdict.outcome === "not_guilty" ? ["n"] : []}
              />
            </div>
            <p className="text-2xl text-haze">
              Accusation filed by <strong className="text-cream">{g.verdict.accuser.name}</strong>
              {g.verdict.accuser.remote && " (from afar)"}
            </p>
          </>
        )}
      </div>
    </>
  );
}

function Mystery({ g, clockOffset }: { g: MysteryView; clockOffset: number }) {
  const ex = g.exhibit;
  const step = { exhibit: "New evidence", guess: "Whose file is it?", reveal: "Case solved" }[g.step];
  return (
    <>
      <Header
        g={g}
        step={step}
        clockOffset={clockOffset}
        total={g.step === "guess" ? "mysteryGuess" : undefined}
        counter={g.step === "guess" ? { label: "guesses in", value: g.guessesIn, of: g.players } : undefined}
      />
      <div className="grid min-h-0 flex-1 items-center gap-8 lg:grid-cols-[1.4fr_1fr]">
        <figure className="flex min-h-0 items-center justify-center">
          {ex.kind === "memory" ? (
            <blockquote className="file-card max-w-3xl p-10 text-3xl font-medium leading-relaxed">“{ex.text}”</blockquote>
          ) : ex.mediaUrl ? (
            ex.kind === "photo" ? (
              // eslint-disable-next-line @next/next/no-img-element -- private, signed link
              <img src={ex.mediaUrl} alt="Mystery exhibit" className="max-h-[58vh] rounded-2xl object-contain shadow-2xl" />
            ) : (
              <video src={ex.mediaUrl} autoPlay controls playsInline className="max-h-[58vh] rounded-2xl bg-black shadow-2xl" />
            )
          ) : (
            <p className="text-2xl text-haze">Exhibit unavailable</p>
          )}
        </figure>
        <div className="flex flex-col items-center gap-6 text-center">
          {g.step !== "reveal" ? (
            <>
              <div className="text-8xl" aria-hidden>🔍</div>
              <p className="text-3xl">{g.step === "guess" ? "Pick a suspect on your phone." : "Study the evidence…"}</p>
              <p className={cx("font-mono text-xl", g.mezHasGuessed ? "text-go" : "text-haze")}>{g.mezHasGuessed ? "Mez has made a call" : "Mez is thinking"}</p>
            </>
          ) : (
            <>
              <p className="font-mono text-lg uppercase tracking-[0.3em] text-haze">This file belongs to</p>
              <p className="animate-stamp font-display text-6xl font-extrabold text-gold">{g.reveal!.name}</p>
              {g.reveal!.remote && <p className="text-xl text-tile-b">who&apos;s with us from afar</p>}
              <p className="text-2xl">{g.mezGuess ? (g.reveal!.mezRight ? "Mez got it right! 🎯" : `Mez guessed ${g.mezGuess}. Wrong!`) : "Mez didn't guess."}</p>
              {g.reveal!.correct.length > 0 && <p className="text-xl text-go">Also right: {g.reveal!.correct.join(", ")}</p>}
              <p className="font-mono text-base text-haze">Mez&apos;s record: {g.mezRecord.right}/{g.mezRecord.total}</p>
            </>
          )}
        </div>
      </div>
    </>
  );
}

export function WheelScene({ view, sfx }: { view: RoomView; sfx: Sfx }) {
  const w = view.games.wheel;
  const cur = w.current;
  const [settledId, setSettledId] = useState<string | null>(null);
  const now = useNow(500);
  // A screen that (re)connects after the spin finished shows the result straight away.
  const settled = cur ? settledId === cur.id || (now !== null && now - cur.at > 7000) : false;
  const spinning = !!cur && !settled;
  const spinId = cur?.id;
  useEffect(() => {
    if (spinId) sfx("drumroll");
  }, [spinId, sfx]);
  useEffect(() => {
    if (cur?.status === "accepted") sfx("fanfare");
  }, [cur?.status, sfx]);
  const prize = cur ? PRIZES.find((p) => p.id === cur.prize) : null;
  return (
    <Scene sceneKey="wheel" className="items-center gap-6">
      <GameTitle name="The Prize Wheel" step={cur ? `Spinning for ${cur.recipient.name}` : "Top of the boards get a spin"} />
      <div className="grid w-full flex-1 items-center gap-8 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex justify-center">
          <PrizeWheel segments={w.segments} landOn={cur ? cur.index : null} spinId={cur?.id ?? null} onSettled={() => cur && setSettledId(cur.id)} />
        </div>
        <div className="flex flex-col items-center gap-5 text-center">
          {!cur && <p className="text-3xl text-haze">Leaders on either board can win a spin.</p>}
          {cur && spinning && <p className="animate-pulse text-4xl font-extrabold">Spinning…</p>}
          {cur && !spinning && prize && (
            <>
              <p className="font-mono text-lg uppercase tracking-[0.3em] text-haze">{cur.recipient.name} wins</p>
              <p className="animate-stamp font-display text-6xl font-extrabold text-gold">{prize.label}</p>
              <p className={cx("text-2xl", cur.status === "accepted" ? "text-go" : cur.status === "declined" ? "text-haze" : "text-cream")}>
                {cur.status === "offered" ? "Accept or decline. Totally your call." : cur.status === "accepted" ? "Accepted! 🎉" : "Politely declined. No problem at all."}
              </p>
            </>
          )}
          <p className="mt-4 max-w-md text-sm text-haze">Every prize has an equal chance. The server draws the result at random and logs it; nobody can pick the outcome.</p>
        </div>
      </div>
    </Scene>
  );
}

export function BoardsScene({ view }: { view: RoomView }) {
  const p = view.games.points;
  return (
    <Scene sceneKey="boards" className="gap-6">
      <h1 className="font-display text-5xl font-extrabold">The Leaderboards</h1>
      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-2">
        <BoardColumn title="Mez Expert" subtitle="Who really knows Mez · in the room or from afar" rows={view.games.boards.expert} empty="No expert points yet" />
        <BoardColumn title="Live Games Champion" subtitle="Points from tonight's live rounds" rows={view.games.boards.live} empty="No live points yet" />
      </div>
      <p className="text-center font-mono text-sm text-haze">
        How points work: Mez&apos;s stars ×{p.wkmbPerStar} · upheld accusation +{p.trialAccuserGuilty} (Mez Expert) · caught the imposter +{p.imposterVotedRight} · imposter escapes +{p.imposterEscape} · survey ×{p.surveyPerPerson} per matching guest · jury majority +{p.trialJurorMajority} · mystery guess +{p.mysteryCorrectGuess}. Every point is logged.
      </p>
    </Scene>
  );
}

export { TILE };

export function SurpriseScene({ view }: { view: RoomView }) {
  const s = view.surprise!;
  const lang = view.host.utterance.lang;
  const body = s.kind === "memory" ? s.text.en : lang === "bn" ? s.text.bn || s.text.en : s.text.en || s.text.bn;
  const second = s.kind === "announcement" && lang === "both" && s.text.en && s.text.bn ? s.text.bn : null;
  return (
    <Scene sceneKey={`surprise:${s.id}:${s.at}`} variant="curtain" className="items-center justify-center gap-8">
      <Confetti />
      <p className="font-mono text-xl uppercase tracking-[0.4em] text-stamp">{s.kind === "memory" ? "A memory for Mez" : "Special announcement"}</p>
      <div className="grid w-full max-w-6xl items-center gap-10 lg:grid-flow-col">
        {s.mediaUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- private, signed link
          <img src={s.mediaUrl} alt={s.from ? `Photo from ${s.from}` : "Surprise photo"} className="max-h-[52vh] rounded-2xl object-contain shadow-2xl" />
        )}
        <div className="file-card animate-pop p-10 text-center">
          {s.kind === "announcement" && <h1 className="font-display text-5xl font-extrabold text-ink-900">{s.title}</h1>}
          <p className={cx("font-medium leading-relaxed text-ink-900", s.kind === "announcement" ? "mt-4 text-3xl" : "text-4xl")}>{s.kind === "memory" ? `“${body}”` : body}</p>
          {second && <p className="mt-3 font-bangla text-2xl text-ink-700">{second}</p>}
          {s.from && <p className="mt-6 font-mono text-lg uppercase tracking-[0.25em] text-ink-600">— {s.from}</p>}
        </div>
      </div>
    </Scene>
  );
}

const CONFETTI = ["🎉", "🎈", "✨", "🎂", "⭐", "🎊"];
function Confetti() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 20 }, (_, i) => (
        <span key={i} className="absolute -top-12 animate-drift text-4xl" style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i * 0.43) % 9}s`, animationDuration: `${7 + (i % 5)}s` }}>
          {CONFETTI[i % CONFETTI.length]}
        </span>
      ))}
    </div>
  );
}
