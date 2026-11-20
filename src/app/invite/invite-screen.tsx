"use client";

import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { useState } from "react";
import { PartyPopper, Sparkles, Wifi } from "lucide-react";
import { Balloons, ProfileForm, Streamers, WishWays, type Profile } from "@/components/party";
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

type Attendance = "party" | "virtual";

/** What this guest told us, remembered on their phone. */
function useGuest() {
  const [attendanceRaw, setAttendance] = useStored("local", "bf.attendance");
  const [profileRaw, setProfileRaw] = useStored("local", "bf.profile");
  const [wished, setWished] = useStored("local", "bf.wished");
  const attendance: Attendance | null = attendanceRaw === "party" || attendanceRaw === "virtual" ? attendanceRaw : null;
  let profile: Profile | null = null;
  try {
    const p = profileRaw ? JSON.parse(profileRaw) : null;
    if (p && typeof p.name === "string") profile = { name: p.name, photo: typeof p.photo === "string" ? p.photo : null };
  } catch {}
  return {
    attendance,
    setAttendance: (a: Attendance | null) => setAttendance(a),
    profile,
    setProfile: (p: Profile | null) => setProfileRaw(p ? JSON.stringify(p) : null),
    wished: wished === "1",
    setWished: () => setWished("1"),
  };
}

const scrollToGames = () => document.getElementById("games")?.scrollIntoView({ behavior: "smooth", block: "start" });

