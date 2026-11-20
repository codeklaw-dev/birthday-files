"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Camera, CheckCircle2, Images, Video, X } from "lucide-react";
import { preparePhoto, uploadFile } from "@/lib/client/upload";
import { MAX_MEDIA_PER_WISH, type MediaItem } from "@/lib/game/media";
import { cx } from "@/components/ui";
import { EVENT } from "@/lib/event";

/* ---------------------------------------------------------------- Decorations */

/** Three balloons on strings (blue, yellow, red), as in the Canva board. */
export function Balloons({ className }: { className?: string }) {
  const balloon = (cx_: number, cy: number, fill: string, shine: string) => (
    <g>
      <path d={`M${cx_} ${cy + 38} q 6 26 -4 52 q -8 22 4 44`} fill="none" stroke="#2b1233" strokeWidth="1.4" />
      <ellipse cx={cx_} cy={cy} rx="30" ry="37" fill={fill} />
      <path d={`M${cx_ - 5} ${cy + 36} l 5 7 l 5 -7 z`} fill={fill} />
      <ellipse cx={cx_ - 11} cy={cy - 14} rx="7" ry="11" fill={shine} transform={`rotate(-25 ${cx_ - 11} ${cy - 14})`} />
    </g>
  );
  return (
    <svg viewBox="0 0 150 190" aria-hidden className={className}>
      {balloon(38, 52, "#5ec5ea", "#b9e8f8")}
      {balloon(110, 66, "#f43a4b", "#ff9aa4")}
      {balloon(72, 40, "#ffb93c", "#ffe2a3")}
    </svg>
  );
}

const STREAMER_COLOURS = ["#ff4f81", "#23aae1", "#ffc93c", "#9e48aa", "#2bc48a", "#f59e0b"];

/** Curly streamers and specks scattered over a box. Positions are fixed so SSR and client match. */
export function Streamers({ className }: { className?: string }) {
  const curls = [
    [8, 30, -30], [22, 8, 20], [78, 12, -15], [90, 40, 35], [14, 70, 10], [86, 74, -25], [55, 4, 0], [40, 58, 25],
  ];
  const specks = [
    [30, 22], [64, 28], [70, 60], [18, 48], [94, 20], [48, 80], [6, 90], [80, 92], [60, 46], [34, 92],
  ];
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden className={cx("pointer-events-none", className)}>
      {curls.map(([x, y, r], i) => (
        <path
          key={`c${i}`}
          d="M0 0 q 2.5 -3 5 0 t 5 0 t 5 0"
          transform={`translate(${x} ${y}) rotate(${r})`}
          fill="none"
          stroke={STREAMER_COLOURS[i % STREAMER_COLOURS.length]}
          strokeWidth="1.3"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          style={{ strokeWidth: 3 }}
        />
      ))}
      {specks.map(([x, y], i) => (
        <rect
          key={`s${i}`}
          x={x}
          y={y}
          width="1.6"
          height="2.6"
          rx="0.5"
          transform={`rotate(${i * 37} ${x} ${y})`}
          fill={STREAMER_COLOURS[(i + 2) % STREAMER_COLOURS.length]}
        />
      ))}
    </svg>
  );
}

/* ---------------------------------------------------------------- Wishes */

export type Mode = "video" | "photos";
export type Profile = { name: string; photo: string | null };
export type WishSubmit = (text: string, media: MediaItem[]) => Promise<{ ok: boolean; error?: string }>;

export const WAYS: { mode: Mode; label: string; hint: string; Icon: typeof Video; tone: string }[] = [
  { mode: "video", label: "Upload a video", hint: "A birthday message or a favourite clip", Icon: Video, tone: "bg-party-pink" },
  { mode: "photos", label: "Share photo memories", hint: `Pick up to ${MAX_MEDIA_PER_WISH} photos`, Icon: Images, tone: "bg-party-sky" },
];

export type Sent = { text: string; media: MediaItem[]; previews: string[] };

