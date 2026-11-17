import Link from "next/link";
import { Logo } from "@/components/ui";
import { EVENT } from "@/lib/event";

const SCREENS = [
  { href: "/admin", name: "Host dashboard", device: "Laptop · private", blurb: "Run the show, moderate messages, award points." },
  { href: "/admin/submissions", name: "Guest submissions", device: "Laptop · private", blurb: "RSVPs, answers, photos and videos: review and order them." },
  { href: "/display", name: "TV display", device: "TV · public", blurb: "The big screen: questions, scores and the AI host." },
  { href: "/play", name: "Phone controller", device: "Phones · guests", blurb: "Join with a name, answer, send messages, blow out candles." },
  { href: "/invite", name: "Invitation", device: "Shared link", blurb: "RSVP, questions about Mez, photo and video uploads." },
];

export const metadata = { title: "Organiser hub" };

export default function Hub() {
  return (
    <main className="stage flex flex-1 flex-col items-center px-4 py-12 sm:py-20">
      <div className="w-full max-w-4xl">
        <div className="bulbs mb-8" aria-hidden />
        <Logo size="xl" />
        <p className="mt-6 max-w-xl text-lg text-haze">
          An AI-hosted birthday game show for {EVENT.guestOfHonour}. {EVENT.dateLabel}. Pick a screen to open.
        </p>

        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {SCREENS.map((s) => (
            <li key={s.href}>
              <Link href={s.href} className="panel group block h-full p-6 transition duration-150 hover:border-gold/60 hover:bg-ink-700/70">
                <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-gold">{s.device}</div>
                <div className="mt-2 flex items-baseline justify-between gap-3">
                  <h2 className="font-display text-2xl font-extrabold">{s.name}</h2>
                  <code className="font-mono text-sm text-haze group-hover:text-gold">{s.href}</code>
                </div>
                <p className="mt-2 text-sm text-haze">{s.blurb}</p>
              </Link>
            </li>
          ))}
        </ul>

        <p className="mt-10 font-mono text-xs uppercase tracking-[0.25em] text-haze">
          Milestone 1 prototype · mock data · no external services
        </p>
      </div>
    </main>
  );
}
