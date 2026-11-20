"use client";

import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { Balloons, Streamers, WishComposer } from "@/components/party";
import { cx } from "@/components/ui";
import { useNow, useStored } from "@/lib/client/hooks";
import { EVENT } from "@/lib/event";
import courtroom from "@/assets/party/courtroom.png";
import detectiveBrain from "@/assets/party/detective-brain.png";
import discoBall from "@/assets/party/disco-ball.png";
import logo from "@/assets/party/logo.png";
import mezPhoto from "@/assets/party/mez-cake-photo.png";
import mysteryBox from "@/assets/party/mystery-box.png";
import opinionBubble from "@/assets/party/opinion-bubble.png";
import partyPopper from "@/assets/party/party-popper.png";

const GAME_ART: Record<string, { src: StaticImageData; alt: string }> = {
  imposter: { src: detectiveBrain, alt: "A detective brain with a magnifying glass" },
  trial: { src: courtroom, alt: "A judge's bench with a gavel and scales" },
  survey: { src: opinionBubble, alt: "A speech bubble that says Your opinion matters" },
  mystery: { src: mysteryBox, alt: "An open box with a question mark" },
};

const RSVP = {
  there: { label: "I'll be there", reply: "See you at the party, detective!", tone: "bg-party-green text-white" },
  virtual: { label: "Virtual trooper", reply: "We'll save you a seat on the stream. Play along from anywhere.", tone: "bg-party-sky text-party-ink" },
} as const;
type RsvpChoice = keyof typeof RSVP;

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
  return (
    <main className="flex flex-1 flex-col overflow-x-hidden bg-white text-party-ink">
      <Hero />
      <Summons />
    </main>
  );
}

function Hero() {
  return (
    <section className="party-light relative px-4 pt-4">
      <Streamers className="absolute inset-x-0 top-24 h-72 w-full" />

      <div className="relative mx-auto flex max-w-md flex-col items-center">
        <Image src={discoBall} alt="" preload className="w-36 origin-top animate-sway sm:w-44" sizes="176px" />
        <Balloons className="absolute left-0 top-24 w-24 animate-float sm:-left-6 sm:w-28" />

        <p className="mt-2 rounded-full bg-party-purple/10 px-4 py-1 font-mono text-xs font-semibold uppercase tracking-[0.25em] text-party-purple">
          You&apos;re invited
        </p>
        <h1 className="font-party text-[5.5rem] leading-[0.95] text-party-purple drop-shadow-[0_3px_0_rgb(255_201_60/0.9)] sm:text-[7rem]">
          {EVENT.guestOfHonour}
        </h1>
        <p className="mt-1 text-center font-semibold">{EVENT.dateLabel}</p>

        <Image
          src={mezPhoto}
          alt={`Little ${EVENT.guestOfHonour} cutting a Happy Birthday cake`}
          preload
          sizes="224px"
          className="relative z-10 mt-4 -mb-8 w-48 drop-shadow-[0_10px_14px_rgb(43_18_51/0.3)] sm:w-56"
        />
      </div>

      <div className="relative mx-auto flex max-w-sm flex-col items-center rounded-t-[2.25rem] bg-party-yellow px-5 pb-40 pt-14">
        <Countdown />
        <div className="mt-8 w-full">
          <WishComposer onSubmit={submitMessage} />
        </div>

        <Balloons className="absolute -left-4 bottom-0 w-28" />
        <Image src={partyPopper} alt="" className="absolute -right-2 bottom-2 w-32" sizes="128px" />
      </div>
    </section>
  );
}