/** Clear confirmation after a wish is sent. */
export function WishSent({
  sent,
  author,
  photo,
  actions,
  onAnother,
}: {
  sent: Sent;
  author: string;
  photo: string | null;
  actions?: ReactNode;
  onAnother: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  // Move focus (and screen readers) to the confirmation.
  useEffect(() => heading.current?.focus(), []);
  const videos = sent.media.filter((m) => m.kind === "video").length;
  const photos = sent.media.length - videos;
  const attached = [videos && `${videos} video${videos > 1 ? "s" : ""}`, photos && `${photos} photo${photos > 1 ? "s" : ""}`].filter(Boolean).join(" and ");
  return (
    <section className="party-card party-light flex animate-pop flex-col items-center gap-4 px-5 pb-6 pt-7 text-center" aria-labelledby="wish-sent-title">
      <span className="grid size-16 place-items-center rounded-full bg-party-mint text-white shadow-[0_5px_0_rgb(0_0_0/0.15)]">
        <CheckCircle2 aria-hidden className="size-9" strokeWidth={2.4} />
      </span>
      <h3 id="wish-sent-title" ref={heading} tabIndex={-1} className="font-party text-3xl text-party-purple outline-none">
        Wish sent!
      </h3>
      <figure className="w-full rounded-2xl bg-party-yellow/70 p-4 text-left">
        {sent.previews.length > 0 && (
          <div className="mb-3 flex gap-2 overflow-hidden">
            {sent.previews.slice(0, 4).map((src, i) =>
              sent.media[i]?.kind === "video" ? (
                <video key={src} src={src} muted playsInline className="h-20 rounded-xl bg-black object-cover" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- local blob preview
                <img key={src} src={src} alt="" className="size-20 rounded-xl object-cover" />
              ),
            )}
          </div>
        )}
        {sent.text && <blockquote className="break-words text-lg font-medium">“{sent.text}”</blockquote>}
        <figcaption className="mt-3 flex items-center gap-2 text-sm font-semibold text-party-ink/75">
          {photo && (
            // eslint-disable-next-line @next/next/no-img-element -- local data URL
            <img src={photo} alt="" className="size-8 rounded-full object-cover" />
          )}
          From {author}
          {attached && ` · ${attached}`}
        </figcaption>
      </figure>
      <p className="text-party-ink/80">{EVENT.guestOfHonour} will see it on the big screen once the host approves it.</p>
      <div className="flex w-full flex-col gap-2">
        {actions}
        <button type="button" onClick={onAnother} className="rounded-full px-4 py-2.5 font-semibold text-party-purple hover:bg-party-purple/10">
          Send another wish
        </button>
      </div>
    </section>
  );
}

type Picked = { file: File; preview: string };

/** Pick a video or photos, add a note (encouraged), then upload and send. */
export function WishForm({
  way,
  onSubmit,
  onBack,
  onSent,
  submitLabel = "Complete Wish",
}: {
  way: (typeof WAYS)[number];
  onSubmit: WishSubmit;
  onBack: () => void;
  onSent: (s: Sent) => void;
  submitLabel?: string;
}) {
  const [picked, setPicked] = useState<Picked[]>([]);
  const [text, setText] = useState("");
  const [nudged, setNudged] = useState(false);
  const [progress, setProgress] = useState<{ index: number; fraction: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const note = useRef<HTMLTextAreaElement>(null);
  const isVideo = way.mode === "video";
  const max = 280;
  const busy = progress !== null;

  // Release previews when the form closes. (Kept after sending: the confirmation shows them.)
  const previews = useRef<string[]>([]);
  useEffect(() => () => previews.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const add = (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    const list = Array.from(files).filter((f) => f.type.startsWith(isVideo ? "video/" : "image/"));
    if (list.length < files.length) setError(isVideo ? "That file isn't a video." : "Only photos can be added here.");
    const room = isVideo ? 1 : MAX_MEDIA_PER_WISH - picked.length;
    if (!isVideo && list.length > room) setError(`You can add up to ${MAX_MEDIA_PER_WISH} photos.`);
    const next = list.slice(0, Math.max(0, room)).map((file) => {
      const preview = URL.createObjectURL(file);
      previews.current.push(preview);
      return { file, preview };
    });
    setPicked((p) => (isVideo ? next : [...p, ...next]));
  };

  const send = async () => {
    setError(null);
    const media: MediaItem[] = [];
    for (let i = 0; i < picked.length; i++) {
      setProgress({ index: i, fraction: 0 });
      let blob: Blob = picked[i].file;
      if (!isVideo) {
        try {
          blob = await preparePhoto(picked[i].file);
        } catch {
          if (!/^image\/(jpeg|png|webp)$/.test(blob.type)) {
            setProgress(null);
            return setError(`Photo ${i + 1} couldn't be read. Remove it and try another.`);
          }
        }
      }
      const res = await uploadFile(blob, (fraction) => setProgress({ index: i, fraction }));
      if (!res.ok) {
        setProgress(null);
        return setError(res.error);
      }
      media.push(res.item);
    }
    const res = await onSubmit(text.trim(), media);
    setProgress(null);
    if (!res.ok) return setError(res.error ?? "Something went wrong. Try again.");
    onSent({ text: text.trim(), media, previews: picked.map((p) => p.preview) });
  };

  return (
    <form
      className="party-card party-light flex flex-col gap-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (busy) return;
        if (picked.length === 0) return setError(isVideo ? "Choose a video first." : "Choose at least one photo first.");
        if (!text.trim() && !nudged) {
          setNudged(true);
          return;
        }
        void send();
      }}
    >
      <div className="flex items-center gap-3">
        <span className={cx("grid size-10 shrink-0 place-items-center rounded-full", way.tone)}>
          <way.Icon aria-hidden className="size-5" strokeWidth={2.4} />
        </span>
        <h3 className="min-w-0 flex-1 font-party text-xl">{way.label}</h3>
        <button type="button" onClick={onBack} disabled={busy} aria-label="Pick another way to wish" className="grid size-10 place-items-center rounded-full hover:bg-party-purple/10">
          <X aria-hidden className="size-5" />
        </button>
      </div>

      <input
        ref={input}
        type="file"
        accept={isVideo ? "video/*" : "image/*"}
        multiple={!isVideo}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          add(e.target.files);
          e.target.value = "";
        }}
      />
      {picked.length > 0 &&
        (isVideo ? (
          <video src={picked[0].preview} controls playsInline className="max-h-72 w-full rounded-2xl bg-black" />
        ) : (
          <ul className="grid grid-cols-3 gap-2" aria-label="Chosen photos">
            {picked.map((p, i) => (
              <li key={p.preview} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
                <img src={p.preview} alt={`Photo ${i + 1}`} className="aspect-square w-full rounded-xl object-cover" />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPicked((all) => all.filter((x) => x !== p))}
                  aria-label={`Remove photo ${i + 1}`}
                  className="absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-party-ink/70 text-white"
                >
                  <X aria-hidden className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        ))}
      {(isVideo || picked.length < MAX_MEDIA_PER_WISH) && (
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="rounded-2xl border-2 border-dashed border-party-purple/40 px-4 py-5 font-semibold text-party-purple transition hover:bg-party-purple/5"
        >
          {isVideo ? (picked.length ? "Choose a different video" : "Choose a video") : picked.length ? "Add more photos" : "Choose photos"}
        </button>
      )}

      <PartyField label={`Add a note for ${EVENT.guestOfHonour}`} hint={`${text.length}/${max}`}>
        <textarea
          ref={note}
          rows={3}
          maxLength={max}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="A wish, a memory, an inside joke…"
          className="party-input resize-none"
        />
      </PartyField>
      {!nudged && <p className="-mt-2 text-sm text-party-ink/70">Optional, but a few words make it extra special.</p>}

      {nudged && !text.trim() && !busy && (
        <div role="status" className="rounded-2xl bg-party-lilac/50 p-4 text-center">
          <p className="font-semibold">Add a few words? {EVENT.guestOfHonour} would love a note with it.</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => note.current?.focus()} className="party-pill min-h-10 bg-party-purple px-4 py-1.5 text-base text-white">
              Add a note
            </button>
            <button type="button" onClick={() => void send()} className="rounded-full px-4 py-1.5 font-semibold text-party-plum underline underline-offset-4">
              Send without one
            </button>
          </div>
        </div>
      )}

      {progress && (
        <div aria-live="polite">
          <p className="mb-1 text-sm font-semibold">
            {isVideo ? "Uploading your video" : `Uploading photo ${progress.index + 1} of ${picked.length}`}… {Math.round(progress.fraction * 100)}%
          </p>
          <div className="h-3 overflow-hidden rounded-full bg-party-purple/15">
            <div
              className="h-full rounded-full bg-party-purple transition-[width]"
              style={{ width: `${Math.round(((progress.index + progress.fraction) / Math.max(1, picked.length)) * 100)}%` }}
            />
          </div>
        </div>
      )}

      <button type="submit" disabled={busy} className="party-pill bg-party-purple text-white">
        {busy ? "Sending…" : submitLabel}
      </button>
      {error && (
        <p role="alert" className="text-sm font-semibold text-party-berry">
          {error}
        </p>
      )}
    </form>
  );
}

