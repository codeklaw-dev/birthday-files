import type { Bilingual, Lang } from "@/lib/game/types";

/** en | bn | both, or auto: alternate languages line by line, both for big moments. */
export type HostLangMode = Lang | "both" | "auto";
export type SpokenLang = Lang | "both";

export type UtteranceSource = "script" | "quip" | "host" | "llm" | "conversation";

export interface Utterance {
  id: string;
  /** Cue name, e.g. "reveal" — for logs and telemetry. */
  cue: string;
  text: Bilingual;
  /** Which language(s) to actually speak. Captions always show this too. */
  lang: SpokenLang;
  /** Pre-recorded clip that says exactly `text` (static lines). */
  clip?: string;
  /** Generic clip to play if live speech for a dynamic line fails. */
  fallbackClip?: string;
  source: UtteranceSource;
  at: number;
}

export const SFX_KINDS = ["ding", "buzzer", "drumroll", "fanfare", "applause", "airhorn", "tick", "whoosh"] as const;
export type SfxKind = (typeof SFX_KINDS)[number];

export interface HostState {
  utterance: Utterance;
  /** Recent lines the server may synthesise on request (never arbitrary text). */
  recent: Utterance[];
  mode: HostLangMode;
  voice: boolean;
  autoQuips: boolean;
  sfx: { id: string; kind: SfxKind; at: number } | null;
  /** Bumped when the host presses "stop talking". */
  stopId: string | null;
  /** Counts utterances; drives auto-language alternation and quip rotation. */
  count: number;
}

export type HostView = Omit<HostState, "recent" | "count">;

/** A line before it is assigned an id and a language. */
export interface Line {
  cue: string;
  text: Bilingual;
  clip?: string;
  fallbackClip?: string;
  /** Speak in both languages even in auto mode. */
  bigMoment?: boolean;
}
