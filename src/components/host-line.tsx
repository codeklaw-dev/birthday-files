"use client";

import type { Lang } from "@/lib/game/types";
import { PERSONA } from "@/lib/host/persona";
import type { HostView } from "@/lib/host/types";
import { cx } from "./ui";

/*
 * Kept out of components/ui.tsx on purpose: it names the AI host, and guest
 * pages (the invitation) must never ship the host's identity in their bundle.
 */

/** The AI host's current line as captions, in the language(s) being spoken. */
export function HostLine({ host, speaking, big, name = PERSONA.name.en }: { host: HostView; speaking?: boolean; big?: boolean; name?: string }) {
  const u = host.utterance;
  const show: Lang[] = u.lang === "both" ? ["en", "bn"] : [u.lang];
  return (
    <div className="flex items-start gap-3" aria-live="polite">
      <div
        aria-hidden
        className={cx(
          "relative grid shrink-0 place-items-center rounded-full bg-gold font-display font-extrabold text-ink-950",
          big ? "size-14 text-2xl" : "size-9 text-base",
          speaking && "ring-4 ring-gold/40",
        )}
      >
        {name.split(" ").map((w) => w[0]).join("").slice(0, 3)}
        {speaking && <span className="absolute inset-0 animate-ping rounded-full bg-gold/30" />}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-gold">
          {name} · {PERSONA.label}
          {speaking && <SpeakingBars />}
          {!host.voice && <span className="text-haze">· voice off</span>}
        </div>
        {show.map((l) => (
          <p
            key={l}
            lang={l}
            className={cx(
              l === "bn" && "font-bangla",
              big ? "text-xl lg:text-2xl" : "text-sm",
              l === "bn" && show.length > 1 ? "text-haze" : "text-cream",
            )}
          >
            {u.text[l]}
          </p>
        ))}
      </div>
    </div>
  );
}

function SpeakingBars() {
  return (
    <span className="inline-flex h-3 items-end gap-0.5" aria-label="speaking">
      {[0, 1, 2].map((i) => (
        <span key={i} className="w-0.5 animate-[bars_0.9s_ease-in-out_infinite] rounded-full bg-gold" style={{ animationDelay: `${i * 0.15}s`, height: "100%" }} />
      ))}
    </span>
  );
}

