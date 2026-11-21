"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { Mic, MicOff } from "lucide-react";
import { cx } from "@/components/ui";
import { getTvVoice } from "@/lib/casper";

/**
 * Live voice mode: the TV listens, and when someone says "Casper, …" it asks
 * Claude (via /api/casper/chat) and speaks the answer. Uses the browser's own
 * speech recognition (Chrome / Edge / Safari).
 */

type Status = "off" | "listening" | "thinking" | "speaking" | "error";
interface Turn {
  role: "user" | "assistant";
  text: string;
}

// Minimal typing for the Web Speech API (not in lib.dom for every TS version).
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult:
    | ((e: {
        resultIndex: number;
        results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;
const recognitionCtor = (): RecognitionCtor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

const WAKE = /\b(c|k)asp[ae]r'?s?\b/i;
/** After Casper answers, people can reply without saying his name for a few seconds. */
const FOLLOW_UP_MS = 9000;

const noSubscribe = () => () => {};

export function VoiceMode({ fallback }: { fallback?: React.ReactNode }) {
  const canListen = useSyncExternalStore(noSubscribe, () => !!recognitionCtor(), () => false);
  const [serverReady, setServerReady] = useState(false);
  useEffect(() => {
    let live = true;
    fetch("/api/casper/chat")
      .then((r) => r.json())
      .then((d: { enabled?: boolean }) => live && setServerReady(!!d.enabled))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const supported = canListen && serverReady;
  const [status, setStatus] = useState<Status>("off");
  const [heard, setHeard] = useState("");
  const [said, setSaid] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const rec = useRef<Recognition | null>(null);
  const on = useRef(false);
  const busy = useRef(false);
  const history = useRef<Turn[]>([]);
  const followUpUntil = useRef(0);

  const resume = useCallback(() => {
    if (!on.current || busy.current) return;
    try {
      rec.current?.start();
    } catch {
      /* already running */
    }
    setStatus("listening");
  }, []);

  const ask = useCallback(
    async (text: string) => {
      busy.current = true;
      rec.current?.abort();
      setStatus("thinking");
      setSaid("");
      try {
        const res = await fetch("/api/casper/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text, history: history.current }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          reply?: string;
          error?: string;
        };
        if (!res.ok || !data.reply) {
          if (res.status === 503) {
            on.current = false;
            setStatus("error");
            setNote(
              "Voice mode needs a Claude API key on the server (ANTHROPIC_API_KEY).",
            );
            return;
          }
          setNote(data.error ?? "Casper didn't catch that.");
          return;
        }
        history.current = [
          ...history.current,
          { role: "user" as const, text },
          { role: "assistant" as const, text: data.reply },
        ].slice(-10);
        setSaid(data.reply);
        setNote(null);
        setStatus("speaking");
        await getTvVoice()?.say({
          text: { en: data.reply, bn: "" },
          lang: "en",
        });
        followUpUntil.current = Date.now() + FOLLOW_UP_MS;
      } catch {
        setNote("Casper lost connection. Try again.");
      } finally {
        busy.current = false;
        resume();
      }
    },
    [resume],
  );

  const start = () => {
    const Ctor = recognitionCtor();
    const voice = getTvVoice();
    if (!Ctor) return;
    voice?.enable(); // the click unlocks sound for Casper's replies
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-GB";
    r.onresult = (e) => {
      if (busy.current || getTvVoice()?.isSpeaking) return; // don't listen to ourselves
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const text = result[0].transcript.trim();
        if (!result.isFinal) {
          interim += ` ${text}`;
          continue;
        }
        setHeard(text);
        if (text && (WAKE.test(text) || Date.now() < followUpUntil.current))
          void ask(text);
      }
      if (interim.trim()) setHeard(interim.trim());
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        on.current = false;
        setStatus("error");
        setNote(
          "Microphone blocked. Allow the mic for this site, then try again.",
        );
      }
    };
    r.onend = () => {
      // Browsers stop listening after a pause; keep going while voice mode is on.
      if (on.current && !busy.current) setTimeout(resume, 250);
    };
    rec.current = r;
    on.current = true;
    setNote(null);
    resume();
  };

  const stop = () => {
    on.current = false;
    rec.current?.abort();
    rec.current = null;
    setStatus("off");
    setHeard("");
    setSaid("");
  };

  useEffect(
    () => () => {
      on.current = false;
      rec.current?.abort();
    },
    [],
  );

  if (!supported) return <>{fallback}</>;
  const active = status !== "off" && status !== "error";

  return (
    <>
      <button
        type="button"
        aria-pressed={active}
        onClick={() => (active ? stop() : start())}
        className={cx(
          "inline-flex items-center gap-[0.5vw] rounded-full px-[1.2vw] py-[0.8vh] font-bold shadow-[0_0.4vh_0_rgb(0_0_0/0.2)]",
          active
            ? "bg-party-mint text-party-ink"
            : "animate-wiggle bg-party-pink text-white",
        )}
      >
        {active ? (
          <Mic aria-hidden className="size-[2vh]" />
        ) : (
          <MicOff aria-hidden className="size-[2vh]" />
        )}
        {active ? "Voice mode on" : "Turn on voice"}
      </button>

      {(active || note) &&
        createPortal(
          <div
            className="pointer-events-none fixed bottom-[5vh] left-[2vw] z-50 flex max-w-[46vw] items-end gap-[1vw]"
            aria-live="polite"
          >
            <span className="relative grid size-[9vh] shrink-0 place-items-center">
              {active && (
                <span
                  className={cx(
                    "absolute inset-0 rounded-full opacity-60",
                    status === "listening" && "animate-ping bg-party-mint",
                    status === "thinking" && "animate-pulse bg-party-sun",
                    status === "speaking" && "animate-ping bg-party-pink",
                  )}
                />
              )}
              <span
                className={cx(
                  "relative grid size-[8vh] place-items-center rounded-full text-[4vh] shadow-[0_0.6vh_0_rgb(0_0_0/0.25)]",
                  active ? "bg-white" : "bg-white/70",
                )}
              >
                {status === "thinking"
                  ? "🤔"
                  : status === "speaking"
                    ? "🗣️"
                    : "👂"}
              </span>
            </span>
            <div className="flex flex-col gap-[0.8vh]">
              {note && (
                <p className="rounded-[2vh] bg-party-berry px-[1.2vw] py-[1vh] text-[2vh] font-semibold text-white">
                  {note}
                </p>
              )}
              {active && status === "listening" && !said && (
                <p className="w-fit rounded-full bg-party-ink/60 px-[1.2vw] py-[0.8vh] text-[1.9vh] font-semibold text-white">
                  Say{" "}
                  <strong className="text-party-yellow">
                    &ldquo;Casper, …&rdquo;
                  </strong>{" "}
                  to talk to me
                </p>
              )}
              {heard && (
                <p className="w-fit max-w-full truncate rounded-[2vh] bg-white/85 px-[1.2vw] py-[0.8vh] text-[2vh] italic text-party-ink">
                  &ldquo;{heard}&rdquo;
                </p>
              )}
              {said && (
                <p className="rounded-[2vh] bg-party-yellow px-[1.4vw] py-[1.2vh] font-party text-[2.8vh] leading-snug text-party-ink shadow-[0_0.6vh_0_rgb(0_0_0/0.2)]">
                  {said}
                </p>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
