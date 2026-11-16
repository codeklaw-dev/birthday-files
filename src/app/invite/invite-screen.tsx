"use client";

import Link from "next/link";
import { Logo, MessageForm } from "@/components/ui";
import { useNow } from "@/lib/client/hooks";
import { EVENT } from "@/lib/event";

async function submitMessage(author: string, text: string) {
  try {
    const res = await fetch("/api/room/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "submitMessage", author, text }),
    });
    const body = await res.json().catch(() => ({}));
    return res.ok ? { ok: true } : { ok: false, error: body.error ?? "Something went wrong." };
  } catch {
    return { ok: false, error: "Can't reach the server. Try again in a moment." };
  }
}

export function InviteScreen() {
  const now = useNow(1000);
  const ms = now === null ? null : Math.max(0, new Date(EVENT.startsAt).getTime() - now);
  const parts =
    ms === null
      ? null
      : [
          { label: "days", value: Math.floor(ms / 86_400_000) },
          { label: "hours", value: Math.floor(ms / 3_600_000) % 24 },
          { label: "mins", value: Math.floor(ms / 60_000) % 60 },
          { label: "secs", value: Math.floor(ms / 1000) % 60 },
        ];

  return (
    <main className="stage flex flex-1 flex-col items-center px-4 py-10 sm:py-16">
      <div className="flex w-full max-w-2xl flex-col gap-8">
        <article className="file-card relative overflow-hidden p-6 sm:p-10">
          <div className="absolute right-5 top-6 text-stamp sm:right-8 sm:top-8">
            <span className="stamp text-xs sm:text-sm">Top secret</span>
          </div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-ink-600">Case no. 21-11-2026</p>
          <h1 className="mt-6 font-display text-4xl font-extrabold leading-[1.05] sm:text-6xl">
            You are summoned to <span className="text-gold-deep">{EVENT.title}</span>
          </h1>
          <p className="mt-4 max-w-prose text-lg text-ink-700">
            A live game show about {EVENT.guestOfHonour}, hosted by an AI detective, played from your phone. Bring your
            memories, your best guesses and your worst-kept secrets.
          </p>
          <dl className="mt-8 grid gap-4 border-t border-dashed border-ink-900/25 pt-6 sm:grid-cols-3">
            {[
              ["Subject", EVENT.guestOfHonour],
              ["Date", EVENT.dateLabel],
              ["Bring", "A charged phone"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="font-mono text-[11px] uppercase tracking-[0.25em] text-ink-600">{k}</dt>
                <dd className="mt-1 font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        </article>

        <section aria-label="Countdown" className="grid grid-cols-4 gap-3">
          {(parts ?? ["days", "hours", "mins", "secs"].map((label) => ({ label, value: null }))).map((p) => (
            <div key={p.label} className="panel py-4 text-center">
              <div className="font-mono text-3xl font-bold tabular-nums text-gold sm:text-5xl">
                {p.value === null ? "––" : String(p.value).padStart(2, "0")}
              </div>
              <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.25em] text-haze">{p.label}</div>
            </div>
          ))}
        </section>

        <section className="panel p-6 sm:p-8">
          <h2 className="font-display text-2xl font-extrabold">Tonight&apos;s case files</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {EVENT.games.map((g, i) => (
              <li key={g.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-gold">File {String(i + 1).padStart(2, "0")}</div>
                <div className="mt-1 font-semibold">{g.name}</div>
                <p className="mt-1 text-sm text-haze">{g.blurb}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel p-6 sm:p-8">
          <h2 className="font-display text-2xl font-extrabold">Leave a message for {EVENT.guestOfHonour}</h2>
          <p className="mb-5 mt-1 text-sm text-haze">
            It goes into the evidence locker and may be revealed on the big screen. Photo and video uploads arrive in a later milestone.
          </p>
          <MessageForm onSubmit={submitMessage} />
        </section>

        <footer className="flex flex-col items-center gap-4 pb-6 text-center">
          <Logo size="sm" />
          <Link href="/play" className="text-sm font-semibold text-gold underline underline-offset-4">
            At the party? Join the game
          </Link>
        </footer>
      </div>
    </main>
  );
}
