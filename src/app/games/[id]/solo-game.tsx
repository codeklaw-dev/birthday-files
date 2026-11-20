"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, Gavel, X } from "lucide-react";
import { GAME_ART } from "@/components/game-art";
import { cx, TILE } from "@/components/ui";
import { usePlayerToken, useStored } from "@/lib/client/hooks";
import { useRoom, type RoomConnection } from "@/lib/client/use-room";
import { EVENT } from "@/lib/event";
import type { SoloGameId, SoloGameView, SoloOutcome } from "@/lib/game/types";
import logo from "@/assets/party/logo.png";

/** A game virtual troopers play at their own pace. Party guests play live on the night instead. */
export function SoloGameScreen({ id }: { id: SoloGameId }) {
  const [attendance] = useStored("local", "bf.attendance");
  const game = EVENT.games.find((g) => g.id === id)!;
  const art = GAME_ART[id];

  return (
    <main className="party-stage flex flex-1 flex-col">
      <header className="flex items-center justify-between gap-3 px-4 pt-3">
        <Link href="/invite" aria-label="Back to the invite">
          <Image src={logo} alt={EVENT.title} preload sizes="96px" className="w-24 -rotate-3" />
        </Link>
        <Link href="/invite" className="rounded-full bg-party-ink/35 px-3 py-1.5 text-sm font-semibold">
          All games
        </Link>
      </header>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pb-8 pt-4">
        <div className="flex items-center gap-3">
          {art && <Image src={art.src} alt="" sizes="80px" className="h-16 w-16 shrink-0 object-contain" />}
          <h1 className="font-party text-3xl leading-tight">{game.name}</h1>
        </div>
        {attendance === undefined ? null : attendance === "virtual" ? (
          <VirtualGame id={id} />
        ) : (
          <section className="party-card p-6 text-center">
            <h2 className="font-party text-2xl text-party-purple">Played live at the party</h2>
            <p className="mt-2 text-party-ink/80">
              {attendance === "party"
                ? "You're coming to the party, so this one is a surprise. You'll play it live with everyone on the night!"
                : "Open the invite first and tell us whether you'll be at the party."}
            </p>
            <Link href="/invite" className="party-pill mt-5 w-full bg-party-green text-white">
              Back to the invite
            </Link>
          </section>
        )}
      </div>
    </main>
  );
}

