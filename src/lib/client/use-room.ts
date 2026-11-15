"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HostAction, PlayerAction, Role, RoomView } from "@/lib/game/types";

export type ConnectionStatus = "connecting" | "live" | "reconnecting";

export interface RoomConnection {
  view: RoomView | null;
  status: ConnectionStatus;
  /** Server clock minus local clock, for countdowns. */
  clockOffset: number;
  send: (action: PlayerAction | HostAction) => Promise<{ ok: boolean; error?: string }>;
}

/**
 * The single client-side seam to the realtime backend. Screens only use this
 * hook, so swapping SSE for Supabase Realtime touches this file alone.
 */
export function useRoom(role: Role, opts: { token?: string | null; hostKey?: string | null; enabled?: boolean } = {}): RoomConnection {
  const { token = null, hostKey = null, enabled = true } = opts;
  const [view, setView] = useState<RoomView | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const offset = useRef(0);
  const [clockOffset, setClockOffset] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const qs = new URLSearchParams({ role });
    if (token) qs.set("token", token);
    if (hostKey) qs.set("key", hostKey);
    const source = new EventSource(`/api/room/stream?${qs}`);
    source.onopen = () => setStatus("live");
    source.onerror = () => setStatus("reconnecting"); // EventSource retries by itself
    source.onmessage = (e) => {
      const next = JSON.parse(e.data) as RoomView;
      const o = next.serverNow - Date.now();
      if (Math.abs(o - offset.current) > 500) {
        offset.current = o;
        setClockOffset(o);
      }
      setView((prev) => (prev && prev.rev > next.rev ? prev : next));
    };
    return () => source.close();
  }, [role, token, hostKey, enabled]);

  const send = useCallback<RoomConnection["send"]>(
    async (action) => {
      try {
        const res = await fetch("/api/room/action", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(hostKey ? { "x-host-key": hostKey } : {}) },
          body: JSON.stringify(action),
        });
        const body = await res.json().catch(() => ({}));
        return res.ok ? { ok: true } : { ok: false, error: body.error ?? "Something went wrong." };
      } catch {
        return { ok: false, error: "Can't reach the game. Check your connection." };
      }
    },
    [hostKey],
  );

  return { view, status, clockOffset, send };
}
