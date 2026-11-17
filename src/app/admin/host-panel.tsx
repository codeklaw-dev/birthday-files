"use client";

import { Eraser, Mic, Play, Repeat, Sparkles, Square, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, cx } from "@/components/ui";
import type { HostAction, Lang, RoomView } from "@/lib/game/types";
import { CLIPS, type ClipKey } from "@/lib/host/script";
import { SFX_KINDS, type HostLangMode } from "@/lib/host/types";

type Act = (a: HostAction) => Promise<void>;

const LANG_MODES: { id: HostLangMode; label: string }[] = [
  { id: "en", label: "English" },
  { id: "bn", label: "বাংলা" },
  { id: "both", label: "Both" },
  { id: "auto", label: "Auto" },
];

const QUICK_CLIPS: ClipKey[] = ["happy_birthday", "applause", "lobby_filler", "tech_trouble", "quip_1", "quip_2", "quip_3", "quip_4", "quip_5", "quip_6"];

const SFX_LABEL: Record<(typeof SFX_KINDS)[number], string> = {
  ding: "Ding",
  buzzer: "Buzzer",
  drumroll: "Drumroll",
  fanfare: "Fanfare",
  applause: "Applause",
  airhorn: "Air horn",
  tick: "Tick",
  whoosh: "Whoosh",
};

function Card({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="panel p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.25em] text-gold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Toggle({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="inline-flex min-h-9 items-center gap-2 rounded-lg px-1 text-sm font-semibold"
    >
      <span className={cx("relative h-6 w-11 rounded-full transition", on ? "bg-go" : "bg-white/15")}>
        <span className={cx("absolute top-0.5 size-5 rounded-full bg-cream transition-all", on ? "left-[22px]" : "left-0.5")} />
      </span>
      {label}
    </button>
  );
}