/* ---------------------------------------------------------------- Profile */

const PHOTO_PX = 192;
const PHOTO_MAX_CHARS = 55_000; // under the engine's 60k limit

/** Centre-crops a chosen image to a small square JPEG data URL. */
export async function shrinkPhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new window.Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("unreadable"));
      el.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = PHOTO_PX;
    const ctx = canvas.getContext("2d");
    if (!ctx || !side) throw new Error("unreadable");
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, PHOTO_PX, PHOTO_PX);
    for (const q of [0.82, 0.7, 0.55, 0.4]) {
      const data = canvas.toDataURL("image/jpeg", q);
      if (data.length <= PHOTO_MAX_CHARS) return data;
    }
    throw new Error("too big");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Round "add a photo" button that shrinks the chosen picture for sending. */
export function PhotoPicker({ photo, onPhoto }: { photo: string | null; onPhoto: (p: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col items-center gap-2">
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          setError(null);
          try {
            onPhoto(await shrinkPhoto(file));
          } catch {
            setError("That photo couldn't be read. Try a different one.");
          } finally {
            setBusy(false);
          }
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        aria-label={photo ? "Change profile picture" : "Add a profile picture"}
        className="relative grid size-32 place-items-center overflow-hidden rounded-full border-4 border-dashed border-party-purple/40 bg-party-lilac/40 text-party-purple"
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- local data URL
          <img src={photo} alt="Your profile picture" className="size-full object-cover" />
        ) : (
          <Camera aria-hidden className="size-10" />
        )}
        <span className="absolute inset-x-0 bottom-0 bg-party-ink/60 py-1 text-xs font-semibold text-white">
          {busy ? "Loading…" : photo ? "Change" : "Add photo"}
        </span>
      </button>
      {error && (
        <p role="alert" className="text-sm font-semibold text-party-berry">
          {error}
        </p>
      )}
    </div>
  );
}

export function PartyField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="flex justify-between font-semibold text-party-ink/80">
        {label}
        {hint && <span className="font-mono text-xs font-normal tabular-nums">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
