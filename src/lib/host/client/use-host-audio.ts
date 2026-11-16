"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomView } from "@/lib/game/types";
import { AudioDirector, type DirectorState } from "./audio-director";

/** Lines older than this when the TV (re)connects are shown, not spoken. */
const STALE_MS = 15_000;

export function useHostAudio(view: RoomView | null) {
  const directorRef = useRef<AudioDirector | null>(null);
  const [state, setState] = useState<DirectorState>({ unlocked: false, speaking: null });
  const first = useRef(true);
  const lastSfx = useRef<string | null | undefined>(undefined);
  const lastStop = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const d = new AudioDirector();
    directorRef.current = d;
    const off = d.subscribe(setState);
    void d.init();
    return () => {
      off();
      d.stop();
    };
  }, []);

  const host = view?.host;
  const serverNow = view?.serverNow;
  useEffect(() => {
    const d = directorRef.current;
    if (!d || !host || serverNow === undefined) return;
    const u = host.utterance;
    if (first.current) {
      first.current = false;
      lastSfx.current = host.sfx?.id ?? null;
      lastStop.current = host.stopId;
      if (serverNow - u.at > STALE_MS) {
        d.skip(u.id);
        return;
      }
    }
    if (host.stopId !== lastStop.current) {
      lastStop.current = host.stopId;
      d.stop();
    }
    if (host.sfx && host.sfx.id !== lastSfx.current) {
      lastSfx.current = host.sfx.id;
      d.sfx(host.sfx.kind);
    }
    d.say(u, { voice: host.voice });
  }, [host, serverNow]);

  const unlock = useCallback(() => directorRef.current?.unlock(), []);
  const clipIfIdle = useCallback((key: string, lang: "en" | "bn") => directorRef.current?.clipIfIdle(key, lang), []);
  const sfx = useCallback((kind: Parameters<AudioDirector["sfx"]>[0]) => directorRef.current?.sfx(kind), []);
  return { ...state, unlock, clipIfIdle, sfx };
}
