"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Check, PartyPopper, Sparkles, Wifi } from "lucide-react";
import {
  Balloons,
  PartyField,
  PhotoPicker,
  StartOver,
  Streamers,
  WAYS,
  WishForm,
  WishSent,
  type Mode,
  type Profile,
  type Sent,
} from "@/components/party";
import { GAME_ART } from "@/components/game-art";
import { cx, TILE } from "@/components/ui";
import { useNow, usePlayerToken, useStored } from "@/lib/client/hooks";
import { EVENT } from "@/lib/event";
import type { MediaItem } from "@/lib/game/media";
import { SURVEY_QUESTIONS } from "@/lib/game/survey-content";
import discoBall from "@/assets/party/disco-ball.png";
import logo from "@/assets/party/logo.png";
import mezPhoto from "@/assets/party/mez-cake-photo.png";
import partyPopper from "@/assets/party/party-popper.png";

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

async function submitMessage(author: string, text: string, photo: string | null, media: MediaItem[] = []) {
  try {
    const res = await fetch("/api/room/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "submitMessage", author, text, photo, media }),
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
        <div id="guest-flow" className="mt-8 w-full scroll-mt-16">
          <GuestFlow open={flowOpen} setOpen={setFlowOpen} />
        </div>
        {!flowOpen && (
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
        )}

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

type Step = "name" | "attendance" | "photo" | "type" | "wish" | "done";
const STEPS: Step[] = ["name", "attendance", "photo", "type", "wish"];

/**
 * One question at a time: name → at the party? → photo → how to wish → the
 * wish → confirmation. The attendance answer decides the ending: virtual
 * troopers unlock the games, party guests are pointed to the live game.
 */
function GuestFlow({ open, setOpen }: { open: boolean; setOpen: (v: boolean | ((o: boolean) => boolean)) => void }) {
  const guest = useGuest();
  const [step, setStep] = useState<Step>(guest.wished ? "done" : "name");
  const [name, setName] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const savedName = guest.profile?.name ?? "";
  const photo = guest.profile?.photo ?? null;
  const { attendance } = guest;
  const virtual = attendance === "virtual";
  const draftName = name ?? savedName;
  const go = (next: Step) => setStep(next);
  const back = () => setStep(STEPS[Math.max(0, STEPS.indexOf(step) - 1)]);
  const saveProfile = (patch: Partial<Profile>) => guest.setProfile({ name: savedName, photo, ...patch });
  const restart = () => {
    setStep("name");
    setName(null);
    setMode(null);
    setSent(null);
    setOpen(true);
  };
  const startOver = savedName ? (
    <div className="mt-4">
      <StartOver name={savedName} onConfirm={restart} />
    </div>
  ) : null;

  if (!open && step === "name" && !guest.wished) {
    return (
      <div className="flex justify-center">
        <button type="button" onClick={() => setOpen(true)} className="party-pill bg-party-green text-white">
          Send wish
        </button>
      </div>
    );
  }

  if (step === "done") {
    const ending = virtual ? (
      <button type="button" onClick={scrollToGames} className="party-pill bg-party-green text-white">
        See tonight&apos;s games
      </button>
    ) : (
      <Link href="/play" className="party-pill bg-party-green text-white">
        Join the game
      </Link>
    );
    return (
      <div className="flex flex-col gap-3">
        {sent ? (
          <WishSent
            sent={sent}
            author={savedName}
            photo={photo}
            actions={
              <>
                {!virtual && <p className="font-semibold text-party-plum">See you at the party! The games are revealed live on the night.</p>}
                {ending}
              </>
            }
            onAnother={() => {
              setSent(null);
              setMode(null);
              go("type");
            }}
          />
        ) : (
          <section className="party-card party-light flex flex-col items-center gap-3 p-6 text-center">
            <h3 className="font-party text-2xl text-party-purple">Thanks, {savedName || "detective"}!</h3>
            <p className="text-party-ink/80">
              {virtual ? "Your wish is in. Tonight's games are waiting for you below." : "Your wish is in. See you at the party!"}
            </p>
            {ending}
            <button
              type="button"
              onClick={() => go("type")}
              className="rounded-full px-4 py-2.5 font-semibold text-party-purple hover:bg-party-purple/10"
            >
              Send another wish
            </button>
          </section>
        )}
        {!virtual && <BeforeParty name={savedName} />}
        {startOver}
      </div>
    );
  }

  const n = STEPS.indexOf(step) + 1;
  const header = (
    <div className="mb-3 flex items-center gap-3">
      {n > 1 ? (
        <button type="button" onClick={back} aria-label="Back" className="grid size-10 shrink-0 place-items-center rounded-full bg-white/70 text-party-ink">
          <ArrowLeft aria-hidden className="size-5" />
        </button>
      ) : (
        <span className="size-10 shrink-0" />
      )}
      <div className="flex-1">
        <div className="flex gap-1.5" aria-hidden>
          {STEPS.map((s, i) => (
            <span key={s} className={cx("h-2 flex-1 rounded-full", i < n ? "bg-party-purple" : "bg-party-purple/20")} />
          ))}
        </div>
        <p className="mt-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-party-plum">
          Step {n} of {STEPS.length}
        </p>
      </div>
    </div>
  );

  if (step === "wish") {
    const way = WAYS.find((w) => w.mode === mode) ?? WAYS[0];
    return (
      <div className="animate-rise">
        {header}
        <WishForm
          key={way.mode}
          way={way}
          submitLabel="Complete Wish"
          onSubmit={(text, media) => submitMessage(savedName, text, photo, media)}
          onBack={back}
          onSent={(s) => {
            setSent(s);
            guest.setWished();
            go("done");
          }}
        />
        {startOver}
      </div>
    );
  }

  return (
    <div key={step} className="animate-rise">
      {header}
      <section className="party-card party-light flex flex-col gap-4 p-5 text-center" aria-labelledby="step-q">
        {step === "name" && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!draftName.trim()) return;
              saveProfile({ name: draftName.trim() });
              go("attendance");
            }}
          >
            <h3 id="step-q" className="font-party text-2xl text-party-purple">
              What&apos;s your name?
            </h3>
            <PartyField label="Your name">
              <input
                autoFocus
                required
                maxLength={20}
                value={draftName}
                onChange={(e) => setName(e.target.value)}
                autoComplete="given-name"
                className="party-input text-center"
              />
            </PartyField>
            <button type="submit" disabled={!draftName.trim()} className="party-pill w-full bg-party-purple text-white">
              Next
            </button>
          </form>
        )}

        {step === "attendance" && (
          <>
            <div>
              <h3 id="step-q" className="font-party text-2xl text-party-purple">
                Will you be at the party, {savedName}?
              </h3>
              <p className="mt-1 text-sm text-party-ink/75">{EVENT.dateLabel}</p>
            </div>
            <ChoiceButton
              tone="bg-party-green text-white"
              Icon={PartyPopper}
              title="I'll be there"
              body="I'm coming to the party."
              selected={attendance === "party"}
              onClick={() => {
                guest.setAttendance("party");
                go("photo");
              }}
            />
            <ChoiceButton
              tone="bg-party-sky text-party-ink"
              Icon={Wifi}
              title="Virtual trooper"
              body="I can't make it, but I'll join from afar."
              selected={attendance === "virtual"}
              onClick={() => {
                guest.setAttendance("virtual");
                go("photo");
              }}
            />
          </>
        )}

        {step === "photo" && (
          <>
            <div>
              <h3 id="step-q" className="font-party text-2xl text-party-purple">
                Add a profile photo
              </h3>
              <p className="mt-1 text-sm text-party-ink/75">It shows next to your wish on the big screen, so everyone knows it&apos;s you.</p>
            </div>
            <PhotoPicker photo={photo} onPhoto={(p) => saveProfile({ photo: p })} />
            <button type="button" disabled={!photo} onClick={() => go("type")} className="party-pill w-full bg-party-purple text-white">
              Next
            </button>
            {!virtual && !photo && (
              <button type="button" onClick={() => go("type")} className="text-sm font-semibold text-party-plum underline underline-offset-4">
                Skip for now
              </button>
            )}
            {virtual && !photo && <p className="text-sm text-party-ink/70">Virtual troopers need a photo so the room can see who&apos;s wishing.</p>}
          </>
        )}

        {step === "type" && (
          <>
            <h3 id="step-q" className="font-party text-2xl text-party-purple">
              How would you like to wish {EVENT.guestOfHonour}?
            </h3>
            <ul className="flex flex-col gap-1 text-left">
              {WAYS.map((w) => (
                <li key={w.mode}>
                  <button
                    type="button"
                    onClick={() => {
                      setMode(w.mode);
                      go("wish");
                    }}
                    className="flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition hover:bg-party-purple/10 active:bg-party-purple/15"
                  >
                    <span className={cx("grid size-11 shrink-0 place-items-center rounded-full text-party-ink", w.tone)}>
                      <w.Icon aria-hidden className="size-5" strokeWidth={2.4} />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold">{w.label}</span>
                      <span className="block text-sm text-party-ink/65">{w.hint}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      {startOver}
    </div>
  );
}

/** Party guests answer a few questions ahead of time; their answers power "How Well Do You Know Mez?". */
function BeforeParty({ name }: { name: string }) {
  const token = usePlayerToken();
  const [surveyed, setSurveyed] = useStored("local", "bf.surveyed");
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const q = SURVEY_QUESTIONS[answers.length];

  const submit = async (all: number[]) => {
    setSending(true);
    setError(null);
    const res = await fetch("/api/room/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "survey/submit", token, name, answers: all }),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    setSending(false);
    if (res?.ok) setSurveyed("1");
    else setError(res ? (body.error ?? "Couldn't save your answers.") : "Can't reach the server. Try again in a moment.");
  };

  if (surveyed === "1") {
    return (
      <section className="party-card party-light flex items-center gap-3 p-4 text-left">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-party-mint text-white">
          <Check aria-hidden className="size-5" />
        </span>
        <p className="text-sm font-semibold">Your before-the-party answers are in. We&apos;ll reveal them at the party!</p>
      </section>
    );
  }

  return (
    <section className="party-card party-light flex flex-col gap-4 p-5 text-center" aria-labelledby="before-party">
      <div>
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.25em] text-party-plum">Before the party</p>
        <h3 id="before-party" className="mt-1 font-party text-2xl text-party-purple">
          {open && q ? q.prompt : `${SURVEY_QUESTIONS.length} quick questions about ${EVENT.guestOfHonour}`}
        </h3>
        {!open && (
          <p className="mt-1 text-sm text-party-ink/75">Your answers become part of tonight&apos;s game. No peeking at the games until then!</p>
        )}
      </div>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="party-pill w-full bg-party-purple text-white">
          Answer now
        </button>
      ) : q ? (
        <>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-party-plum">
            Question {answers.length + 1} of {SURVEY_QUESTIONS.length}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {q.options.map((opt, i) => (
              <button
                key={`${answers.length}-${i}`}
                type="button"
                onClick={() => {
                  const next = [...answers, i];
                  setAnswers(next);
                  if (next.length === SURVEY_QUESTIONS.length) void submit(next);
                }}
                className={cx("min-h-16 rounded-2xl px-3 py-2 font-semibold text-party-ink shadow-[0_4px_0_rgb(0_0_0/0.15)] active:translate-y-0.5", TILE[i % 4].bg)}
              >
                {opt}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="font-semibold">{sending ? "Saving your answers…" : "Your answers weren't saved."}</p>
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
        </div>
      )}
    </section>
  );
}

function ChoiceButton({
  tone,
  Icon,
  title,
  body,
  onClick,
  selected,
}: {
  selected?: boolean;
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
      aria-pressed={selected}
      className={cx(selected && "ring-4 ring-party-purple", "flex items-center gap-3 rounded-3xl p-4 text-left shadow-[0_5px_0_rgb(0_0_0/0.18)] transition active:translate-y-1 active:shadow-[0_1px_0_rgb(0_0_0/0.18)]", tone)}
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
  // Party guests never see the games ahead of time; virtual troopers unlock them with a wish.
  const showGames = attendance === "virtual" && wished;

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
          <Games />
        ) : (
          <p className="mt-8 rounded-full bg-party-ink/30 px-5 py-2 font-semibold">
            {attendance === "party"
              ? "The games are a surprise. You'll play them live at the party!"
              : attendance === "virtual"
                ? "Send your wish to unlock tonight's games."
                : "Send a wish above to get started."}
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

function Games() {
  return (
    <div id="games" className="mt-10 w-full scroll-mt-6">
      <h3 className="font-party text-3xl">Tonight&apos;s Games</h3>
      <p className="mt-1 text-white/90">
        Can&apos;t be there? Play along from wherever you are.
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
              <Link href={`/games/${g.id}`} aria-label={`Play ${g.name}`} className="party-pill mt-4 bg-party-yellow px-8 text-party-ink">
                Play
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