/** Voice, language, soundboard, quick lines. */
export function HostControls({ view, act }: { view: RoomView; act: Act }) {
  const { host } = view;
  return (
    <Card
      title="AI host"
      aside={
        <span className="font-mono text-xs text-haze">
          line #{host.utterance.id.slice(0, 4)} · {host.utterance.source}
        </span>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Toggle on={host.voice} label="Voice on TV" onChange={(enabled) => act({ type: "host/setVoice", enabled })} />
          <Toggle on={host.autoQuips} label="Auto quips after reveals" onChange={(enabled) => act({ type: "host/setAutoQuips", enabled })} />
        </div>
        <div role="group" aria-label="Host language" className="flex w-fit items-center gap-1 rounded-xl border border-white/15 p-1">
          {LANG_MODES.map((l) => (
            <button
              key={l.id}
              aria-pressed={host.mode === l.id}
              onClick={() => act({ type: "host/setLang", lang: l.id })}
              className={cx("min-h-9 rounded-lg px-3 text-sm font-semibold", host.mode === l.id ? "bg-gold text-ink-950" : "text-haze hover:text-cream")}
            >
              {l.label}
            </button>
          ))}
        </div>
        <p className="-mt-2 text-xs text-haze">Auto alternates English and Bangla line by line and uses both for big moments.</p>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-white/10 p-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-haze">TV volume</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              defaultValue={Math.round(host.volume * 100)}
              aria-label="TV volume"
              onPointerUp={(e) => act({ type: "host/setVolume", volume: Number((e.target as HTMLInputElement).value) / 100 })}
              onKeyUp={(e) => act({ type: "host/setVolume", volume: Number((e.target as HTMLInputElement).value) / 100 })}
              className="accent-[var(--color-gold)]"
            />
            <span className="w-10 font-mono text-xs tabular-nums">{Math.round(host.volume * 100)}%</span>
          </label>
          <Toggle on={host.muted} label="Mute all sound" onChange={(muted) => act({ type: "host/setMuted", muted })} />
          <Toggle on={host.subtitles} label="Subtitles on TV" onChange={(on) => act({ type: "host/setSubtitles", on })} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => act({ type: "host/replay" })}>
            <Repeat className="size-4" aria-hidden /> Say it again
          </Button>
          <Button variant="danger" onClick={() => act({ type: "host/stopSpeech" })}>
            <Square className="size-4" aria-hidden /> Stop talking
          </Button>
        </div>

        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-widest text-haze">Soundboard</div>
          <div className="grid grid-cols-4 gap-2">
            {SFX_KINDS.map((k) => (
              <Button key={k} className="px-2" onClick={() => act({ type: "host/sfx", kind: k })}>
                {SFX_LABEL[k]}
              </Button>
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-medium uppercase tracking-widest text-haze">Pre-recorded lines</span>
          <select
            className="input"
            value=""
            onChange={(e) => {
              if (e.target.value) void act({ type: "host/clip", clip: e.target.value });
            }}
          >
            <option value="">Pick a line to play now…</option>
            {QUICK_CLIPS.map((k) => (
              <option key={k} value={k}>
                {CLIPS[k].en}
              </option>
            ))}
          </select>
        </label>
      </div>
    </Card>
  );
}

/** Type a line, or have the LLM draft one for review. */
export function HostWriter({ act, hostKey }: { act: Act; hostKey: string }) {
  const [text, setText] = useState({ en: "", bn: "" });
  const [clip, setClip] = useState<ClipKey | null>(null);
  const [kind, setKind] = useState("roast");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<Lang | null>(null);

  const draft = async () => {
    setBusy(true);
    setError(null);
    setMeta(null);
    try {
      const res = await fetch("/api/host/commentary", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-host-key": hostKey },
        body: JSON.stringify({ kind, note }),
      });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error ?? "No line came back.");
      setText(body.text);
      setClip(body.clip ?? null);
      setMeta(`${body.provider} · ${body.ms} ms${body.clip ? " · pre-recorded" : ""}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const preview = async (lang: Lang) => {
    if (!text[lang].trim()) return;
    setPreviewing(lang);
    setError(null);
    try {
      const res = await fetch("/api/host/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-host-key": hostKey },
        body: JSON.stringify({ text: text[lang], lang }),
      });
      if (!res.ok) throw new Error("No voice available for that line right now.");
      setMeta(`preview via ${res.headers.get("X-Host-Provider")} · ${res.headers.get("X-Host-Ms")} ms`);
      const url = URL.createObjectURL(await res.blob());
      const a = new Audio(url);
      a.onended = () => URL.revokeObjectURL(url);
      await a.play();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPreviewing(null);
    }
  };

  const sayOnTv = async () => {
    if (clip && text.en === CLIPS[clip].en && text.bn === CLIPS[clip].bn) await act({ type: "host/clip", clip });
    else await act({ type: "host/say", text, source: meta && !meta.startsWith("preview") ? "llm" : "host" });
  };

  return (
    <Card title="Say something">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-haze">Ask the AI for</span>
            <select className="input !w-auto" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="roast">a sarcastic quip</option>
              <option value="hype">some hype</option>
              <option value="reveal">a reaction to the answer</option>
              <option value="leaderboard">a leaderboard tease</option>
            </select>
          </label>
          <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
            <span className="text-xs text-haze">Hint (optional)</span>
            <input className="input" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Rafi is gloating" />
          </label>
          <Button onClick={draft} disabled={busy}>
            <Sparkles className="size-4" aria-hidden /> {busy ? "Writing…" : "Draft"}
          </Button>
        </div>

        {(["en", "bn"] as const).map((l) => (
          <label key={l} className="flex flex-col gap-1 text-sm">
            <span className="flex items-center justify-between text-xs text-haze">
              {l === "en" ? "English" : "বাংলা"}
              <button
                type="button"
                className="inline-flex items-center gap-1 text-gold disabled:opacity-40"
                disabled={!text[l].trim() || previewing !== null}
                onClick={() => preview(l)}
              >
                <Volume2 className="size-3.5" aria-hidden /> {previewing === l ? "Loading…" : "Preview here"}
              </button>
            </span>
            <textarea
              lang={l}
              rows={2}
              maxLength={400}
              className={cx("input resize-none", l === "bn" && "font-bangla")}
              value={text[l]}
              onChange={(e) => {
                setClip(null);
                setText({ ...text, [l]: e.target.value });
              }}
            />
          </label>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" disabled={!text.en.trim() && !text.bn.trim()} onClick={sayOnTv}>
            <Play className="size-4" aria-hidden /> Say on TV
          </Button>
          <Button
            onClick={() => {
              setText({ en: "", bn: "" });
              setClip(null);
              setMeta(null);
            }}
          >
            <Eraser className="size-4" aria-hidden /> Clear
          </Button>
          {meta && <span className="font-mono text-xs text-haze">{meta}</span>}
        </div>
        <p className="text-xs text-haze">Nothing the AI writes is spoken until you press Say on TV. Fill one language to speak just that one.</p>
        {error && <p role="alert" className="text-sm text-stamp">{error}</p>}
      </div>
    </Card>
  );
}

const MAX_RECORD_MS = 20_000;
type PttState = "idle" | "recording" | "transcribing" | "replying";

/**
 * Push-to-talk with Mez. The microphone opens only while the button is held
 * (never in the background) and stops after 20 s. Speech → text (editable) →
 * reply in the host's voice, played on the TV only.
 */
export function PushToTalk({ hostKey, act }: { hostKey: string; act: Act }) {
  const [state, setState] = useState<PttState>("idle");
  const [lang, setLang] = useState<"auto" | Lang>("auto");
  const [auto, setAuto] = useState(true);
  const [thinking, setThinking] = useState(true);
  const [transcript, setTranscript] = useState("");
  const [heardLang, setHeardLang] = useState<Lang | null>(null);
  const [reply, setReply] = useState<{ text: string; lang: Lang; meta: string; spoken: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const [secure, setSecure] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setSecure(window.isSecureContext && !!navigator.mediaDevices?.getUserMedia), 0);
    return () => clearTimeout(t);
  }, []);

  const askReply = useCallback(
    async (text: string, speak: boolean) => {
      setState("replying");
      setError(null);
      try {
        const res = await fetch("/api/host/reply", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-host-key": hostKey },
          body: JSON.stringify({ transcript: text, lang: lang === "auto" ? (heardLang ?? "auto") : lang, speak, thinking: speak && thinking }),
          signal: AbortSignal.timeout(15_000),
        });
        const body = await res.json();
        if (body.ok) {
          const l: Lang = body.lang;
          setReply({ text: body.reply[l], lang: l, meta: `${body.provider} · ${body.ms} ms`, spoken: body.spoken });
        } else setError(body.fallback ? `${body.error}` : (body.error ?? "No reply."));
      } catch {
        setError("The reply took too long. Nothing was spoken; try again or play a prepared line.");
      } finally {
        setState("idle");
      }
    },
    [hostKey, lang, heardLang, thinking],
  );

  const finish = useCallback(async () => {
    if (ticker.current) clearInterval(ticker.current);
    const blob = new Blob(chunks.current, { type: rec.current?.mimeType || "audio/webm" });
    if (Date.now() - startedAt.current < 500 || blob.size === 0) {
      setState("idle");
      setError("Hold the button while Mez talks.");
      return;
    }
    setState("transcribing");
    const form = new FormData();
    form.append("audio", blob, "clip");
    if (lang !== "auto") form.append("lang", lang);
    try {
      const res = await fetch("/api/host/transcribe", { method: "POST", headers: { "x-host-key": hostKey }, body: form, signal: AbortSignal.timeout(15_000) });
      const body = await res.json();
      if (!body.ok) {
        setState("idle");
        setError(`${body.error} You can type it below.`);
        return;
      }
      setTranscript(body.transcript);
      setHeardLang(body.lang);
      setReply(null);
      if (auto) await askReply(body.transcript, true);
      else setState("idle");
    } catch {
      setState("idle");
      setError("Transcription took too long. Type what Mez said below.");
    }
  }, [auto, askReply, hostKey, lang]);

  const start = useCallback(async () => {
    if (state !== "idle") return;
    setError(null);
    try {
      // The microphone is requested only now, on a deliberate press.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const r = new MediaRecorder(stream);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        void finish();
      };
      rec.current = r;
      startedAt.current = Date.now();
      r.start();
      setState("recording");
      setElapsed(0);
      ticker.current = setInterval(() => {
        const ms = Date.now() - startedAt.current;
        setElapsed(ms);
        if (ms >= MAX_RECORD_MS && r.state === "recording") r.stop();
      }, 200);
    } catch (e) {
      setError((e as Error).name === "NotAllowedError" ? "Microphone permission was refused." : "No microphone available.");
    }
  }, [state, finish]);

  const stop = useCallback(() => {
    if (rec.current?.state === "recording") rec.current.stop();
  }, []);

  return (
    <Card title="Talk to Mez (push-to-talk)">
      <div className="flex flex-col gap-3">
        {!secure ? (
          <p className="text-sm text-haze">
            The microphone only works on a secure page: open the dashboard as <code className="text-gold">http://localhost:3000/admin</code> on the laptop, or over HTTPS. You can still type below.
          </p>
        ) : (
          <button
            onPointerDown={start}
            onPointerUp={stop}
            onPointerLeave={stop}
            onPointerCancel={stop}
            onKeyDown={(e) => (e.key === " " || e.key === "Enter") && !e.repeat && start()}
            onKeyUp={(e) => (e.key === " " || e.key === "Enter") && stop()}
            disabled={state === "transcribing" || state === "replying"}
            className={cx(
              "flex min-h-20 select-none items-center justify-center gap-3 rounded-2xl text-lg font-bold transition",
              state === "recording" ? "bg-stamp text-cream" : "bg-white/10 text-cream hover:bg-white/15",
              (state === "transcribing" || state === "replying") && "opacity-60",
            )}
          >
            <Mic className={cx("size-6", state === "recording" && "animate-pulse")} aria-hidden />
            {state === "recording"
              ? `Listening… ${Math.ceil((MAX_RECORD_MS - elapsed) / 1000)}s left, release to send`
              : state === "transcribing"
                ? "Transcribing…"
                : state === "replying"
                  ? "Writing a reply…"
                  : "Hold to talk"}
          </button>
        )}
        <p className="text-xs text-haze">Only records while the button is held (max 20 s). Nothing listens in the background. Replies play on the TV only.</p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-haze">Language</span>
            <select className="input !w-auto !py-1" value={lang} onChange={(e) => setLang(e.target.value as "auto" | Lang)} aria-label="Language override">
              <option value="auto">Auto</option>
              <option value="en">English</option>
              <option value="bn">বাংলা</option>
            </select>
          </label>
          <Toggle on={auto} label="Reply automatically" onChange={setAuto} />
          <Toggle on={thinking} label="Thinking line while waiting" onChange={setThinking} />
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-haze">What Mez said {heardLang && `(heard as ${heardLang === "bn" ? "Bangla" : "English"})`}. Fix any mistakes, then reply.</span>
          <textarea className="input resize-none" rows={2} maxLength={400} value={transcript} onChange={(e) => setTranscript(e.target.value)} aria-label="Transcript" placeholder="Transcript appears here, or type it" />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={transcript.trim().length < 2 || state !== "idle"} onClick={() => askReply(transcript, true)}>
            <Play className="size-4" aria-hidden /> Reply on TV
          </Button>
          <Button disabled={transcript.trim().length < 2 || state !== "idle"} onClick={() => askReply(transcript, false)}>
            Draft reply only
          </Button>
          <Button variant="danger" onClick={() => act({ type: "host/stopSpeech" })}>
            <Square className="size-4" aria-hidden /> Stop
          </Button>
        </div>
        {reply && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
            <p lang={reply.lang} className={reply.lang === "bn" ? "font-bangla" : ""}>
              {reply.text}
            </p>
            <p className="mt-1 font-mono text-xs text-haze">
              {reply.meta} · {reply.spoken ? "spoken on TV" : "draft"}
            </p>
            {!reply.spoken && (
              <Button className="mt-2" onClick={() => act({ type: "host/say", text: { [reply.lang]: reply.text }, lang: reply.lang, source: "conversation" })}>
                Say on TV
              </Button>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-stamp">
            {error}
          </p>
        )}
      </div>
    </Card>
  );
}

interface StatusBody {
  chains: { kind: string; providers: { id: string; configured: boolean; resting: boolean; calls: number; failures: number; avgMs: number | null; lastError: string | null }[] }[];
  narration: { total: number; en: number; bn: number; placeholders: number; stale: number; approved: number };
  geminiVoices: { model: string; available: boolean; until: number | null }[];
  playback: { utteranceId: string; lang: Lang; via: string; provider?: string; latencyMs: number; error?: string; at: number }[];
}

const VIA_TONE: Record<string, string> = { clip: "text-go", live: "text-go", "fallback-clip": "text-gold", browser: "text-gold", captions: "text-stamp" };

/** Provider health, narration readiness, and what the TV actually played. */
export function HostStatus({ hostKey }: { hostKey: string }) {
  const [status, setStatus] = useState<StatusBody | null>(null);
  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const res = await fetch("/api/host/status", { headers: { "x-host-key": hostKey } });
        if (res.ok && live) setStatus(await res.json());
      } catch {}
    };
    void load();
    const id = setInterval(load, 4000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [hostKey]);

  if (!status) return <Card title="Voice system">Loading…</Card>;
  const n = status.narration;
  return (
    <Card title="Voice system">
      <div className="flex flex-col gap-4 text-sm">
        <div>
          <div className="mb-1 text-xs uppercase tracking-widest text-haze">Pre-recorded narration</div>
          <p>
            English {n.en}/{n.total} · Bangla {n.bn}/{n.total} · <span className={n.approved ? "text-go" : "text-gold"}>{n.approved} approved for the TV</span>
            {n.placeholders > 0 && <span className="text-gold"> · {n.placeholders} robotic placeholders</span>}
            {n.stale > 0 && <span className="text-stamp"> · {n.stale} out of date</span>}
          </p>
          {(n.placeholders > 0 || n.en + n.bn < n.total * 2) && (
            <p className="mt-1 text-xs text-haze">
              Run <code className="text-gold">npm run narration:render</code> once a cloud voice is configured, then review clips in <a className="text-gold underline" href="/admin/host">AI host setup</a>.
            </p>
          )}
        </div>
        {status.geminiVoices.length > 0 && (
          <div>
            <div className="mb-1 text-xs uppercase tracking-widest text-haze">Gemini voice quota (10 lines/day per model, free tier)</div>
            <ul className="flex flex-col gap-0.5 font-mono text-xs">
              {status.geminiVoices.map((v) => (
                <li key={v.model} className={v.available ? "text-cream" : "text-stamp"}>
                  {v.model} — {v.available ? "available" : `used up until ${new Date(v.until!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                </li>
              ))}
            </ul>
          </div>
        )}
        {status.chains.map((c) => (
          <div key={c.kind}>
            <div className="mb-1 text-xs uppercase tracking-widest text-haze">
              {c.kind === "tts" ? "Speech (TTS)" : c.kind === "llm" ? "Commentary (LLM)" : "Listening (STT)"} — tried in this order
            </div>
            <ul className="flex flex-col gap-1">
              {c.providers.map((p) => (
                <li key={p.id} className="flex flex-wrap items-baseline gap-x-2 font-mono text-xs">
                  <span className={cx("font-semibold", p.configured ? (p.resting ? "text-stamp" : "text-cream") : "text-haze line-through")}>{p.id}</span>
                  <span className="text-haze">
                    {!p.configured ? "no key" : p.resting ? "resting after failures" : p.calls ? `${p.calls} calls · ${p.failures} failed · ~${p.avgMs ?? "–"} ms` : "ready"}
                  </span>
                  {p.lastError && p.configured && <span className="w-full truncate text-stamp/80" title={p.lastError}>{p.lastError}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div>
          <div className="mb-1 text-xs uppercase tracking-widest text-haze">Played on the TV</div>
          {status.playback.length === 0 ? (
            <p className="text-xs text-haze">Nothing yet. Open the TV display and turn its sound on.</p>
          ) : (
            <ul className="flex flex-col gap-1 font-mono text-xs">
              {status.playback.map((p, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-haze">{p.lang}</span>
                  <span className={VIA_TONE[p.via]}>{p.via}</span>
                  <span>{p.provider ?? ""}</span>
                  <span className="ml-auto tabular-nums text-haze">{p.latencyMs} ms</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}

interface SurpriseList {
  announcements: { id: string; title: string; text: { en: string; bn: string }; prepared: Partial<Record<Lang, string>> }[];
  memories: { id: string; name: string; remote: boolean; memory: string; hasPhoto: boolean }[];
}

/** Surprise mode: trigger approved announcements or reveal a guest's memory on the TV. */
export function SurpriseControl({ view, act, hostKey }: { view: RoomView; act: Act; hostKey: string }) {
  const [list, setList] = useState<SurpriseList | null>(null);
  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const res = await fetch("/api/host/surprises", { headers: { "x-host-key": hostKey } });
        if (res.ok && live) setList(await res.json());
      } catch {}
    };
    void load();
    const id = setInterval(load, 20_000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [hostKey]);
  const busy = !!view.games.game || view.phase === "question";
  return (
    <Card title="Surprises" aside={<a href="/admin/host" className="text-xs text-gold hover:underline">Write & approve</a>}>
      {view.phase === "surprise" && (
        <Button variant="primary" className="mb-3 w-full" onClick={() => act({ type: "host/surprise/end" })}>
          End surprise & go back
        </Button>
      )}
      {busy && <p className="mb-2 text-xs text-gold">Finish the current game or question first.</p>}
      {!list ? (
        <p className="text-sm text-haze">Loading…</p>
      ) : list.announcements.length + list.memories.length === 0 ? (
        <p className="text-sm text-haze">Nothing approved yet. Write announcements in AI host setup; memories come from approved invite submissions.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {list.announcements.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {list.announcements.map((a) => (
                <li key={a.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    <strong>{a.title}</strong>
                    <span className="ml-2 font-mono text-xs text-haze">
                      {(["en", "bn"] as const).filter((l) => a.text[l]).map((l) => `${l}: ${a.prepared[l] ?? "…"}`).join(" · ")}
                    </span>
                  </span>
                  <Button disabled={busy} onClick={() => act({ type: "host/surprise/show", kind: "announcement", id: a.id } as never)}>
                    Play
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {list.memories.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {list.memories.map((m) => (
                <li key={m.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate" title={m.memory}>
                    <strong>{m.name}</strong>
                    {m.remote && <span className="ml-1 text-tile-b">remote</span>}
                    {m.hasPhoto && <span className="ml-1 text-haze">+ photo</span>}: <span className="text-haze">{m.memory}</span>
                  </span>
                  <Button disabled={busy} onClick={() => act({ type: "host/surprise/show", kind: "memory", id: m.id } as never)}>
                    Reveal
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
