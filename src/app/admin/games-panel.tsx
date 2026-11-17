"use client";

import QRCode from "qrcode";
import { Clock, Copy, Crown, FastForward, Gift, ListOrdered, Play, RefreshCw, Settings2, Square, Trophy } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button, cx } from "@/components/ui";
import type { RoomView } from "@/lib/game/types";
import type { GamesHostAction } from "@/lib/games/actions";
import { PRIZES, WHEEL_RULES } from "@/lib/games/config";
import type { GameId, LedgerEntry } from "@/lib/games/types";

type Act = (a: GamesHostAction | { type: string; [k: string]: unknown }) => Promise<void>;

const GAMES: { id: GameId; name: string; who: string }[] = [
  { id: "imposter", name: "Mez Imposter", who: "Phones · secret roles" },
  { id: "wkmb", name: "Who Knows Mez Best", who: "Invite answers · Mez judges" },
  { id: "survey", name: "Mez Survey", who: "Approved boards · phones guess" },
  { id: "trial", name: "Mez on Trial", who: "Accusations · phones are the jury" },
  { id: "mystery", name: "Mystery Files", who: "Photos, videos, memories" },
];

export interface SetupData {
  eligibleCount: number;
  readiness: { imposter: { players: number }; wkmb: { answers: number }; survey: { boards: number }; trial: { cases: number }; mystery: { items: number } };
  contributors: { id: string; name: string; remote: boolean }[];
}

function readinessText(id: GameId, s: SetupData | null, players: number): { ready: boolean; text: string } {
  if (!s) return { ready: id === "imposter" && players >= 3, text: "…" };
  switch (id) {
    case "imposter":
      return { ready: players >= 3, text: `${players} players on phones${players < 3 ? " (need 3)" : ""}` };
    case "wkmb":
      return { ready: s.readiness.wkmb.answers > 0, text: `${s.readiness.wkmb.answers} approved answers` };
    case "survey":
      return { ready: s.readiness.survey.boards > 0, text: `${s.readiness.survey.boards} approved boards` };
    case "trial":
      return { ready: s.readiness.trial.cases > 0, text: `${s.readiness.trial.cases} accusations` };
    case "mystery":
      return { ready: s.readiness.mystery.items > 0, text: `${s.readiness.mystery.items} exhibits` };
  }
}

