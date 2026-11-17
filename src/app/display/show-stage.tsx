"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ImageOff, Pause, VideoOff } from "lucide-react";
import { cx } from "@/components/ui";
import { EVENT } from "@/lib/event";
import type { RoomView } from "@/lib/game/types";
import type { SceneItemView, SceneView } from "@/lib/show/types";

/** Letterboxed 16:9 stage. Everything on the TV lives inside it. */
export function TvFrame({ children }: { children: ReactNode }) {
  return (
    <div className="tv-letterbox">
      <div className="tv-frame">{children}</div>
    </div>
  );
}

export function RehearsalRibbon({ className }: { className?: string }) {
  return (
    <div className={cx("pointer-events-none z-40 rounded-md border-2 border-dashed border-tile-b bg-ink-950/85 px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.3em] text-tile-b", className)}>
      Rehearsal · sample data
    </div>
  );
}

/** Paused banner, or a full "back in a moment" card on emergency stop (covers everything). */
export function ShowOverlays({ view }: { view: RoomView }) {
  if (view.show.hold) {
    return (
      <div role="status" className="absolute inset-0 z-50 grid place-items-center bg-ink-950 text-center">
        <div>
          <div className="text-8xl" aria-hidden>🎈</div>
          <h1 className="mt-6 font-display text-6xl font-extrabold"><span className="gold-text">Back in a moment</span></h1>
          <p className="mt-4 text-2xl text-haze">The show is taking a short break.</p>
        </div>
      </div>
    );
  }
  if (view.show.paused) {
    return (
      <div role="status" className="absolute inset-x-0 top-0 z-40 flex justify-center pt-3">
        <span className="inline-flex items-center gap-3 rounded-full bg-gold px-6 py-2 font-display text-2xl font-extrabold text-ink-950 shadow-xl">
          <Pause className="size-6" aria-hidden /> Paused
        </span>
      </div>
    );
  }
  return null;
}

/** Warm the browser cache for every picture and the next videos in the scene, so reveals don't stall. */
function usePreload(scene: SceneView | null) {
  const urls = scene?.items.map((i) => (i.mediaKind === "photo" ? i.mediaUrl : null)).filter((u): u is string => !!u) ?? [];
  const key = urls.join("|");
  useEffect(() => {
    if (!key) return;
    const imgs = key.split("|").map((u) => {
      const img = new Image();
      img.decoding = "async";
      img.src = u;
      return img;
    });
    return () => imgs.forEach((i) => (i.src = ""));
  }, [key]);
}

function Missing({ kind }: { kind: "photo" | "video" }) {
  const Icon = kind === "photo" ? ImageOff : VideoOff;
  return (
    <div className="grid aspect-video h-[calc(var(--tvh)*40)] place-items-center rounded-2xl border-2 border-dashed border-white/20 bg-white/5 text-center text-haze">
      <div>
        <Icon className="mx-auto size-16" aria-hidden />
        <p className="mt-3 text-xl">This {kind} couldn&apos;t be loaded.</p>
      </div>
    </div>
  );
}

/** A photo or video that degrades to a friendly card if the file is missing or unreadable. */
export function Media({ item, paused, autoPlay = true, onEnded, className }: { item: SceneItemView; paused: boolean; autoPlay?: boolean; onEnded?: () => void; className?: string }) {
  const [broken, setBroken] = useState<string | null>(null);
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (paused) v.pause();
    else if (autoPlay) void v.play().catch(() => {});
  }, [paused, autoPlay, item.id]);
  if (!item.mediaUrl || !item.mediaKind || broken === item.id) return item.mediaKind ? <Missing kind={item.mediaKind} /> : null;
  if (item.mediaKind === "photo")
    // eslint-disable-next-line @next/next/no-img-element -- private signed URL, served as-is
    return <img key={item.id} src={item.mediaUrl} alt={item.title} onError={() => setBroken(item.id)} className={cx("rounded-2xl object-contain shadow-2xl", className)} />;
  return (
    <video
      key={item.id}
      ref={ref}
      src={item.mediaUrl}
      autoPlay={autoPlay && !paused}
      playsInline
      controls={false}
      preload="auto"
      onError={() => {
        setBroken(item.id);
        onEnded?.();
      }}
      onEnded={onEnded}
      className={cx("rounded-2xl bg-black shadow-2xl", className)}
    />
  );
}

