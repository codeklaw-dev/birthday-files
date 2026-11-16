"use client";

import type { SfxKind } from "@/lib/host/types";

/**
 * Game-show sound effects synthesised with Web Audio: no files, no network,
 * nothing that can fail to load on the night.
 */
export function playSfx(ctx: AudioContext, kind: SfxKind, volume = 0.5) {
  const out = ctx.createGain();
  out.gain.value = volume;
  out.connect(ctx.destination);
  const t = ctx.currentTime + 0.02;

  const tone = (type: OscillatorType, freq: number, start: number, dur: number, gain = 0.4, glideTo?: number) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, start + dur);
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(gain, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(out);
    o.start(start);
    o.stop(start + dur + 0.05);
  };

  const noise = (start: number, dur: number, gain: number, filter?: { type: BiquadFilterType; freq: number; to?: number }) => {
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    let node: AudioNode = src;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = filter.type;
      f.frequency.setValueAtTime(filter.freq, start);
      if (filter.to) f.frequency.exponentialRampToValueAtTime(filter.to, start + dur);
      node = node.connect(f);
    }
    node.connect(g).connect(out);
    src.start(start);
  };

  switch (kind) {
    case "ding":
      tone("sine", 880, t, 0.5);
      tone("sine", 1320, t + 0.12, 0.8);
      break;
    case "buzzer":
      tone("sawtooth", 110, t, 0.7, 0.35);
      tone("square", 116, t, 0.7, 0.15);
      break;
    case "tick":
      tone("square", 1200, t, 0.04, 0.2);
      break;
    case "whoosh":
      noise(t, 0.6, 0.5, { type: "bandpass", freq: 300, to: 4000 });
      break;
    case "drumroll":
      for (let i = 0; i < 40; i++) noise(t + i * 0.05, 0.05, 0.1 + i * 0.012, { type: "lowpass", freq: 900 });
      noise(t + 2.05, 1.2, 0.7, { type: "highpass", freq: 3000 });
      tone("sine", 70, t + 2.05, 0.5, 0.6);
      break;
    case "fanfare":
      [523, 659, 784].forEach((f, i) => tone("triangle", f, t + i * 0.15, 0.18, 0.35));
      [523, 659, 784, 1047].forEach((f) => tone("triangle", f, t + 0.5, 1.2, 0.22));
      break;
    case "applause":
      for (let i = 0; i < 60; i++) noise(t + i * 0.045 + Math.random() * 0.03, 0.08, 0.15 + Math.random() * 0.2, { type: "bandpass", freq: 1500 + Math.random() * 2500 });
      break;
    case "airhorn":
      for (let i = 0; i < 3; i++) {
        tone("sawtooth", 440, t + i * 0.32, 0.26, 0.25);
        tone("sawtooth", 466, t + i * 0.32, 0.26, 0.2);
      }
      break;
  }
}

/** Which effect, if any, accompanies a scripted cue. */
export function cueSfx(cue: string, clip?: string): SfxKind | null {
  if (cue === "reveal") return clip === "reveal_nobody" ? "buzzer" : "ding";
  if (cue === "leaderboard") return "whoosh";
  if (cue === "cakeDone" || cue === "finished") return "fanfare";
  return null;
}
