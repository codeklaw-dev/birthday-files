"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Mic, PenLine, Square, Upload, Video, X } from "lucide-react";
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

type Mode = "video" | "upload" | "voice" | "note";
type Media = { kind: "video" | "image" | "audio"; url: string };

const WAYS: { mode: Mode; label: string; hint: string; Icon: typeof Video; tone: string }[] = [
  { mode: "video", label: "Record a video", hint: "Say it to the camera", Icon: Video, tone: "bg-party-pink" },
  { mode: "upload", label: "Upload a photo or video", hint: "Your favourite memory", Icon: Upload, tone: "bg-party-sky" },
  { mode: "voice", label: "Record a voice message", hint: "Up to a minute", Icon: Mic, tone: "bg-party-sun" },
  { mode: "note", label: "Write a note", hint: "A wish, a memory, an inside joke", Icon: PenLine, tone: "bg-party-mint" },
];

type Submit = (author: string, text: string) => Promise<{ ok: boolean; error?: string }>;

/**
 * "Send wish" button that opens the ways to wish Mez. Media is captured and
 * previewed on the phone; only the written note is sent until uploads exist
 * (Milestone 4: Supabase Storage).
 */
export function WishComposer({
  defaultAuthor = "",
  onSubmit,
  startOpen = false,
}: {
  defaultAuthor?: string;
  onSubmit: Submit;
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [mode, setMode] = useState<Mode | null>(null);
  const way = WAYS.find((w) => w.mode === mode);

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="wish-ways"
        onClick={() => setOpen((o) => !o)}
        className="party-pill bg-party-green text-white"
      >
        Send wish
        <ChevronDown aria-hidden className={cx("size-5 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div id="wish-ways" className="w-full animate-rise">
          {!way ? (
            <ul className="party-card flex flex-col gap-1 p-2">
              {WAYS.map((w) => (
                <li key={w.mode}>
                  <button
                    type="button"
                    onClick={() => setMode(w.mode)}
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
          ) : (
            <WishForm key={way.mode} way={way} defaultAuthor={defaultAuthor} onSubmit={onSubmit} onBack={() => setMode(null)} />
          )}
        </div>
      )}
    </div>
  );
}

function WishForm({
  way,
  defaultAuthor,
  onSubmit,
  onBack,
}: {
  way: (typeof WAYS)[number];
  defaultAuthor: string;
  onSubmit: Submit;
  onBack: () => void;
}) {
  const [author, setAuthor] = useState(defaultAuthor);
  const [text, setText] = useState("");
  const [media, setMedia] = useState<Media | null>(null);
  const [state, setState] = useState<{ kind: "idle" | "sending" | "sent" | "error" | "info"; msg?: string }>({ kind: "idle" });
  const max = 280;
  const isNote = way.mode === "note";
  const mediaWord = media?.kind === "audio" ? "voice message" : media?.kind === "image" ? "photo" : "video";

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
        const res = await onSubmit(author, text);
        if (!res.ok) return setState({ kind: "error", msg: res.error ?? "Something went wrong." });
        setText("");
        setState({
          kind: "sent",
          msg: media
            ? `Note filed! Your ${mediaWord} stays on this phone for now, since uploads open soon.`
            : "Filed! It shows on the big screen once the host approves it.",
        });
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

      <PartyField label="Your name">
        <input required maxLength={20} value={author} onChange={(e) => setAuthor(e.target.value)} autoComplete="given-name" className="party-input" />
      </PartyField>
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
        {state.kind === "sending" ? "Sending…" : "Send to the files"}
      </button>
      <p aria-live="polite" className="min-h-5 text-sm">
        {state.kind === "sent" && <span className="font-semibold text-party-green">{state.msg}</span>}
        {state.kind === "info" && <span className="text-party-plum">{state.msg}</span>}
        {state.kind === "error" && <span className="font-semibold text-party-berry">{state.msg}</span>}
      </p>
    </form>
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