const KIND_ICON: Record<SceneView["kind"], string> = { spotlight: "🔦", history: "📅", honours: "🎖️", montage: "🎬", prizes: "🎁", ceremony: "🏆" };

export function SceneStage({ view }: { view: RoomView }) {
  const scene = view.scene!;
  usePreload(scene);
  if (scene.index < 0) return <TitleCard scene={scene} />;
  const item = scene.items[scene.index];
  if (!item) return <TitleCard scene={scene} />;
  const paused = view.show.paused || view.show.hold;
  return (
    <div key={`${scene.id}:${scene.index}`} className="flex min-h-0 flex-1 animate-scene flex-col">
      <div className="flex items-center justify-between font-mono text-lg uppercase tracking-[0.3em] text-gold">
        <span>
          {KIND_ICON[scene.kind]} {scene.title}
        </span>
        <span className="text-haze">
          {scene.index + 1} / {scene.items.length}
        </span>
      </div>
      {scene.kind === "spotlight" && <Spotlight item={item} revealed={scene.revealed} paused={paused} />}
      {scene.kind === "history" && <History scene={scene} item={item} />}
      {scene.kind === "honours" && <Honour item={item} />}
      {scene.kind === "montage" && <Montage scene={scene} paused={paused} />}
      {(scene.kind === "ceremony" || scene.kind === "prizes") && <Podium scene={scene} />}
    </div>
  );
}

function TitleCard({ scene }: { scene: SceneView }) {
  return (
    <div className="flex flex-1 animate-scene flex-col items-center justify-center gap-6 text-center">
      <div className="text-8xl" aria-hidden>{KIND_ICON[scene.kind]}</div>
      <h1 className="font-display text-7xl font-extrabold"><span className="gold-text">{scene.title}</span></h1>
      {scene.subtitle && <p className="max-w-4xl text-3xl text-haze">{scene.subtitle}</p>}
      {scene.items.length === 0 && <p className="font-mono text-xl text-haze">Nothing to show yet.</p>}
    </div>
  );
}

function Spotlight({ item, revealed, paused }: { item: SceneItemView; revealed: boolean; paused: boolean }) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] items-center gap-10 pt-6">
      <div className="flex min-h-0 items-center justify-center">
        {item.mediaKind ? (
          <Media item={item} paused={paused} className="max-h-[calc(var(--tvh)*62)] w-full object-contain" />
        ) : (
          <blockquote className="file-card p-10 text-4xl font-medium leading-snug" style={{ rotate: "-1deg" }}>
            “{item.text}”
          </blockquote>
        )}
      </div>
      <div className="flex flex-col items-center gap-6 text-center">
        {item.mediaKind === "photo" && item.text && <p className="text-2xl italic text-haze">“{item.text}”</p>}
        {revealed && item.from ? (
          <div className="animate-stamp">
            <div className="font-mono text-lg uppercase tracking-[0.3em] text-haze">Sent by</div>
            <div className="mt-2 font-display text-7xl font-extrabold text-gold">{item.from}</div>
            {item.fromDetail && <div className="mt-2 text-2xl text-haze">{item.fromDetail}</div>}
          </div>
        ) : (
          <div>
            <div className="stamp text-3xl text-stamp">Who sent this?</div>
            <p className="mt-6 text-2xl text-haze">Shout your guess!</p>
          </div>
        )}
      </div>
    </div>
  );
}

function History({ scene, item }: { scene: SceneView; item: SceneItemView }) {
  const domain = (() => {
    try {
      return item.sourceUrl ? new URL(item.sourceUrl).hostname.replace(/^www\./, "") : "";
    } catch {
      return "";
    }
  })();
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center gap-8">
      <ol className="flex items-center gap-1" aria-label="Years">
        {scene.items.map((it, i) => (
          <li key={it.id} className={cx("h-2 flex-1 rounded-full", i < scene.index ? "bg-gold/60" : i === scene.index ? "bg-gold" : "bg-white/15")} />
        ))}
      </ol>
      <div className="flex items-end gap-10">
        <div className="font-display text-[11rem] font-extrabold leading-none tabular-nums"><span className="gold-text">{item.year}</span></div>
        <div className="pb-4 font-mono text-2xl uppercase tracking-[0.3em] text-haze">21 November · {item.year === 2002 ? `the day ${EVENT.guestOfHonour} was born` : `${EVENT.guestOfHonour} turned ${item.year! - 2002}`}</div>
      </div>
      <h1 className="max-w-6xl font-display text-6xl font-extrabold leading-tight">{item.title}</h1>
      <p className="max-w-5xl text-3xl leading-snug text-haze">{item.text}</p>
      <p className="font-mono text-lg text-haze">
        Source: <span className="text-cream">{item.sourceName}</span>
        {domain && <span> · {domain}</span>}
      </p>
    </div>
  );
}

