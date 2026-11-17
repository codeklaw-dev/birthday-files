"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "@/components/ui";
import { useNow } from "@/lib/client/hooks";
import { PRIZES, WHEEL_RULES, type PrizeId } from "@/lib/games/config";
import type { BoardRow } from "@/lib/games/types";
import type { SfxKind } from "@/lib/host/types";

/**
 * Reusable pieces for TV scenes: transitions, timers, reveal cards, vote bars,
 * verdict stamps, the prize wheel and leaderboards. All respect reduced motion
 * (globals.css shortens every animation).
 */

/** Remounts and animates in whenever `sceneKey` changes. */
export function Scene({ sceneKey, variant = "rise", className, children }: { sceneKey: string; variant?: "rise" | "curtain"; className?: string; children: ReactNode }) {
  return (
    <div key={sceneKey} className={cx("flex min-h-0 flex-1 flex-col", variant === "curtain" ? "animate-curtain" : "animate-scene", className)}>
      {children}
    </div>
  );
}

export function GameTitle({ name, step, progress }: { name: string; step: string; progress?: string }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <div className="flex items-baseline gap-4">
        <span className="font-display text-2xl font-extrabold text-gold lg:text-3xl">{name}</span>
        <span className="font-mono text-sm uppercase tracking-[0.3em] text-haze">{step}</span>
      </div>
      {progress && <span className="font-mono text-lg text-haze">{progress}</span>}
    </div>
  );
}

/** Seconds left on a server deadline, corrected for clock skew. */
export function useCountdown(endsAt: number | null, clockOffset: number) {
  const now = useNow(200);
  if (endsAt === null || now === null) return null;
  return Math.max(0, Math.ceil((endsAt - (now + clockOffset)) / 1000));
}

export function TimerRing({ endsAt, totalMs, clockOffset, size = 112 }: { endsAt: number | null; totalMs: number; clockOffset: number; size?: number }) {
  const now = useNow(100);
  if (endsAt === null || now === null) return null;
  const leftMs = Math.max(0, endsAt - (now + clockOffset));
  const frac = Math.min(1, leftMs / totalMs);
  const secs = Math.ceil(leftMs / 1000);
  const r = 44;
  const circ = 2 * Math.PI * r;
  const urgent = secs <= 5;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }} role="timer" aria-label={`${secs} seconds left`}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgb(255 255 255 / 0.1)" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={urgent ? "var(--color-stamp)" : "var(--color-gold)"}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - frac)}
          style={{ transition: "stroke-dashoffset 0.1s linear" }}
        />
      </svg>
      <span className={cx("font-mono font-bold tabular-nums", urgent ? "text-stamp" : "text-gold")} style={{ fontSize: size * 0.34 }}>
        {secs}
      </span>
    </div>
  );
}

export function Counter({ label, value, of }: { label: string; value: number; of: number }) {
  return (
    <div className="text-right">
      <div className="font-mono text-3xl font-bold tabular-nums">
        {value}
        <span className="text-haze">/{of}</span>
      </div>
      <div className="font-mono text-xs uppercase tracking-[0.25em] text-haze">{label}</div>
    </div>
  );
}