function VirtualGame({ id }: { id: SoloGameId }) {
  const token = usePlayerToken();
  const [profileRaw] = useStored("local", "bf.profile");
  const room = useRoom("player", { token, enabled: !!token });
  const { view } = room;
  const name = (() => {
    try {
      const p = profileRaw ? JSON.parse(profileRaw) : null;
      return typeof p?.name === "string" ? p.name : "";
    } catch {
      return "";
    }
  })();

  // Join the room as a virtual trooper (or mark an earlier join as remote) using the invite's name.
  const joining = useRef(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  useEffect(() => {
    if (!view || !token || !name || joining.current) return;
    if (view.me?.remote) return;
    joining.current = true;
    void room.send({ type: "join", token, name: view.me?.name ?? name, avatar: view.me?.avatar ?? "🌍", remote: true }).then((res) => {
      joining.current = false;
      if (!res.ok) setJoinError(res.error ?? "Couldn't join the game.");
    });
  }, [view, token, name, room]);

  if (!name) {
    return (
      <section className="party-card p-6 text-center">
        <p className="text-party-ink/80">Finish the wish form on the invite first, then come back to play.</p>
        <Link href="/invite" className="party-pill mt-5 w-full bg-party-green text-white">
          Back to the invite
        </Link>
      </section>
    );
  }
  if (joinError) return <p className="party-card p-6 text-center font-semibold text-party-berry">{joinError}</p>;
  if (!view?.solo || !view.me) return <p className="m-auto font-semibold">Opening the case file…</p>;

  const result = view.solo.results[id];
  return result ? (
    <Results game={view.solo.games[id]} result={result} total={view.me.score} done={Object.keys(view.solo.results) as SoloGameId[]} />
  ) : (
    <Play id={id} game={view.solo.games[id]} room={room} token={token!} />
  );
}

function Play({ id, game, room, token }: { id: SoloGameId; game: SoloGameView; room: RoomConnection; token: string }) {
  const [started, setStarted] = useState(false);
  const [answers, setAnswers] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const index = answers.length;
  const q = game.questions[index];

  const submit = async (all: number[]) => {
    setSending(true);
    setError(null);
    const res = await room.send({ type: "solo/submit", token, game: id, answers: all });
    setSending(false);
    if (!res.ok) setError(res.error ?? "Couldn't save your answers. Try again.");
  };

  if (!started) {
    return (
      <section className="party-card flex flex-col gap-4 p-6 text-center">
        <p className="text-lg text-party-ink/85">{game.intro}</p>
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-party-plum">
          {game.questions.length} questions · one try
        </p>
        <button type="button" onClick={() => setStarted(true)} className="party-pill w-full bg-party-green text-white">
          Start
        </button>
      </section>
    );
  }

  if (!q) {
    return (
      <section className="party-card flex flex-col items-center gap-4 p-6 text-center">
        <p className="font-semibold">{sending ? "Saving your answers…" : error ? "Your answers weren't saved." : "All answered!"}</p>
        {error && (
          <>
            <p role="alert" className="text-sm font-semibold text-party-berry">
              {error}
            </p>
            <button type="button" onClick={() => void submit(answers)} className="party-pill w-full bg-party-purple text-white">
              Try again
            </button>
          </>
        )}
      </section>
    );
  }

  const verdict = q.options.length === 2;
  return (
    <section className="flex flex-col gap-4" aria-live="polite">
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-party-ink/35 px-3 py-1 font-mono text-xs font-semibold uppercase tracking-widest">
          Question {index + 1} of {game.questions.length}
        </span>
        <div className="flex gap-1.5" aria-hidden>
          {game.questions.map((_, i) => (
            <span key={i} className={cx("h-2 w-6 rounded-full", i <= index ? "bg-party-yellow" : "bg-white/25")} />
          ))}
        </div>
      </div>
      <h2 className="font-party text-[1.6rem] leading-tight">{q.prompt}</h2>
      <div className={cx("grid gap-3", verdict ? "grid-cols-1" : "grid-cols-2")}>
        {q.options.map((opt, i) => {
          const { Icon, bg } = TILE[i % 4];
          const tone = verdict ? (i === 0 ? "bg-party-pink" : "bg-party-mint") : bg;
          return (
            <button
              key={`${index}-${i}`}
              type="button"
              disabled={sending}
              onClick={() => {
                const next = [...answers, i];
                setAnswers(next);
                if (next.length === game.questions.length) void submit(next);
              }}
              className={cx(
                "flex flex-col items-center justify-center gap-3 rounded-[1.75rem] p-3 text-center text-lg font-bold leading-snug text-party-ink",
                "shadow-[0_6px_0_rgb(0_0_0/0.2)] transition duration-150 active:translate-y-1 active:shadow-[0_2px_0_rgb(0_0_0/0.2)]",
                verdict ? "min-h-24 flex-row text-xl" : "min-h-36",
                tone,
              )}
            >
              <span aria-hidden className="grid size-12 place-items-center rounded-full bg-white/45">
                {verdict ? <Gavel className="size-6" /> : <Icon className="size-7" fill="currentColor" strokeWidth={2} />}
              </span>
              <span className="break-words">{opt}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Results({
  game,
  result,
  total,
  done,
}: {
  game: SoloGameView;
  result: SoloOutcome;
  total: number;
  done: SoloGameId[];
}) {
  const next = EVENT.games.filter((g) => !done.includes(g.id as SoloGameId));
  const label = game.scoring === "verdict" ? "The jury so far" : game.scoring === "survey" ? "What the party guests said" : null;
  return (
    <div className="flex flex-col gap-5">
      <section className="party-card p-6 text-center">
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-party-plum">Case closed</p>
        <p className="mt-1 font-party text-5xl text-party-purple">+{result.points}</p>
        <p className="mt-1 text-party-ink/80">
          points · {total} in total. They count on the party leaderboard.
        </p>
      </section>

      <ol className="flex flex-col gap-3">
        {game.questions.map((q, i) => {
          const item = result.items[i];
          const mine = result.answers[i];
          const right = item.correctIndex !== null && mine === item.correctIndex;
          return (
            <li key={i} className="party-card p-4">
              <p className="font-semibold">{q.prompt}</p>
              {item.correctIndex !== null ? (
                <p className={cx("mt-2 flex items-start gap-2 text-sm font-semibold", right ? "text-party-green" : "text-party-berry")}>
                  {right ? <Check aria-hidden className="mt-0.5 size-4 shrink-0" /> : <X aria-hidden className="mt-0.5 size-4 shrink-0" />}
                  {right ? `Right: ${q.options[mine]}` : `You said ${q.options[mine]}. It was ${q.options[item.correctIndex]}.`}
                </p>
              ) : (
                item.shares && (
                  <div className="mt-3">
                    {label && <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-party-plum">{label}</p>}
                    <ul className="flex flex-col gap-1.5">
                      {q.options.map((opt, o) => (
                        <li key={o} className="text-sm">
                          <div className="flex justify-between gap-2">
                            <span className={cx(o === mine && "font-bold")}>
                              {opt}
                              {o === mine && " (you)"}
                            </span>
                            <span className="font-mono tabular-nums">{item.shares![o]}%</span>
                          </div>
                          <div className="mt-1 h-2 overflow-hidden rounded-full bg-party-purple/15">
                            <div className={cx("h-full rounded-full", o === mine ? "bg-party-purple" : "bg-party-purple/40")} style={{ width: `${item.shares![o]}%` }} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              )}
            </li>
          );
        })}
      </ol>

      {next.length > 0 && (
        <section>
          <h2 className="mb-2 font-party text-2xl">Play another</h2>
          <div className="flex flex-col gap-2">
            {next.map((g) => (
              <Link key={g.id} href={`/games/${g.id}`} className="party-pill w-full bg-party-yellow text-party-ink">
                {g.name}
              </Link>
            ))}
          </div>
        </section>
      )}
      <Link href="/invite" className="mx-auto text-sm font-semibold underline underline-offset-4">
        Back to the invite
      </Link>
    </div>
  );
}
