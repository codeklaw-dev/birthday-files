"use client";

import type { Lang } from "@/lib/game/types";
import { EMPTY_MANIFEST, MANIFEST_URL, type NarrationManifest } from "@/lib/host/narration";
import type { SfxKind, Utterance } from "@/lib/host/types";
import { cueSfx, playSfx } from "./sfx";

/**
 * Plays the AI host on the TV.
 *
 * For each line and language it takes the first source that works:
 *   1. a pre-recorded clip of exactly this line           (instant, offline)
 *   2. live cloud speech from /api/host/speech            (cached server-side)
 *   3. a pre-recorded generic clip with the same meaning  (fallbackClip)
 *   4. the browser's own voice, if it has one for the language
 *   5. captions only — always on screen anyway
 * and reports what it used to the host dashboard.
 */

export type Via = "clip" | "live" | "fallback-clip" | "browser" | "captions";

export interface DirectorState {
  unlocked: boolean;
  speaking: { utteranceId: string; lang: Lang; via: Via } | null;
}

interface Job {
  u: Utterance;
  lang: Lang;
  live: Promise<{ url: string; provider: string } | null> | null;
  queuedAt: number;
}

const LIVE_TIMEOUT_MS = 7000;
const MAX_PENDING_LINES = 2;

export class AudioDirector {
  private ctx: AudioContext | null = null;
  private audio: HTMLAudioElement | null = null;
  private queue: Job[] = [];
  private busy = false;
  private seen = new Set<string>();
  private manifest: NarrationManifest = EMPTY_MANIFEST;
  private stopToken = 0;
  private volume = 0.9;
  private muted = false;
  private refresher: ReturnType<typeof setInterval> | null = null;
  private state: DirectorState = { unlocked: false, speaking: null };
  private listeners = new Set<(s: DirectorState) => void>();

  constructor(private readonly report = true) {}

  async init() {
    await this.loadManifest();
    // Approvals can change during the show; pick them up without a reload.
    this.refresher = setInterval(() => void this.loadManifest(), 20_000);
    // Kiosk browsers launched with an autoplay flag start unlocked.
    try {
      this.ctx = new AudioContext();
      if (this.ctx.state === "running") this.set({ unlocked: true });
    } catch {}
  }

  private async loadManifest() {
    try {
      const res = await fetch(MANIFEST_URL, { cache: "no-store" });
      if (res.ok) this.manifest = await res.json();
    } catch {}
  }

  dispose() {
    if (this.refresher) clearInterval(this.refresher);
    this.stop();
  }

  /** TV volume (0–1) and mute-everything, from the host dashboard. */
  setLevels(volume: number, muted: boolean) {
    this.volume = Math.min(1, Math.max(0, volume));
    this.muted = muted;
    if (this.audio) this.audio.volume = this.muted ? 0 : this.volume;
    if (muted) this.stop();
  }

