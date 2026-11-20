"use client";

import { useState, type ReactNode } from "react";
import { Button, Field, Logo } from "@/components/ui";

/** Asks for a key and checks it with the server before unlocking a private screen. */
export function KeyGate({
  title,
  description,
  label,
  checkUrl,
  onUnlock,
}: {
  title: string;
  description: ReactNode;
  label: string;
  checkUrl: string;
  onUnlock: (key: string) => void;
}) {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main className="stage grid flex-1 place-items-center px-4">
      <form
        className="panel flex w-full max-w-sm flex-col gap-5 p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const res = await fetch(checkUrl, { method: "POST", headers: { "x-host-key": key } }).catch(() => null);
          setBusy(false);
          if (res?.ok) onUnlock(key);
          else setError(res ? "That key doesn't match." : "Can't reach the server.");
        }}
      >
        <Logo size="sm" />
        <div>
          <h1 className="font-display text-2xl font-extrabold">{title}</h1>
          <p className="mt-1 text-sm text-haze">{description}</p>
        </div>
        <Field label={label}>
          <input type="password" required autoFocus value={key} onChange={(e) => setKey(e.target.value)} className="input" autoComplete="current-password" />
        </Field>
        {error && (
          <p role="alert" className="text-sm text-stamp">
            {error}
          </p>
        )}
        <Button variant="primary" type="submit" disabled={busy}>
          {busy ? "Checking…" : "Unlock"}
        </Button>
      </form>
    </main>
  );
}
