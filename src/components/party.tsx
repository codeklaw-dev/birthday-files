"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Camera, CheckCircle2, Mic, PenLine, Square, Upload, Video, X } from "lucide-react";
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

export type Mode = "video" | "upload" | "voice" | "note";
type Media = { kind: "video" | "image" | "audio"; url: string };
export type Profile = { name: string; photo: string | null };
export type WishSubmit = (author: string, text: string, photo: string | null) => Promise<{ ok: boolean; error?: string }>;

export const WAYS: { mode: Mode; label: string; hint: string; Icon: typeof Video; tone: string }[] = [
  { mode: "video", label: "Record a video", hint: "Say it to the camera", Icon: Video, tone: "bg-party-pink" },
  { mode: "upload", label: "Upload a photo or video", hint: "Your favourite memory", Icon: Upload, tone: "bg-party-sky" },
  { mode: "voice", label: "Record a voice message", hint: "Up to a minute", Icon: Mic, tone: "bg-party-sun" },
  { mode: "note", label: "Write a note", hint: "A wish, a memory, an inside joke", Icon: PenLine, tone: "bg-party-mint" },
];

export type Sent = { text: string; mediaWord: string | null };

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
  return (
    <section className="party-card party-light flex animate-pop flex-col items-center gap-4 px-5 pb-6 pt-7 text-center" aria-labelledby="wish-sent-title">
      <span className="grid size-16 place-items-center rounded-full bg-party-mint text-white shadow-[0_5px_0_rgb(0_0_0/0.15)]">
        <CheckCircle2 aria-hidden className="size-9" strokeWidth={2.4} />
      </span>
      <h3 id="wish-sent-title" ref={heading} tabIndex={-1} className="font-party text-3xl text-party-purple outline-none">
        Wish sent!
      </h3>
      <figure className="w-full rounded-2xl bg-party-yellow/70 p-4 text-left">
        <blockquote className="break-words text-lg font-medium">“{sent.text}”</blockquote>
        <figcaption className="mt-3 flex items-center gap-2 text-sm font-semibold text-party-ink/75">
          {photo && (
            // eslint-disable-next-line @next/next/no-img-element -- local data URL
            <img src={photo} alt="" className="size-8 rounded-full object-cover" />
          )}
          From {author}
        </figcaption>
      </figure>
      <p className="text-party-ink/80">
        {EVENT.guestOfHonour} will see it on the big screen once the host approves it.
        {sent.mediaWord && ` Your ${sent.mediaWord} stays on this phone for now, since uploads open soon.`}
      </p>
      <div className="flex w-full flex-col gap-2">
        {actions}
        <button type="button" onClick={onAnother} className="rounded-full px-4 py-2.5 font-semibold text-party-purple hover:bg-party-purple/10">
          Send another wish
        </button>
      </div>
    </section>
  );
}

/** One way to wish (video, upload, voice or note), plus the note that gets sent. */
export function WishForm({
  way,
  author,
  setAuthor,
  onSubmit,
  onBack,
  onSent,
  submitLabel = "Send to the files",
}: {
  way: (typeof WAYS)[number];
  submitLabel?: string;
  author: string;
  /** Null when the name comes from a saved profile. */
  setAuthor: ((v: string) => void) | null;
  onSubmit: (text: string) => Promise<{ ok: boolean; error?: string }>;
  onBack: () => void;
  onSent: (s: Sent) => void;
}) {
  const [text, setText] = useState("");
  const [media, setMedia] = useState<Media | null>(null);
  const [state, setState] = useState<{ kind: "idle" | "sending" | "error" | "info"; msg?: string }>({ kind: "idle" });
  const max = 280;
  const isNote = way.mode === "note";
  const mediaWord = media ? (media.kind === "audio" ? "voice message" : media.kind === "image" ? "photo" : "video") : null;

  // Release object URLs when media is replaced or the form closes.
  useEffect(() => () => {
    if (media) URL.revokeObjectURL(media.url);
  }, [media]);

  return (
    <form
      className="party-card party-light flex flex-col gap-4 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim()) {
          setState({ kind: "info", msg: `Uploads aren't switched on yet, so add a few words and ${EVENT.guestOfHonour} still gets your wish.` });
          return;
        }
        setState({ kind: "sending" });
        const res = await onSubmit(text);
        if (!res.ok) return setState({ kind: "error", msg: res.error ?? "Something went wrong. Try again." });
        onSent({ text: text.trim(), mediaWord });
      }}
    >
      <div className="flex items-center gap-3">
        <span className={cx("grid size-10 shrink-0 place-items-center rounded-full", way.tone)}>
          <way.Icon aria-hidden className="size-5" strokeWidth={2.4} />
        </span>
        <h3 className="min-w-0 flex-1 font-party text-xl">{way.label}</h3>
        <button type="button" onClick={onBack} aria-label="Pick another way to wish" className="grid size-10 place-items-center rounded-full hover:bg-party-purple/10">
          <X aria-hidden className="size-5" />
        </button>
      </div>

      {way.mode === "video" && <FilePick accept="video/*" capture="user" label="Open the camera" media={media} onMedia={setMedia} />}
      {way.mode === "upload" && <FilePick accept="image/*,video/*" label="Choose a photo or video" media={media} onMedia={setMedia} />}
      {way.mode === "voice" && <VoiceRecorder media={media} onMedia={setMedia} />}

      {setAuthor && (
        <PartyField label="Your name">
          <input required maxLength={20} value={author} onChange={(e) => setAuthor(e.target.value)} autoComplete="given-name" className="party-input" />
        </PartyField>
      )}
      <PartyField label={isNote ? `Message for ${EVENT.guestOfHonour}` : "Add a note"} hint={`${text.length}/${max}`}>
        <textarea
          required={isNote}
          rows={3}
          maxLength={max}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="A wish, a memory, an inside joke…"
          className="party-input resize-none"
        />
      </PartyField>

      <button type="submit" disabled={state.kind === "sending"} className="party-pill bg-party-purple text-white">
        {state.kind === "sending" ? "Sending…" : submitLabel}
      </button>
      <p aria-live="polite" className="min-h-5 text-sm">
        {state.kind === "info" && <span className="text-party-plum">{state.msg}</span>}
        {state.kind === "error" && <span className="font-semibold text-party-berry">{state.msg}</span>}
      </p>
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