function Card({ title, icon, aside, children }: { title: string; icon?: React.ReactNode; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="panel p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.25em] text-gold">
          {icon}
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function useSetup(hostKey: string) {
  const [setup, setSetup] = useState<SetupData | null>(null);
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/games/setup", { headers: { "x-host-key": hostKey } });
      if (res.ok) setSetup(await res.json());
    } catch {}
  }, [hostKey]);
  useEffect(() => {
    const first = setTimeout(load, 0);
    const id = setInterval(load, 20_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [load]);
  return { setup, reload: load };
}

export function GamesControl({ view, act, setup }: { view: RoomView; act: Act; setup: SetupData | null }) {
  const g = view.games.game;
  const label = view.games.advanceLabel;
  return (
    <Card title="Games" icon={<Play className="size-4" aria-hidden />} aside={<a href="/admin/games" className="inline-flex items-center gap-1 text-xs text-gold hover:underline"><Settings2 className="size-3.5" aria-hidden /> Setup & points</a>}>
      {g ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-display text-xl font-extrabold">{GAMES.find((x) => x.id === g.id)?.name}</p>
              <p className="font-mono text-xs uppercase tracking-widest text-haze">
                step: {g.step}
                {"index" in g && ` · ${g.index + 1}/${g.total}`}
              </p>
            </div>
          </div>
          {label ? (
            <Button variant="primary" className="min-h-14 text-lg" onClick={() => act({ type: "host/game/advance" })}>
              <FastForward className="size-5" aria-hidden /> {label}
            </Button>
          ) : (
            <p className="rounded-xl border border-gold/40 bg-gold/10 p-3 text-center text-sm text-gold">Waiting for Mez to lock the scores on the judge phone.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {g.stepEndsAt !== null && (
              <>
                <Button onClick={() => act({ type: "host/game/extend", seconds: 15 })}>
                  <Clock className="size-4" aria-hidden /> +15 s
                </Button>
                <Button onClick={() => act({ type: "host/game/endTimer" })}>End timer now</Button>
              </>
            )}
            {g.id === "survey" && g.step === "reveal" && <Button onClick={() => act({ type: "host/game/reveal" })}>Reveal next answer</Button>}
            <Button
              variant="danger"
              onClick={() => {
                if (window.confirm("Stop this game? Points already awarded stay.")) void act({ type: "host/game/abort" });
              }}
            >
              <Square className="size-4" aria-hidden /> Stop game
            </Button>
          </div>
          {g.id === "survey" && g.step === "reveal" && g.unmatched.length > 0 && g.fullBoard && (
            <div className="rounded-xl border border-white/10 p-3">
              <p className="mb-2 text-xs uppercase tracking-widest text-haze">Guesses not matched: accept one as a board answer?</p>
              <ul className="flex flex-col gap-2">
                {g.unmatched.map((u) => (
                  <li key={u.playerId} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1">
                      <strong>{u.name}</strong>: “{u.guess}”
                    </span>
                    <select
                      className="input !w-auto !py-1 text-sm"
                      defaultValue=""
                      aria-label={`Accept ${u.name}'s guess as`}
                      onChange={(e) => {
                        if (e.target.value !== "" && window.confirm(`Count “${u.guess}” as “${g.fullBoard![Number(e.target.value)].label}”? This is logged.`)) {
                          void act({ type: "host/game/accept", playerId: u.playerId, answerIndex: Number(e.target.value) });
                        }
                      }}
                    >
                      <option value="">Accept as…</option>
                      {g.fullBoard!.map((a, i) => (
                        <option key={i} value={i}>
                          {a.label} ({a.count})
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {GAMES.map((x) => {
            const r = readinessText(x.id, setup, view.players.length);
            return (
              <li key={x.id} className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
                <div>
                  <p className="font-semibold">{x.name}</p>
                  <p className="text-xs text-haze">{x.who}</p>
                  <p className={cx("mt-1 font-mono text-xs", r.ready ? "text-go" : "text-gold")}>{r.text}</p>
                </div>
                <Button variant={r.ready ? "primary" : "ghost"} disabled={!r.ready || view.phase === "question"} onClick={() => act({ type: "host/game/start", game: x.id })}>
                  <Play className="size-4" aria-hidden /> Start
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4">
        <Button disabled={!!g} onClick={() => act({ type: "host/showBoards" })}>
          <Trophy className="size-4" aria-hidden /> Show leaderboards
        </Button>
        <Button disabled={!!g} onClick={() => act({ type: "host/wheel/show" })}>
          <Gift className="size-4" aria-hidden /> Prize wheel
        </Button>
      </div>
    </Card>
  );
}

export function JudgeLink({ hostKey }: { hostKey: string }) {
  const [key, setKey] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [show, setShow] = useState(false);
  const load = useCallback(
    async (rotate = false) => {
      const res = await fetch("/api/room/judge", { method: rotate ? "POST" : "GET", headers: { "x-host-key": hostKey } });
      if (res.ok) setKey((await res.json()).key);
    },
    [hostKey],
  );
  useEffect(() => {
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [load]);
  const link = key && typeof window !== "undefined" ? `${window.location.origin}/judge#k=${key}` : "";
  useEffect(() => {
    if (!link || !show) return;
    QRCode.toDataURL(link, { margin: 1, width: 320 }).then(setQr).catch(() => setQr(null));
  }, [link, show]);
  return (
    <Card title="Mez's judge phone" icon={<Crown className="size-4" aria-hidden />}>
      <p className="text-sm text-haze">Open this link on Mez&apos;s phone (and nowhere else). It gives scoring and verdict controls.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => setShow((s) => !s)}>{show ? "Hide QR" : "Show QR"}</Button>
        <Button
          onClick={async () => {
            await navigator.clipboard.writeText(link).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          disabled={!link}
        >
          <Copy className="size-4" aria-hidden /> {copied ? "Copied" : "Copy link"}
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            if (window.confirm("Make a new judge link? The old one stops working immediately.")) void load(true).then(() => setShow(true));
          }}
        >
          <RefreshCw className="size-4" aria-hidden /> New link
        </Button>
      </div>
      {show && qr && (
        // eslint-disable-next-line @next/next/no-img-element -- generated data URL
        <img src={qr} alt="QR code for Mez's judge phone" className="mt-3 size-48 rounded-lg bg-cream p-2" />
      )}
    </Card>
  );
}

export function WheelControl({ view, act }: { view: RoomView; act: Act }) {
  const w = view.games.wheel;
  const cur = w.current;
  const prize = (id: string) => PRIZES.find((p) => p.id === id)?.label ?? id;
  return (
    <Card title="Prize wheel" icon={<Gift className="size-4" aria-hidden />} aside={<span className="font-mono text-xs text-haze">hugs {w.allowContact ? "allowed by Mez" : "off"}</span>}>
      <p className="mb-3 text-xs text-haze">
        Top {WHEEL_RULES.topN} on either board with points can spin, {WHEEL_RULES.maxSpinsPerPerson} spin each (declining doesn&apos;t use it up). Remote guests only get prizes that work from afar. The server draws the result.
      </p>
      {cur && cur.status === "offered" && (
        <div className="mb-3 rounded-xl border border-gold/40 bg-gold/10 p-3 text-sm">
          <p>
            <strong>{cur.recipient.name}</strong> won <strong>{prize(cur.prize)}</strong>, waiting for their answer
            {cur.recipient.kind === "player" ? " on their phone." : "."}
          </p>
          <div className="mt-2 flex gap-2">
            <Button onClick={() => act({ type: "host/wheel/respond", accept: true })}>Accepted</Button>
            <Button onClick={() => act({ type: "host/wheel/respond", accept: false })}>Declined</Button>
          </div>
          <p className="mt-1 text-xs text-haze">Record their answer here if they told you in person (logged).</p>
        </div>
      )}
      {w.eligible.length === 0 ? (
        <p className="text-sm text-haze">Nobody is eligible yet. Play a game first.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {w.eligible.map((e) => (
            <li key={`${e.kind}:${e.id}`} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">
                <strong>{e.name}</strong> <span className="text-haze">#{e.rank} {e.board === "live" ? "Live" : "Mez Expert"} · {e.total}</span>
                {e.remote && <span className="ml-1 text-tile-b">remote</span>}
              </span>
              <Button disabled={cur?.status === "offered"} onClick={() => act({ type: "host/wheel/spin", subject: { kind: e.kind, id: e.id } })}>
                Spin
              </Button>
            </li>
          ))}
        </ul>
      )}
      {w.history.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-haze">Spin history ({w.history.length})</summary>
          <ul className="mt-2 flex flex-col gap-1 font-mono text-xs">
            {[...w.history].reverse().map((h) => (
              <li key={h.id}>
                {new Date(h.at).toLocaleTimeString()} · {h.recipient.name}: {prize(h.prize)} · {h.status} · draw {h.draw.toFixed(4)} → {h.index + 1}/{h.segments.length}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

const RULE_LABEL = (rule: string) => (rule === "correction" ? "correction" : rule === "judge-bonus" ? "judge's bonus" : rule);

export function ScoresPanel({ view, act, setup }: { view: RoomView; act: Act; setup: SetupData | null }) {
  const [board, setBoard] = useState<"live" | "expert">("live");
  const [who, setWho] = useState("");
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [correcting, setCorrecting] = useState<LedgerEntry | null>(null);
  const rows = view.games.boards[board];
  const people =
    board === "live"
      ? view.players.map((p) => ({ key: p.id, kind: "player" as const, name: p.name }))
      : (setup?.contributors ?? []).map((c) => ({ key: c.id, kind: "contributor" as const, name: `${c.name}${c.remote ? " (remote)" : ""}` }));
  const history = [...view.games.ledger].reverse();

  return (
    <Card title="Scores" icon={<ListOrdered className="size-4" aria-hidden />}>
      <div role="tablist" className="mb-3 flex gap-1 rounded-xl border border-white/15 p-1">
        {(["live", "expert"] as const).map((b) => (
          <button key={b} role="tab" aria-selected={board === b} onClick={() => setBoard(b)} className={cx("min-h-9 flex-1 rounded-lg text-sm font-semibold", board === b ? "bg-gold text-ink-950" : "text-haze")}>
            {b === "live" ? "Live Games Champion" : "Mez Expert"}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-haze">No points yet.</p>
      ) : (
        <ol className="flex flex-col gap-1 text-sm">
          {rows.slice(0, 10).map((r) => (
            <li key={r.subject.id} className="flex gap-2">
              <span className="w-6 font-mono text-haze">{r.rank}</span>
              <span className="flex-1 truncate">
                {r.subject.name}
                {r.remote && <span className="ml-1 text-tile-b">remote</span>}
              </span>
              <span className="font-mono font-bold tabular-nums">{r.total}</span>
            </li>
          ))}
        </ol>
      )}

      <form
        className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const p = people.find((x) => x.key === who);
          if (!p) return;
          await act({ type: "host/correct", board, subject: { kind: p.kind, id: p.key, name: p.name }, delta: Number(delta), reason, ...(correcting ? { correctsId: correcting.id } : {}) });
          setDelta("");
          setReason("");
          setCorrecting(null);
        }}
      >
        <p className="text-xs uppercase tracking-widest text-haze">Correct a score {correcting && <span className="text-gold">(fixing entry: {correcting.note.slice(0, 30)})</span>}</p>
        <div className="flex gap-2">
          <select className="input min-w-0 flex-1" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Person">
            <option value="">Who?</option>
            {people.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name}
              </option>
            ))}
          </select>
          <input className="input !w-24" inputMode="numeric" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="±pts" aria-label="Points (negative to take away)" />
        </div>
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={120} placeholder="Reason (required, shown in the history)" aria-label="Reason" />
        <Button type="submit" disabled={!who || !Number(delta) || reason.trim().length < 3}>
          Add correction
        </Button>
        <p className="text-xs text-haze">Corrections never change past entries; they&apos;re added to the history.</p>
      </form>

      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-haze">Score history ({history.length})</summary>
        <ul className="mt-2 flex max-h-80 flex-col gap-1 overflow-y-auto pr-1 font-mono text-xs">
          {history.map((e) => (
            <li key={e.id} className="flex items-start gap-2 rounded border border-white/5 px-2 py-1">
              <span className={cx("w-12 shrink-0 text-right font-bold", e.delta >= 0 ? "text-go" : "text-stamp")}>{e.delta > 0 ? `+${e.delta}` : e.delta}</span>
              <span className="min-w-0 flex-1">
                <strong className="text-cream">{e.subject.name}</strong> · {e.board === "live" ? "Live" : "Expert"} · {RULE_LABEL(e.rule)} · by {e.by}
                <span className="block truncate text-haze" title={e.note}>
                  {e.note}
                </span>
              </span>
              <button
                className="shrink-0 text-gold hover:underline"
                onClick={() => {
                  setBoard(e.board);
                  setWho(e.subject.id);
                  setDelta(String(-e.delta));
                  setReason("");
                  setCorrecting(e);
                }}
              >
                fix
              </button>
            </li>
          ))}
        </ul>
      </details>
      <details className="mt-2">
        <summary className="cursor-pointer text-sm text-haze">Event log ({view.games.audit.length})</summary>
        <ul className="mt-2 flex max-h-60 flex-col gap-1 overflow-y-auto font-mono text-xs text-haze">
          {[...view.games.audit].reverse().map((a) => (
            <li key={a.id}>
              {new Date(a.at).toLocaleTimeString()} · {a.by}: {a.text}
            </li>
          ))}
        </ul>
      </details>
    </Card>
  );
}
