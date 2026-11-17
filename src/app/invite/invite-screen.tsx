"use client";

import { ArrowRight, CalendarPlus, Check, Copy, KeyRound, MapPin, PencilLine, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button, cx, Logo } from "@/components/ui";
import { useNow } from "@/lib/client/hooks";
import { EVENT } from "@/lib/event";
import { RSVP_OPTIONS } from "@/lib/invite/config";
import { inviteApi } from "@/lib/invite/client/api";
import { calendarFile } from "@/lib/invite/client/media";
import type { GuestView } from "@/lib/invite/types";
import { InviteForm } from "./invite-form";

const TOKEN_KEY = "bf.invite.token";

type View =
  | { kind: "loading" }
  | { kind: "landing"; returning: GuestView | null }
  | { kind: "form"; existing: GuestView | null }
  | { kind: "done"; submission: GuestView; token: string; warnings: string[] }
  | { kind: "withdrawn" }
  | { kind: "error"; message: string };

const readToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};
const writeToken = (t: string | null) => {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
};

export function InviteScreen() {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [token, setToken] = useState<string | null>(null);

  // A private edit link looks like /invite#edit=<token>. The token lives in the
  // URL fragment, which browsers never send to servers or in Referer headers.
  const loadReturning = useCallback(async () => {
    const fromHash = /(?:^#|&)edit=([A-Za-z0-9_-]{32})/.exec(window.location.hash)?.[1] ?? null;
    if (fromHash) {
      writeToken(fromHash);
      history.replaceState(null, "", window.location.pathname);
    }
    const t = fromHash ?? readToken();
    if (!t) return setView({ kind: "landing", returning: null });
    const r = await inviteApi.mine(t);
    if (r.ok) {
      setToken(t);
      setView(fromHash ? { kind: "form", existing: r.submission } : { kind: "landing", returning: r.submission });
    } else if (r.status === 404 || r.status === 401) {
      writeToken(null);
      setView(fromHash ? { kind: "error", message: "That edit link doesn't match any RSVP. It may have been withdrawn." } : { kind: "landing", returning: null });
    } else setView({ kind: "error", message: r.error });
  }, []);

  useEffect(() => {
    const id = setTimeout(() => void loadReturning(), 0);
    return () => clearTimeout(id);
  }, [loadReturning]);

  return (
    <main className="stage flex flex-1 flex-col items-center px-4 py-8 sm:py-14">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        {view.kind === "loading" && <p className="m-auto py-24 text-haze" role="status">Opening your case file…</p>}
        {view.kind === "error" && (
          <section className="panel p-6 text-center" role="alert">
            <h1 className="font-display text-2xl font-extrabold">Hmm, that didn&apos;t work</h1>
            <p className="mt-2 text-haze">{view.message}</p>
            <Button className="mt-5" onClick={() => setView({ kind: "landing", returning: null })}>
              Back to the invitation
            </Button>
          </section>
        )}
        {view.kind === "landing" && (
          <Landing
            returning={view.returning}
            onStart={() => setView({ kind: "form", existing: view.returning })}
          />
        )}
        {view.kind === "form" && (
          <InviteForm
            existing={view.existing}
            token={token}
            onCancel={() => setView({ kind: "landing", returning: view.existing })}
            onDone={(submission, newToken, warnings) => {
              writeToken(newToken);
              setToken(newToken);
              setView({ kind: "done", submission, token: newToken, warnings });
            }}
            onWithdrawn={() => {
              writeToken(null);
              setToken(null);
              setView({ kind: "withdrawn" });
            }}
          />
        )}
        {view.kind === "done" && <Done submission={view.submission} token={view.token} warnings={view.warnings} onEdit={() => setView({ kind: "form", existing: view.submission })} />}
        {view.kind === "withdrawn" && (
          <section className="panel p-6 text-center" role="status">
            <h1 className="font-display text-2xl font-extrabold">Withdrawn</h1>
            <p className="mt-2 text-haze">Your RSVP, answers, photo and video have been deleted. You can always RSVP again.</p>
            <Button className="mt-5" onClick={() => setView({ kind: "landing", returning: null })}>
              Back to the invitation
            </Button>
          </section>
        )}
      </div>
    </main>
  );
}

function Countdown() {
  const now = useNow(1000);
  const ms = now === null ? null : Math.max(0, new Date(EVENT.startsAt).getTime() - now);
  const parts = [
    { label: "days", value: ms === null ? null : Math.floor(ms / 86_400_000) },
    { label: "hours", value: ms === null ? null : Math.floor(ms / 3_600_000) % 24 },
    { label: "mins", value: ms === null ? null : Math.floor(ms / 60_000) % 60 },
    { label: "secs", value: ms === null ? null : Math.floor(ms / 1000) % 60 },
  ];
  return (
    <section aria-label="Countdown to the party" className="grid grid-cols-4 gap-2 sm:gap-3">
      {parts.map((p) => (
        <div key={p.label} className="panel py-3 text-center sm:py-4">
          <div className="font-mono text-2xl font-bold tabular-nums text-gold sm:text-4xl" aria-hidden={p.value === null}>
            {p.value === null ? "––" : String(p.value).padStart(2, "0")}
          </div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.25em] text-haze">{p.label}</div>
        </div>
      ))}
    </section>
  );
}