function MediaPreview({ media }: { media: Media }) {
  if (media.kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element -- local blob preview, nothing to optimise
    return <img src={media.url} alt="Your photo" className="max-h-72 w-full rounded-2xl object-contain bg-party-ink/5" />;
  }
  if (media.kind === "audio") return <audio src={media.url} controls className="w-full" />;
  return <video src={media.url} controls playsInline className="max-h-72 w-full rounded-2xl bg-black" />;
}

/** On phones, `capture` opens the camera directly; elsewhere it falls back to a file picker. */
function FilePick({
  accept,
  capture,
  label,
  media,
  onMedia,
}: {
  accept: string;
  capture?: "user";
  label: string;
  media: Media | null;
  onMedia: (m: Media | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-3">
      {media && <MediaPreview media={media} />}
      <input
        ref={input}
        type="file"
        accept={accept}
        capture={capture}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          onMedia({ kind: file.type.startsWith("image/") ? "image" : "video", url: URL.createObjectURL(file) });
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="rounded-2xl border-2 border-dashed border-party-purple/40 px-4 py-5 font-semibold text-party-purple transition hover:bg-party-purple/5"
      >
        {media ? "Choose a different one" : label}
      </button>
    </div>
  );
}

const MAX_VOICE_SECONDS = 60;

function VoiceRecorder({ media, onMedia }: { media: Media | null; onMedia: (m: Media | null) => void }) {
  const [status, setStatus] = useState<"idle" | "recording" | "error">("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (recorder.current?.state === "recording") recorder.current.stop();
  };

  // Stop the mic if the form closes mid-recording.
  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  const start = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setStatus("error");
      setError("This browser can't record audio. Try writing a note instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setStatus("idle");
        if (chunks.length) onMedia({ kind: "audio", url: URL.createObjectURL(new Blob(chunks, { type: rec.mimeType })) });
      };
      recorder.current = rec;
      rec.start();
      setSeconds(0);
      setStatus("recording");
      timer.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_VOICE_SECONDS) stop();
          return s + 1;
        });
      }, 1000);
    } catch {
      setStatus("error");
      setError("Microphone access was blocked. Allow it in your browser settings, or write a note instead.");
    }
  };

  const recording = status === "recording";
  return (
    <div className="flex flex-col items-center gap-3">
      {media && !recording && <MediaPreview media={media} />}
      <button
        type="button"
        onClick={recording ? stop : start}
        aria-label={recording ? "Stop recording" : media ? "Record again" : "Start recording"}
        className={cx(
          "grid size-20 place-items-center rounded-full text-white shadow-[0_5px_0_0_rgb(0_0_0/0.2)] transition active:translate-y-1",
          recording ? "animate-pulse bg-party-berry" : "bg-party-purple",
        )}
      >
        {recording ? <Square aria-hidden className="size-7" fill="currentColor" /> : <Mic aria-hidden className="size-8" />}
      </button>
      <p aria-live="polite" className="text-sm font-semibold text-party-ink/75">
        {recording
          ? `Recording… 0:${String(seconds).padStart(2, "0")} / 1:00`
          : media
            ? "Tap to record again"
            : "Tap to start recording"}
      </p>
      {error && <p className="text-center text-sm font-semibold text-party-berry">{error}</p>}
    </div>
  );
}