  subscribe(fn: (s: DirectorState) => void) {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<DirectorState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  /** Must be called from a click/tap: browsers block sound until then. */
  async unlock() {
    this.ctx ??= new AudioContext();
    await this.ctx.resume().catch(() => {});
    this.audio ??= new Audio();
    // Prime the element inside the gesture with a silent clip.
    this.audio.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";
    await this.audio.play().catch(() => {});
    if (typeof speechSynthesis !== "undefined") speechSynthesis.getVoices();
    this.set({ unlocked: this.ctx.state === "running" });
    this.pump();
  }

  get unlocked() {
    return this.state.unlocked;
  }

  sfx(kind: SfxKind) {
    if (this.ctx && this.state.unlocked && !this.muted) playSfx(this.ctx, kind, 0.55 * this.volume);
  }

  /**
   * Queue a line. Scripted and host-typed lines move the show forward, so they
   * cut off whatever is still playing; quips, AI lines and conversation replies
   * wait their turn behind it. Already-seen ids are ignored.
   */
  say(u: Utterance, opts: { voice: boolean; playCueSfx?: boolean }) {
    if (this.seen.has(u.id)) return;
    this.seen.add(u.id);
    if (u.source === "script" || u.source === "host") this.interrupt();
    if (opts.playCueSfx !== false) {
      const fx = cueSfx(u.cue, u.clip);
      if (fx) this.sfx(fx);
    }
    if (!opts.voice || this.muted) return;
    const langs: Lang[] = u.lang === "both" ? ["en", "bn"] : [u.lang];
    const jobs = langs.map((lang) => ({ u, lang, live: this.needsLive(u, lang) ? this.fetchLive(u, lang) : null, queuedAt: performance.now() }));
    this.queue.push(...jobs);
    // Drop stale lines if the show moved on faster than the host could talk.
    const ids = [...new Set(this.queue.map((j) => j.u.id))];
    if (ids.length > MAX_PENDING_LINES) {
      const keep = new Set(ids.slice(-MAX_PENDING_LINES));
      this.queue = this.queue.filter((j) => keep.has(j.u.id));
    }
    this.pump();
  }

  /** Mark a line as already handled without speaking it (e.g. stale on page load). */
  skip(id: string) {
    this.seen.add(id);
  }

  /** Short pre-recorded cue (like the 5-second warning), only if idle. */
  clipIfIdle(key: string, lang: Lang) {
    if (this.busy || !this.state.unlocked) return;
    const c = this.manifest.clips[key]?.[lang];
    if (c) void this.playUrl(`/narration/${c.file}`, this.stopToken);
  }

  private interrupt() {
    if (!this.busy && this.queue.length === 0) return;
    this.stop();
  }

  stop() {
    this.stopToken++;
    this.queue = [];
    this.audio?.pause();
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    this.set({ speaking: null });
  }

  private clipUrl(key: string | undefined, lang: Lang, text?: string): string | null {
    const c = key ? this.manifest.clips[key]?.[lang] : undefined;
    if (!c || (text !== undefined && c.text !== text)) return null;
    return `/narration/${c.file}`;
  }

  private needsLive(u: Utterance, lang: Lang) {
    return !this.clipUrl(u.clip, lang, u.text[lang]);
  }

  private async fetchLive(u: Utterance, lang: Lang): Promise<{ url: string; provider: string } | null> {
    try {
      const res = await fetch(`/api/host/speech?u=${encodeURIComponent(u.id)}&lang=${lang}`, { signal: AbortSignal.timeout(LIVE_TIMEOUT_MS) });
      if (!res.ok) return null;
      const provider = res.headers.get("X-Host-Provider") ?? "?";
      const blob = await res.blob();
      return { url: URL.createObjectURL(blob), provider };
    } catch {
      return null;
    }
  }

  private async pump() {
    if (this.busy || !this.state.unlocked) return;
    const job = this.queue.shift();
    if (!job) return;
    this.busy = true;
    const token = this.stopToken;
    try {
      await this.perform(job, token);
    } finally {
      this.busy = false;
      if (token === this.stopToken) this.set({ speaking: null });
      setTimeout(() => this.pump(), 150);
    }
  }

  private async perform({ u, lang, live, queuedAt }: Job, token: number) {
    const text = u.text[lang];
    const started = performance.now();
    const done = (via: Via, provider?: string, error?: string) =>
      this.sendReport({ utteranceId: u.id, lang, via, provider, latencyMs: Math.round(performance.now() - queuedAt), error });

    const exact = this.clipUrl(u.clip, lang, text);
    if (exact) {
      this.set({ speaking: { utteranceId: u.id, lang, via: "clip" } });
      done("clip", "narration");
      if (await this.playUrl(exact, token)) return;
    }
    if (token !== this.stopToken) return;

    const got = live ? await live : null;
    if (token !== this.stopToken) return;
    if (got) {
      this.set({ speaking: { utteranceId: u.id, lang, via: "live" } });
      done("live", got.provider);
      const ok = await this.playUrl(got.url, token);
      URL.revokeObjectURL(got.url);
      if (ok) return;
    }

    const fallback = this.clipUrl(u.fallbackClip, lang);
    if (fallback) {
      this.set({ speaking: { utteranceId: u.id, lang, via: "fallback-clip" } });
      done("fallback-clip", "narration", "live speech unavailable");
      if (await this.playUrl(fallback, token)) return;
    }

    if (await this.browserSpeak(text, lang, token, u.id)) {
      done("browser", "speechSynthesis", "no cloud or recorded audio");
      return;
    }

    // Captions only: pause roughly as long as the line would take to say.
    this.set({ speaking: { utteranceId: u.id, lang, via: "captions" } });
    done("captions", undefined, "no audio source available");
    const until = started + Math.min(8000, 1200 + text.length * 55);
    while (performance.now() < until && token === this.stopToken) await new Promise((r) => setTimeout(r, 100));
  }

  private playUrl(url: string, token: number): Promise<boolean> {
    return new Promise((resolve) => {
      this.audio ??= new Audio();
      const a = this.audio;
      a.volume = this.muted ? 0 : this.volume;
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        a.onended = a.onerror = a.onpause = null;
        resolve(ok);
      };
      a.onended = () => finish(true);
      a.onerror = () => finish(false);
      a.onpause = () => token !== this.stopToken && finish(true);
      a.src = url;
      a.play().catch((err: DOMException) => {
        if (err?.name === "NotAllowedError") this.set({ unlocked: false });
        finish(false);
      });
    });
  }

  private browserSpeak(text: string, lang: Lang, token: number, id: string): Promise<boolean> {
    if (typeof speechSynthesis === "undefined") return Promise.resolve(false);
    const voice = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang));
    if (!voice) return Promise.resolve(false);
    return new Promise((resolve) => {
      const utter = new SpeechSynthesisUtterance(text);
      utter.volume = this.muted ? 0 : this.volume;
      utter.voice = voice;
      utter.lang = voice.lang;
      utter.onend = () => resolve(token === this.stopToken);
      utter.onerror = () => resolve(false);
      this.set({ speaking: { utteranceId: id, lang, via: "browser" } });
      speechSynthesis.speak(utter);
    });
  }

  private sendReport(r: { utteranceId: string; lang: Lang; via: Via; provider?: string; latencyMs: number; error?: string }) {
    if (!this.report) return;
    void fetch("/api/host/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(r), keepalive: true }).catch(() => {});
  }
}