function Landing({ returning, onStart }: { returning: GuestView | null; onStart: () => void }) {
  const rsvpLabel = returning ? RSVP_OPTIONS.find((o) => o.id === returning.data.rsvp)?.label : null;
  return (
    <>
      <article className="file-card relative overflow-hidden p-6 sm:p-10">
        <div className="absolute right-4 top-5 text-stamp sm:right-8 sm:top-8">
          <span className="stamp text-[11px] sm:text-sm">Top secret</span>
        </div>
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-ink-600">Case no. 21-11-2026</p>
        <h1 className="mt-6 font-display text-[2.4rem] font-extrabold leading-[1.02] sm:text-6xl">
          {EVENT.guestOfHonour} turns <span className="text-gold-deep">{EVENT.age}</span>.
          <br />
          You&apos;re summoned.
        </h1>
        <p className="mt-4 max-w-prose text-base text-ink-700 sm:text-lg">
          Join us for <strong>{EVENT.title}</strong>: an evening of games, guesses and gentle character assassination in {EVENT.guestOfHonour}&apos;s honour. Your
          evidence is required.
        </p>
        <dl className="mt-7 grid gap-4 border-t border-dashed border-ink-900/25 pt-5 sm:grid-cols-3">
          {[
            ["When", EVENT.dateLabel],
            ["Time", EVENT.timeLabel],
            ["Where", EVENT.venueLabel],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="font-mono text-[11px] uppercase tracking-[0.25em] text-ink-600">{k}</dt>
              <dd className="mt-1 font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      </article>

      <Countdown />

      {returning ? (
        <section className="panel flex flex-col gap-4 p-6">
          <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.25em] text-go">
            <Check className="size-4" aria-hidden /> RSVP received
          </div>
          <h2 className="font-display text-2xl font-extrabold">Welcome back, {returning.data.name}</h2>
          <p className="text-haze">
            You said: <span className="text-cream">{rsvpLabel}</span>. Need to change something? You can edit your answers, photo or video until the party.
          </p>
          <Button variant="primary" className="min-h-12 text-base" onClick={onStart}>
            <PencilLine className="size-5" aria-hidden /> Edit my RSVP
          </Button>
        </section>
      ) : (
        <section className="panel flex flex-col gap-4 p-6">
          <h2 className="font-display text-2xl font-extrabold">Open your case file</h2>
          <p className="text-haze">RSVP, answer three quick questions about {EVENT.guestOfHonour}, and add a photo or short video if you like. Takes about three minutes.</p>
          <Button variant="primary" className="min-h-12 text-base" onClick={onStart}>
            RSVP now <ArrowRight className="size-5" aria-hidden />
          </Button>
          <p className="text-xs text-haze">Can&apos;t come? You can still take part from afar.</p>
        </section>
      )}

      <section className="panel p-6">
        <h2 className="font-display text-xl font-extrabold">What&apos;s in the file</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {EVENT.games.map((g, i) => (
            <li key={g.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-gold">File {String(i + 1).padStart(2, "0")}</div>
              <div className="mt-1 font-semibold">{g.name}</div>
              <p className="mt-1 text-sm text-haze">{g.blurb}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 flex items-center gap-2 text-sm text-haze">
          <Sparkles className="size-4 text-gold" aria-hidden /> And a very special host. That part stays classified until the night.
        </p>
      </section>

      <footer className="flex flex-col items-center gap-2 pb-4 text-center">
        <Logo size="sm" />
      </footer>
    </>
  );
}

function Done({ submission, token, warnings, onEdit }: { submission: GuestView; token: string; warnings: string[]; onEdit: () => void }) {
  const [copied, setCopied] = useState(false);
  const [link, setLink] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setLink(`${window.location.origin}/invite#edit=${token}`), 0);
    return () => clearTimeout(id);
  }, [token]);
  const attending = submission.data.rsvp === "yes" || submission.data.rsvp === "maybe";
  const headline =
    submission.data.rsvp === "yes"
      ? "You're on the guest list"
      : submission.data.rsvp === "maybe"
        ? "Noted: a definite maybe"
        : submission.data.rsvp === "remote"
          ? "You're part of the show"
          : "Thanks for letting us know";

  return (
    <section className="flex flex-col gap-5" aria-live="polite">
      <div className="file-card animate-pop p-6 text-center sm:p-8">
        <div className="stamp text-sm text-go">Filed</div>
        <h1 className="mt-5 font-display text-3xl font-extrabold sm:text-4xl">{headline}, {submission.data.name.split(" ")[0]}!</h1>
        <p className="mt-2 text-ink-700">
          {submission.data.rsvp === "no"
            ? `We'll pass your wishes to ${EVENT.guestOfHonour}.`
            : submission.data.rsvp === "remote"
              ? `Your evidence is safely in the file. We'll make sure you're part of the night.`
              : `Your evidence is safely in the file. See you on ${EVENT.dateLabel.split(" ").slice(0, 3).join(" ")}.`}
        </p>
        <ul className="mx-auto mt-4 flex max-w-sm flex-wrap justify-center gap-2 text-sm">
          <li className="rounded-full bg-ink-900/10 px-3 py-1">Answers ✓</li>
          {submission.photo && <li className="rounded-full bg-ink-900/10 px-3 py-1">Photo ✓</li>}
          {submission.video && <li className="rounded-full bg-ink-900/10 px-3 py-1">Video ✓</li>}
          <li className="rounded-full bg-ink-900/10 px-3 py-1">{submission.data.consent ? "OK to show at the party" : "Private: organiser only"}</li>
        </ul>
      </div>

      {warnings.length > 0 && (
        <div role="alert" className="rounded-xl border border-gold/50 bg-gold/10 p-4 text-sm">
          <p className="font-semibold text-gold">Your RSVP is saved, but:</p>
          <ul className="mt-1 list-disc pl-5 text-cream">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <p className="mt-2 text-haze">Use “Edit my RSVP” below to try again.</p>
        </div>
      )}

      <div className="panel flex flex-col gap-3 p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <KeyRound className="size-4 text-gold" aria-hidden /> Your private edit link
        </h2>
        <p className="text-sm text-haze">Keep this to change your answers later. Anyone with it can edit your RSVP, so don&apos;t share it. This device also remembers you.</p>
        <div className="flex gap-2">
          <input readOnly value={link} aria-label="Private edit link" className="input min-w-0 flex-1 font-mono !text-xs" onFocus={(e) => e.target.select()} />
          <Button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {}
            }}
          >
            {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>

      <div className={cx("grid gap-3", attending ? "sm:grid-cols-2" : "")}>
        {attending && (
          <Button
            className="min-h-12"
            onClick={() => {
              const url = URL.createObjectURL(calendarFile());
              const a = document.createElement("a");
              a.href = url;
              a.download = "mez-birthday.ics";
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            <CalendarPlus className="size-4" aria-hidden /> Add to calendar
          </Button>
        )}
        <Button className="min-h-12" onClick={onEdit}>
          <PencilLine className="size-4" aria-hidden /> Edit my RSVP
        </Button>
      </div>
      <p className="flex items-center justify-center gap-1.5 text-xs text-haze">
        <MapPin className="size-3.5" aria-hidden /> {EVENT.venueLabel}. We&apos;ll share details closer to the day.
      </p>
    </section>
  );
}