function Countdown() {
  const now = useNow(1000);
  const ms = now === null ? null : Math.max(0, new Date(EVENT.startsAt).getTime() - now);
  const parts = [
    { label: "days", value: ms === null ? null : Math.floor(ms / 86_400_000) },
    { label: "hrs", value: ms === null ? null : Math.floor(ms / 3_600_000) % 24 },
    { label: "min", value: ms === null ? null : Math.floor(ms / 60_000) % 60 },
    { label: "sec", value: ms === null ? null : Math.floor(ms / 1000) % 60 },
  ];

  return (
    <section
      aria-label="Countdown to the party"
      className="grid size-64 place-items-center rounded-full bg-party-lilac shadow-[inset_0_-10px_0_rgb(158_72_170/0.18),0_12px_24px_-12px_rgb(94_31_107/0.5)]"
    >
      {ms === 0 ? (
        <p className="px-8 text-center font-party text-3xl text-party-plum">It&apos;s party time!</p>
      ) : (
        <div className="text-center">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.3em] text-party-plum">Party starts in</p>
          <div className="mt-2 flex items-start justify-center gap-1.5">
            {parts.map((p, i) => (
              <div key={p.label} className="flex items-start gap-1.5">
                {i > 0 && <span aria-hidden className="font-party text-2xl text-party-plum/50">:</span>}
                <div className="w-11">
                  <div className="font-party text-[2rem] leading-none tabular-nums text-party-ink">
                    {p.value === null ? "––" : String(p.value).padStart(2, "0")}
                  </div>
                  <div className="mt-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-party-plum">{p.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Summons() {
  const [stored, setStored] = useStored("local", "bf.rsvp");
  const rsvp = stored === "there" || stored === "virtual" ? (stored as RsvpChoice) : null;

  return (
    <section className="party-stage px-4 pb-14 pt-12 text-center">
      <div className="mx-auto flex max-w-md flex-col items-center">
        <h2 className="font-party text-4xl leading-tight sm:text-5xl">
          You have been <br /> Summoned
        </h2>
        <Image src={logo} alt={EVENT.title} sizes="256px" className="mt-6 w-60 -rotate-3 drop-shadow-[0_14px_18px_rgb(0_0_0/0.35)]" />
        <p className="mt-6 text-lg">
          A live game show about {EVENT.guestOfHonour}, hosted by Casper and played from your phone. Bring your memories, your
          best guesses and your worst-kept secrets.
        </p>

        <h3 className="mt-8 font-semibold">Will you make it?</h3>
        <div className="mt-3 flex flex-wrap justify-center gap-3">
          {(Object.keys(RSVP) as RsvpChoice[]).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={rsvp === k}
              onClick={() => setStored(k)}
              className={cx(
                "party-pill",
                RSVP[k].tone,
                rsvp === k && "ring-4 ring-white",
                rsvp && rsvp !== k && "opacity-60",
              )}
            >
              {RSVP[k].label}
            </button>
          ))}
        </div>
        <p aria-live="polite" className="mt-3 min-h-6 font-semibold">
          {rsvp && RSVP[rsvp].reply}
        </p>

        {rsvp ? <Games /> : <p className="mt-6 text-white/85">Answer to unlock tonight&apos;s games.</p>}

        <div className="mt-14 font-party text-5xl leading-tight">
          See you <br /> soon
        </div>
        <div className="mt-6 font-party text-4xl leading-tight text-party-yellow">Thank you</div>

        <Link href="/play" className="party-pill mt-10 bg-party-yellow text-party-ink">
          At the party? Join the game
        </Link>
      </div>
    </section>
  );
}

function Games() {
  return (
    <div className="mt-10 w-full">
      <h3 className="font-party text-3xl">Tonight&apos;s Games</h3>
      <ul className="mt-6 grid gap-5 sm:grid-cols-2">
        {EVENT.games.map((g, i) => {
          const art = GAME_ART[g.id];
          return (
            <li
              key={g.id}
              style={{ animationDelay: `${i * 120}ms` }}
              className="flex animate-rise flex-col items-center rounded-[1.75rem] bg-white/12 px-5 pb-6 pt-5 ring-1 ring-white/25"
            >
              {art && <Image src={art.src} alt={art.alt} sizes="160px" className="h-36 w-auto object-contain" />}
              <h4 className="mt-3 font-party text-2xl">{g.name}</h4>
              <p className="mt-1 text-white/90">{g.blurb}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