function Honour({ item }: { item: SceneItemView }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center gap-12">
      {item.mediaKind === "photo" && <Media item={item} paused={false} className="max-h-[calc(var(--tvh)*56)] max-w-[45%]" />}
      <div className="max-w-3xl text-center">
        <div className="text-7xl" aria-hidden>🎖️</div>
        <h1 className="mt-4 animate-stamp font-display text-7xl font-extrabold text-gold">{item.title}</h1>
        {item.fromDetail && <p className="mt-3 text-2xl text-haze">{item.fromDetail}</p>}
        {item.text && <p className="mt-8 text-3xl italic leading-snug">“{item.text}”</p>}
      </div>
    </div>
  );
}

/** Plays every video back to back from where the organiser started it. Next / Prev on the dashboard jump. */
function Montage({ scene, paused }: { scene: SceneView; paused: boolean }) {
  const [local, setLocal] = useState({ from: scene.index, offset: 0 });
  const offset = local.from === scene.index ? local.offset : 0;
  const i = scene.index + offset;
  const item = scene.items[i];
  const next = scene.items[i + 1];
  if (!item)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <div className="text-8xl" aria-hidden>❤️</div>
        <h1 className="font-display text-6xl font-extrabold"><span className="gold-text">With love, from all of us</span></h1>
      </div>
    );
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 pt-4">
      <Media item={item} paused={paused} onEnded={() => setLocal({ from: scene.index, offset: offset + 1 })} className="max-h-[calc(var(--tvh)*64)] w-full object-contain" />
      <div className="text-center">
        <div className="font-display text-5xl font-extrabold text-gold">{item.from}</div>
        {item.fromDetail && <div className="mt-1 text-2xl text-haze">{item.fromDetail}</div>}
      </div>
      {/* Warm up the next clip while this one plays. */}
      {next?.mediaUrl && <video src={next.mediaUrl} preload="auto" muted className="hidden" aria-hidden />}
    </div>
  );
}