async function submitMessage(author: string, text: string, photo: string | null) {
  try {
    const res = await fetch("/api/room/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "submitMessage", author, text, photo }),
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
  // Shared with GuestFlow so the invitation's button can open the wish flow.
  const [flowOpen, setFlowOpen] = useState(false);
  const takePart = () => {
    setFlowOpen(true);
    setTimeout(() => document.getElementById("guest-flow")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

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
        <div className="mt-8 flex w-full flex-col items-center rounded-[1.75rem] bg-party-purple px-6 pb-6 pt-5 text-center text-white shadow-[0_8px_0_rgb(94_31_107/0.35)]">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.3em] text-party-yellow">Calling all detectives</p>
          <p className="mt-2 font-party text-2xl leading-tight">
            Take part in <span className="text-party-yellow">{EVENT.title}</span>!
          </p>
          <p className="mt-2 text-white/90">
            A live game show all about {EVENT.guestOfHonour}. Crack the clues, out-guess your friends and send a birthday wish. At the
            party or from afar, there&apos;s a seat for you.
          </p>
          <button type="button" onClick={takePart} className="party-pill mt-4 bg-party-yellow text-party-ink">
            <Sparkles aria-hidden className="size-5" />
            Count me in!
          </button>
        </div>
        <div id="guest-flow" className="mt-8 w-full scroll-mt-16">
          <GuestFlow open={flowOpen} setOpen={setFlowOpen} />
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

/** Send wish → "Will you be at the party?" → game flow, or profile + wish + games. */
function GuestFlow({ open, setOpen }: { open: boolean; setOpen: (v: boolean | ((o: boolean) => boolean)) => void }) {
  const guest = useGuest();
  const [editingProfile, setEditingProfile] = useState(false);
  const { attendance, profile } = guest;

  const changeAnswer = (
    <button
      type="button"
      onClick={() => {
        guest.setAttendance(null);
        setOpen(true);
      }}
      className="mx-auto mt-3 block text-sm font-semibold text-party-plum underline underline-offset-4"
    >
      Change my answer
    </button>
  );

  if (!attendance) {
    return (
      <div className="flex w-full flex-col items-center gap-3">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="attendance"
          onClick={() => setOpen((o) => !o)}
          className="party-pill bg-party-green text-white"
        >
          Send wish
        </button>
        {open && (
          <section id="attendance" aria-labelledby="attendance-q" className="party-card party-light w-full animate-rise p-5 text-center">
            <h3 id="attendance-q" className="font-party text-2xl text-party-purple">
              Will you be at the party?
            </h3>
            <p className="mt-1 text-sm text-party-ink/75">{EVENT.dateLabel}</p>
            <div className="mt-4 flex flex-col gap-3">
              <ChoiceButton
                tone="bg-party-green text-white"
                Icon={PartyPopper}
                title="I'll be there"
                body="I'm coming to the party and will play on my phone."
                onClick={() => guest.setAttendance("party")}
              />
              <ChoiceButton
                tone="bg-party-sky text-party-ink"
                Icon={Wifi}
                title="Virtual trooper"
                body="I can't make it, but I'll send a wish and play from afar."
                onClick={() => guest.setAttendance("virtual")}
              />
            </div>
          </section>
        )}
      </div>
    );
  }

  if (attendance === "party") {
    return (
      <section className="party-card party-light animate-pop p-6 text-center" aria-labelledby="party-title">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-party-green text-white">
          <PartyPopper aria-hidden className="size-7" />
        </span>
        <h3 id="party-title" className="mt-3 font-party text-3xl text-party-purple">
          See you at the party!
        </h3>
        <p className="mt-2 text-party-ink/80">
          The games run live on the night. Join now to save your detective name, and send {EVENT.guestOfHonour} a wish from the game while you wait.
        </p>
        <Link href="/play" className="party-pill mt-5 w-full bg-party-green text-white">
          Join the game
        </Link>
        {changeAnswer}
      </section>
    );
  }

  if (!profile || editingProfile) {
    return (
      <div className="animate-rise">
        <ProfileForm
          initial={profile}
          onDone={(p) => {
            guest.setProfile(p);
            setEditingProfile(false);
          }}
        />
        {changeAnswer}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 rounded-full bg-white/70 py-1.5 pl-1.5 pr-4">
        {profile.photo && (
          // eslint-disable-next-line @next/next/no-img-element -- local data URL
          <img src={profile.photo} alt="" className="size-10 rounded-full object-cover" />
        )}
        <span className="min-w-0 flex-1 truncate text-left font-semibold">Wishing as {profile.name}</span>
        <button type="button" onClick={() => setEditingProfile(true)} className="text-sm font-semibold text-party-purple underline underline-offset-4">
          Edit
        </button>
      </div>
      <WishWays
        profile={profile}
        onSubmit={submitMessage}
        onSent={guest.setWished}
        listFooter={
          <button
            type="button"
            onClick={() => {
              guest.setWished();
              setTimeout(scrollToGames, 50);
            }}
            className="party-pill w-full bg-party-green text-white"
          >
            Complete Wish
          </button>
        }
        sentActions={
          <button type="button" onClick={scrollToGames} className="party-pill bg-party-green text-white">
            See tonight&apos;s games
          </button>
        }
      />
      {changeAnswer}
    </div>
  );
}

function ChoiceButton({
  tone,
  Icon,
  title,
  body,
  onClick,
}: {
  tone: string;
  Icon: typeof Wifi;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx("flex items-center gap-3 rounded-3xl p-4 text-left shadow-[0_5px_0_rgb(0_0_0/0.18)] transition active:translate-y-1 active:shadow-[0_1px_0_rgb(0_0_0/0.18)]", tone)}
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-white/30">
        <Icon aria-hidden className="size-6" />
      </span>
      <span className="min-w-0">
        <span className="block font-party text-xl">{title}</span>
        <span className="block text-sm opacity-90">{body}</span>
      </span>
    </button>
  );
}

function Summons() {
  const { attendance, wished } = useGuest();
  const showGames = attendance === "party" || (attendance === "virtual" && wished);

  return (
    <section className="party-stage px-4 pb-14 pt-12 text-center">
      <div className="mx-auto flex max-w-md flex-col items-center">
        <h2 className="font-party text-4xl leading-tight sm:text-5xl">
          You have been <br /> Summoned
        </h2>
        <Image src={logo} alt={EVENT.title} sizes="256px" className="mt-6 w-60 -rotate-3 drop-shadow-[0_14px_18px_rgb(0_0_0/0.35)]" />
        <p className="mt-6 text-lg">
          It&apos;s a game show all about {EVENT.guestOfHonour}, and she would love for her friends and family to take part. Show
          her how much you care and how well you really know her: play the games, share your favourite memories and send her a
          birthday wish.
        </p>

        {showGames ? (
          <Games canPlay={attendance === "virtual"} />
        ) : (
          <p className="mt-8 rounded-full bg-party-ink/30 px-5 py-2 font-semibold">
            {attendance === "virtual" ? "Send your wish to unlock tonight's games." : "Tap Send wish above to unlock tonight's games."}
          </p>
        )}

        <div className="mt-14 font-party text-5xl leading-tight">
          See you <br /> soon
        </div>
        <div className="mt-6 font-party text-4xl leading-tight text-party-yellow">Thank you</div>
      </div>
    </section>
  );
}

function Games({ canPlay }: { canPlay: boolean }) {
  return (
    <div id="games" className="mt-10 w-full scroll-mt-6">
      <h3 className="font-party text-3xl">Tonight&apos;s Games</h3>
      <p className="mt-1 text-white/90">
        {canPlay ? "Can't be there? Play along from wherever you are." : "You'll play these live at the party."}
      </p>
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
              {canPlay && (
                <Link href="/play" aria-label={`Play ${g.name}`} className="party-pill mt-4 bg-party-yellow px-8 text-party-ink">
                  Play
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