export function VoteBars({ items, highlight }: { items: { id: string; label: string; value: number }[]; highlight?: string[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="flex flex-col gap-3">
      {items.map((it, i) => (
        <li key={it.id} className="flex items-center gap-4 text-2xl">
          <span className={cx("w-56 truncate font-semibold", highlight?.includes(it.id) && "text-gold")}>{it.label}</span>
          <div className="h-9 flex-1 overflow-hidden rounded-full bg-white/10">
            <div
              className={cx("h-full rounded-full transition-[width] duration-1000 ease-out", highlight?.includes(it.id) ? "bg-gold" : "bg-tile-b")}
              style={{ width: `${(it.value / max) * 100}%`, transitionDelay: `${i * 120}ms` }}
            />
          </div>
          <span className="w-10 text-right font-mono font-bold tabular-nums">{it.value}</span>
        </li>
      ))}
    </ul>
  );
}

export function Stamp({ text, tone }: { text: string; tone: "stamp" | "go" | "gold" }) {
  return (
    <div className={cx("stamp animate-stamp bg-ink-950/60 px-6 py-2 font-display text-6xl lg:text-8xl", { stamp: "text-stamp", go: "text-go", gold: "text-gold" }[tone])}>
      {text}
    </div>
  );
}

/** Card that flips in when revealed. */
export function RevealCard({ revealed, front, back, className }: { revealed: boolean; front: ReactNode; back: ReactNode; className?: string }) {
  return <div className={cx("[perspective:900px]", className)}>{revealed ? <div className="animate-flip">{back}</div> : front}</div>;
}

const WHEEL_COLORS = ["#ff5470", "#4d9dff", "#f6c453", "#3ddc97", "#b388ff", "#ff9f43", "#5ee7ff"];

/**
 * The prize wheel. The server has already drawn the result; this only animates
 * to it, so the screen can never influence the outcome.
 */
export function PrizeWheel({ segments, landOn, spinId, onSettled }: { segments: PrizeId[]; landOn: number | null; spinId: string | null; onSettled?: () => void }) {
  const [angle, setAngle] = useState(0);
  const lastSpin = useRef<string | null>(null);
  const settledRef = useRef(onSettled);
  useEffect(() => {
    settledRef.current = onSettled;
  }, [onSettled]);
  const seg = 360 / Math.max(1, segments.length);
  useEffect(() => {
    if (!spinId || landOn === null || lastSpin.current === spinId) return;
    lastSpin.current = spinId;
    // Land the chosen segment's centre under the pointer at the top, after several full turns.
    // (Started once per spin; re-renders must not cancel it.)
    const target = 360 * 6 + (360 - (landOn * seg + seg / 2));
    requestAnimationFrame(() => setAngle((a) => a - (a % 360) + 360 + target));
    setTimeout(() => settledRef.current?.(), WHEEL_RULES.spinMs);
  }, [spinId, landOn, seg]);

  const r = 48;
  const arc = (i: number) => {
    const a0 = ((i * seg - 90) * Math.PI) / 180;
    const a1 = (((i + 1) * seg - 90) * Math.PI) / 180;
    const large = seg > 180 ? 1 : 0;
    return `M50 50 L${50 + r * Math.cos(a0)} ${50 + r * Math.sin(a0)} A${r} ${r} 0 ${large} 1 ${50 + r * Math.cos(a1)} ${50 + r * Math.sin(a1)} Z`;
  };
  return (
    <div className="relative aspect-square w-full max-w-[min(62vh,40rem)]">
      <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1 text-5xl text-cream drop-shadow-lg" aria-hidden>
        ▼
      </div>
      <svg
        viewBox="0 0 100 100"
        className="size-full drop-shadow-[0_20px_40px_rgb(0_0_0/0.6)]"
        style={{ transform: `rotate(${angle}deg)`, transition: `transform ${WHEEL_RULES.spinMs}ms cubic-bezier(0.12, 0.7, 0.08, 1)` }}
        role="img"
        aria-label={`Prize wheel with ${segments.length} prizes`}
      >
        {segments.map((id, i) => {
          const mid = ((i + 0.5) * seg - 90) * (Math.PI / 180);
          const p = PRIZES.find((x) => x.id === id)!;
          return (
            <g key={`${id}-${i}`}>
              <path d={arc(i)} fill={WHEEL_COLORS[i % WHEEL_COLORS.length]} stroke="#0a0818" strokeWidth="0.6" />
              <text
                x={50 + 30 * Math.cos(mid)}
                y={50 + 30 * Math.sin(mid)}
                fill="#0a0818"
                fontSize="4.6"
                fontWeight="800"
                textAnchor="middle"
                dominantBaseline="middle"
                transform={`rotate(${(i + 0.5) * seg}, ${50 + 30 * Math.cos(mid)}, ${50 + 30 * Math.sin(mid)})`}
              >
                {p.short}
              </text>
            </g>
          );
        })}
        <circle cx="50" cy="50" r="7" fill="#0a0818" stroke="#f6c453" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

export function BoardColumn({ title, subtitle, rows, empty, limit = 8 }: { title: string; subtitle: string; rows: BoardRow[]; empty: string; limit?: number }) {
  return (
    <section className="panel flex min-h-0 flex-col p-6">
      <h2 className="font-display text-3xl font-extrabold text-gold lg:text-4xl">{title}</h2>
      <p className="mb-4 text-lg text-haze">{subtitle}</p>
      {rows.length === 0 || rows.every((r) => r.total === 0) ? (
        <p className="m-auto text-xl text-haze">{empty}</p>
      ) : (
        <ol className="flex flex-col gap-2.5">
          {rows.slice(0, limit).map((r, i) => (
            <li
              key={`${r.subject.kind}:${r.subject.id}`}
              style={{ animationDelay: `${i * 70}ms` }}
              className={cx("flex animate-rise items-center gap-3 rounded-xl border px-4 py-2.5 text-2xl", r.rank === 1 ? "border-gold/60 bg-gold/15" : "border-white/10 bg-white/5")}
            >
              <span className={cx("w-9 font-mono font-bold tabular-nums", r.rank === 1 ? "text-gold" : "text-haze")}>{r.rank}</span>
              <span className="min-w-0 flex-1 truncate font-semibold">{r.subject.name}</span>
              {r.remote && <span className="rounded-full bg-tile-b/20 px-2 py-0.5 text-sm text-tile-b">remote</span>}
              <span className="font-mono font-bold tabular-nums">{r.total}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Sound for a game moment, keyed by "<game>:<step>". */
export function stepSfx(key: string): SfxKind | null {
  if (/:(reveal|verdict|revealed)$/.test(key)) return "drumroll";
  if (/:(vote|guess|clues|defence)$/.test(key)) return "whoosh";
  if (/:(scored)$/.test(key)) return "ding";
  return "whoosh";
}