function Podium({ scene }: { scene: SceneView }) {
  const item = scene.items[scene.index];
  const shown = scene.revealed;
  const earlier = scene.items.slice(0, scene.index).reverse();
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-center gap-10">
      <div className="text-center">
        <div className="font-mono text-3xl uppercase tracking-[0.3em] text-haze">{item.title}</div>
        {shown ? (
          <div className="relative mt-8">
            <div className="animate-stamp font-display text-8xl font-extrabold text-gold">{item.from}</div>
            <div className="mt-4 text-4xl">{item.text}</div>
            {scene.kind === "ceremony" && scene.index === scene.items.length - 1 && <Confetti />}
          </div>
        ) : (
          <div className="mt-8 font-display text-9xl font-extrabold text-white/20">?</div>
        )}
      </div>
      <ul className="flex max-h-[calc(var(--tvh)*70)] flex-col gap-2 overflow-hidden">
        {earlier.map((it) => (
          <li key={it.id} className="panel flex items-center justify-between gap-4 px-5 py-3">
            <span className="truncate font-mono text-sm uppercase tracking-widest text-haze">{it.title}</span>
            <span className="truncate text-xl font-bold">{it.from}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const CONFETTI = ["🎉", "🎈", "✨", "🎂", "⭐", "🎊"];
export function Confetti({ count = 28 }: { count?: number }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="absolute -top-12 animate-drift text-4xl" style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i * 0.43) % 9}s`, animationDuration: `${7 + (i % 5)}s` }}>
          {CONFETTI[i % CONFETTI.length]}
        </span>
      ))}
    </div>
  );
}

function Candle({ lit, big, label }: { lit: boolean; big?: boolean; label?: string }) {
  return (
    <div className="relative flex flex-col items-center">
      {!lit && <span aria-hidden className="absolute -top-6 size-4 animate-smoke rounded-full bg-white/40 blur-sm" />}
      <div
        className={cx(
          "mb-1 origin-bottom rounded-[50%_50%_50%_50%/60%_60%_40%_40%] bg-gradient-to-t from-stamp via-gold to-cream transition-opacity duration-500",
          big ? "h-12 w-7" : "h-7 w-4",
          lit ? "animate-flicker shadow-[0_0_24px_6px_rgb(246_196_83/0.55)]" : "opacity-0",
        )}
      />
      <div className={cx("rounded-sm bg-[repeating-linear-gradient(135deg,var(--color-cream)_0_6px,var(--color-tile-b)_6px_12px)]", big ? "h-24 w-5 ring-4 ring-gold" : "h-14 w-2.5")} />
      {label && <div className="absolute -bottom-9 whitespace-nowrap font-mono text-sm font-bold uppercase tracking-widest text-gold">{label}</div>}
    </div>
  );
}

/** 24 candles: 23 for the guests' phones, the tall one is Mez's. Then the cut, then the real cake. */
export function CakeStage({ view }: { view: RoomView }) {
  const { candles, lit, guestsDone, mezOut, stage } = view.cake;
  const guestLit = Math.max(0, lit - 1);
  if (stage === "real")
    return (
      <div className="relative flex flex-1 flex-col items-center justify-center gap-8 text-center">
        <Confetti />
        <div className="text-[10rem] leading-none" aria-hidden>🎂</div>
        <h1 className="font-display text-7xl font-extrabold"><span className="gold-text">Now for the real cake!</span></h1>
        <p className="text-3xl text-haze">Gather round, phones down, voices up.</p>
      </div>
    );
  const cut = stage === "cut";
  const headline = cut
    ? `Happy birthday, ${EVENT.guestOfHonour}!`
    : mezOut
      ? `Make a wish, ${EVENT.guestOfHonour}!`
      : guestsDone
        ? `One left. That's ${EVENT.guestOfHonour}'s candle!`
        : "Tap your phones. Blow them out!";
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-10 text-center">
      {mezOut && <Confetti />}
      <h1 className="font-display text-6xl font-extrabold">{mezOut || cut ? <span className="gold-text">{headline}</span> : headline}</h1>
      <div role="img" aria-label={`Birthday cake with ${lit} of ${candles} candles lit`} className="relative flex flex-col items-center">
        {cut && <div aria-hidden className="animate-knife absolute left-1/2 top-0 z-10 text-8xl">🔪</div>}
        <div className="flex items-end gap-3">
          {Array.from({ length: Math.ceil((candles - 1) / 2) }, (_, i) => (
            <Candle key={`l${i}`} lit={i < Math.ceil(guestLit / 2)} />
          ))}
          <div className="mx-4">
            <Candle lit={!mezOut} big label={EVENT.guestOfHonour} />
          </div>
          {Array.from({ length: Math.floor((candles - 1) / 2) }, (_, i) => (
            <Candle key={`r${i}`} lit={i < Math.floor(guestLit / 2)} />
          ))}
        </div>
        <div className="mt-2 flex">
          <div className={cx("flex flex-col items-end", cut && "animate-split-left")}>
            <div className="h-16 w-[19rem] rounded-tl-3xl bg-cream" />
            <div className="h-6 w-[19rem] bg-stamp" />
            <div className="h-20 w-[21rem] rounded-bl-2xl bg-[#f3b7c4]" />
          </div>
          <div className={cx("flex flex-col items-start", cut && "animate-split-right")}>
            <div className="h-16 w-[19rem] rounded-tr-3xl bg-cream" />
            <div className="h-6 w-[19rem] bg-stamp" />
            <div className="h-20 w-[21rem] rounded-br-2xl bg-[#f3b7c4]" />
          </div>
        </div>
        <div className="h-3 w-[46rem] rounded-full bg-white/20" />
      </div>
      <p className="font-mono text-xl uppercase tracking-[0.3em] text-haze">
        {cut ? "First slice for Mez" : mezOut ? "All 24 out" : guestsDone ? "Over to you, Mez" : `${guestLit} of ${candles - 1} guest candles lit`}
      </p>
    </div>
  );
}
