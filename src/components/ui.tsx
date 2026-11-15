"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useState } from "react";
import type { ConnectionStatus } from "@/lib/client/use-room";
import type { Bilingual, Lang, Player } from "@/lib/game/types";
import { EVENT } from "@/lib/event";

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-gold text-ink-950 hover:bg-[#ffd573] shadow-[0_6px_0_0_var(--color-gold-deep)] active:translate-y-1 active:shadow-[0_2px_0_0_var(--color-gold-deep)]",
  ghost: "bg-white/5 text-cream border border-white/15 hover:bg-white/10 active:bg-white/15",
  danger: "bg-stamp/15 text-stamp border border-stamp/40 hover:bg-stamp/25",
};

export function Button({
  variant = "ghost",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition duration-150",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:active:translate-y-0",
        variants[variant],
        className,
      )}
    />
  );
}

export function Logo({ size = "md" }: { size?: "sm" | "md" | "xl" }) {
  const title = { sm: "text-xl", md: "text-4xl sm:text-5xl", xl: "text-6xl lg:text-8xl" }[size];
  const sub = { sm: "text-[10px]", md: "text-xs", xl: "text-base lg:text-xl" }[size];
  return (
    <div className="font-display leading-none">
      <div className={cx("gold-text font-extrabold tracking-tight", title)}>{EVENT.title}</div>
      <div className={cx("mt-1 font-mono font-medium uppercase tracking-[0.35em] text-stamp", sub)}>
        {EVENT.edition}
      </div>
    </div>
  );
}

export function StatusDot({ status }: { status: ConnectionStatus }) {
  const label = { live: "Live", connecting: "Connecting…", reconnecting: "Reconnecting…" }[status];
  return (
    <span role="status" className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-haze">
      <span className={cx("size-2 rounded-full", status === "live" ? "bg-go" : "animate-pulse bg-gold")} />
      {label}
    </span>
  );
}

/** Casper's line, in whichever language(s) the host picked. */
export function HostLine({ line, lang, big }: { line: Bilingual; lang: Lang | "both"; big?: boolean }) {
  const show: Lang[] = lang === "both" ? ["en", "bn"] : [lang];
  return (
    <div className="flex items-start gap-3" aria-live="polite">
      <div
        aria-hidden
        className={cx("grid shrink-0 place-items-center rounded-full bg-gold text-ink-950 font-display font-extrabold", big ? "size-14 text-2xl" : "size-9 text-base")}
      >
        C
      </div>
      <div className="min-w-0">
        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-gold">Casper · host</div>
        {show.map((l) => (
          <p
            key={l}
            lang={l}
            className={cx(
              l === "bn" && "font-bangla",
              big ? "text-xl lg:text-2xl" : "text-sm",
              l === "bn" && lang === "both" ? "text-haze" : "text-cream",
            )}
          >
            {line[l]}
          </p>
        ))}
      </div>
    </div>
  );
}

export function Leaderboard({
  players,
  meId,
  gains,
  limit,
  big,
}: {
  players: Player[];
  meId?: string;
  gains?: Record<string, number>;
  limit?: number;
  big?: boolean;
}) {
  const rows = limit ? players.slice(0, limit) : players;
  if (rows.length === 0) return <p className="text-haze">No players yet.</p>;
  return (
    <ol className={cx("flex flex-col", big ? "gap-3" : "gap-2")}>
      {rows.map((p, i) => (
        <li
          key={p.id}
          style={{ animationDelay: `${i * 60}ms` }}
          className={cx(
            "flex animate-rise items-center gap-3 rounded-xl border px-4",
            big ? "py-3 text-2xl lg:text-3xl" : "py-2 text-base",
            i === 0 ? "border-gold/60 bg-gold/15" : "border-white/10 bg-white/5",
            p.id === meId && "ring-2 ring-gold",
          )}
        >
          <span className={cx("w-8 font-mono font-bold tabular-nums", i === 0 ? "text-gold" : "text-haze")}>{i + 1}</span>
          <span aria-hidden>{p.avatar}</span>
          <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
          {gains?.[p.id] ? <span className="font-mono text-sm text-go">+{gains[p.id]}</span> : null}
          <span className="font-mono font-bold tabular-nums">{p.score}</span>
        </li>
      ))}
    </ol>
  );
}

export const TILE = [
  { bg: "bg-tile-a", glyph: "▲" },
  { bg: "bg-tile-b", glyph: "◆" },
  { bg: "bg-tile-c", glyph: "●" },
  { bg: "bg-tile-d", glyph: "■" },
] as const;

/** Guest message composer, shared by /play and /invite. */
export function MessageForm({
  defaultAuthor = "",
  onSubmit,
}: {
  defaultAuthor?: string;
  onSubmit: (author: string, text: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [author, setAuthor] = useState(defaultAuthor);
  const [text, setText] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "sending" | "sent" | "error"; error?: string }>({ kind: "idle" });
  const max = 280;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setState({ kind: "sending" });
        const res = await onSubmit(author, text);
        if (res.ok) {
          setText("");
          setState({ kind: "sent" });
        } else setState({ kind: "error", error: res.error });
      }}
    >
      <Field label="Your name">
        <input
          required
          maxLength={20}
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          autoComplete="given-name"
          className="input"
        />
      </Field>
      <Field label="Message for Mez" hint={`${text.length}/${max}`}>
        <textarea
          required
          rows={3}
          maxLength={max}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="A wish, a memory, an inside joke…"
          className="input resize-none"
        />
      </Field>
      <Button variant="primary" type="submit" disabled={state.kind === "sending"}>
        {state.kind === "sending" ? "Sending…" : "Send to the files"}
      </Button>
      <p aria-live="polite" className="min-h-5 text-sm">
        {state.kind === "sent" && <span className="text-go">Filed! It appears on the big screen once the host approves it.</span>}
        {state.kind === "error" && <span className="text-stamp">{state.error}</span>}
      </p>
    </form>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="flex justify-between font-medium text-haze">
        {label}
        {hint && <span className="font-mono text-xs tabular-nums">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
