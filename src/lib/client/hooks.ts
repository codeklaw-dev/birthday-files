"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  window.addEventListener("storage", l);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", l);
  };
};

type Kind = "local" | "session";
const area = (kind: Kind) => (kind === "local" ? window.localStorage : window.sessionStorage);

function read(kind: Kind, key: string): string | null {
  try {
    return area(kind).getItem(key);
  } catch {
    return null;
  }
}

/**
 * A string persisted in web storage. Returns `undefined` on the server and
 * during hydration, then the stored value (or null).
 */
export function useStored(kind: Kind, key: string) {
  const value = useSyncExternalStore<string | null | undefined>(
    subscribe,
    () => read(kind, key),
    () => undefined,
  );
  const set = useCallback(
    (next: string | null) => {
      try {
        if (next === null) area(kind).removeItem(key);
        else area(kind).setItem(key, next);
      } catch {}
      emit();
    },
    [kind, key],
  );
  return [value, set] as const;
}

/** Stable secret identifying this phone, created on first use. */
export function usePlayerToken(): string | undefined {
  const [token, setToken] = useStored("local", "bf.token");
  useEffect(() => {
    if (token === null) setToken(crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  }, [token, setToken]);
  return token ?? undefined;
}

/** Current time, ticking. Null until mounted (keeps prerendering deterministic). */
export function useNow(intervalMs = 250): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [intervalMs]);
  return now;
}

/** Everything this phone remembers about its guest (invite answers, profile, game identity). */
const GUEST_KEYS = ["bf.attendance", "bf.profile", "bf.wished", "bf.token"];

/** "Not you?": forget the guest on this phone so someone else can start fresh. */
export function forgetGuest() {
  for (const key of GUEST_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {}
  }
  emit();
}
