import "server-only";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { open } from "node:fs/promises";
import type { Lang } from "@/lib/game/types";
import { routeTts, type Attempt } from "./router";
import type { Audio } from "./types";

/**
 * Text-to-speech with caching and request de-duplication.
 * Identical lines are synthesised once (memory + disk), which matters a lot on
 * free tiers with small daily quotas.
 */
// Resolved at call time from an env var, so the bundler doesn't try to trace the whole project.
const cacheDir = () => process.env.TTS_CACHE_DIR || ".cache/tts";
// Plain string paths (not path.join with dynamic parts) keep the bundler from tracing the whole project.
const cacheFile = (key: string, extension: string) => `${cacheDir()}/${key}.${extension}`;
const MEMORY = 60;

interface Entry {
  audio: Audio;
  provider: string;
  ms: number;
  attempts: Attempt[];
  cached: boolean;
}

const g = globalThis as unknown as { __ttsMem?: Map<string, Entry>; __ttsInflight?: Map<string, Promise<Entry>> };
const mem = (g.__ttsMem ??= new Map());
const inflight = (g.__ttsInflight ??= new Map());

const keyFor = (text: string, lang: Lang) =>
  createHash("sha256")
    .update(`${process.env.HOST_VOICE_VERSION ?? "1"}|${lang}|${text}`)
    .digest("hex")
    .slice(0, 32);

const ext = (mime: string) => (mime === "audio/mpeg" ? "mp3" : mime === "audio/wav" ? "wav" : "bin");

async function readDisk(key: string): Promise<Entry | null> {
  for (const [e, mime] of [["wav", "audio/wav"], ["mp3", "audio/mpeg"]] as const) {
    try {
      const fh = await open(cacheFile(key, e));
      const buf = await fh.readFile().finally(() => fh.close());
      const bytes = new Uint8Array(new ArrayBuffer(buf.length));
      bytes.set(buf);
      return { audio: { bytes, mime }, provider: "cache", ms: 0, attempts: [], cached: true };
    } catch {}
  }
  return null;
}

function remember(key: string, entry: Entry) {
  mem.set(key, entry);
  if (mem.size > MEMORY) mem.delete(mem.keys().next().value!);
}

export async function speech(text: string, lang: Lang, timeoutMs?: number): Promise<Entry> {
  const key = keyFor(text, lang);
  const hit = mem.get(key) ?? (await readDisk(key));
  if (hit) {
    remember(key, hit);
    return { ...hit, cached: true, ms: 0 };
  }
  const pending = inflight.get(key);
  if (pending) return pending;

  const job = (async () => {
    const r = await routeTts(text, lang, timeoutMs);
    const entry: Entry = { audio: r.value, provider: r.provider, ms: r.ms, attempts: r.attempts, cached: false };
    // Don't persist mock chirps: once a real provider is configured we want real speech.
    if (!r.provider.startsWith("mock")) {
      remember(key, entry);
      try {
        mkdirSync(cacheDir(), { recursive: true });
        writeFileSync(cacheFile(key, ext(r.value.mime)), r.value.bytes);
      } catch {}
    }
    return entry;
  })().finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}
