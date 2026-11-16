import type { Bilingual } from "@/lib/game/types";
import { LINES } from "./script";
import type { HostLangMode, HostState, HostView, Line, SpokenLang, Utterance, UtteranceSource } from "./types";

/** Pure helpers the game engine uses to make the host speak. */

const RECENT = 20;

export function resolveLang(mode: HostLangMode, count: number, bigMoment = false): SpokenLang {
  if (mode !== "auto") return mode;
  if (bigMoment) return "both";
  return count % 2 === 0 ? "en" : "bn";
}

export function initialHost(id: string, now: number): HostState {
  const line = LINES.lobby();
  const utterance: Utterance = { id, cue: line.cue, text: line.text, lang: "both", clip: line.clip, source: "script", at: now };
  return { utterance, recent: [utterance], mode: "both", voice: true, autoQuips: false, sfx: null, stopId: null, count: 1 };
}

export function speak(
  host: HostState,
  line: Line,
  ctx: { now: number; newId: () => string },
  opts: { source?: UtteranceSource; lang?: SpokenLang } = {},
): HostState {
  const utterance: Utterance = {
    id: ctx.newId(),
    cue: line.cue,
    text: line.text,
    lang: opts.lang ?? resolveLang(host.mode, host.count, line.bigMoment),
    clip: line.clip,
    fallbackClip: line.fallbackClip,
    source: opts.source ?? (line.cue === "quip" ? "quip" : "script"),
    at: ctx.now,
  };
  return { ...host, utterance, recent: [...host.recent, utterance].slice(-RECENT), count: host.count + 1 };
}

/** A free-form line (typed by the host, written by the LLM, or a conversation reply). */
export function customLine(text: Partial<Bilingual>, cue = "custom"): Line {
  const en = text.en?.trim() ?? "";
  const bn = text.bn?.trim() ?? "";
  return { cue, text: { en: en || bn, bn: bn || en } };
}

export function hostView(host: HostState): HostView {
  return {
    utterance: host.utterance,
    mode: host.mode,
    voice: host.voice,
    autoQuips: host.autoQuips,
    sfx: host.sfx,
    stopId: host.stopId,
  };
}

/** Which language(s) a custom line can actually be spoken in. */
export function availableLang(text: Partial<Bilingual>, wanted: SpokenLang): SpokenLang | null {
  const has = { en: !!text.en?.trim(), bn: !!text.bn?.trim() };
  if (wanted === "both") return has.en && has.bn ? "both" : has.en ? "en" : has.bn ? "bn" : null;
  return has[wanted] ? wanted : has.en ? "en" : has.bn ? "bn" : null;
}
