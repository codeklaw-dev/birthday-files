import type { Phase } from "@/lib/game/types";
import type { GameId } from "@/lib/games/types";

/**
 * The show director: a running order of optional segments the organiser
 * starts by hand. Nothing here ever starts on its own — a segment that is
 * "due" only lights up on the dashboard.
 */

export type SceneKind = "spotlight" | "history" | "honours" | "montage" | "prizes" | "ceremony";

export type SegmentKind =
  | "welcome"
  | "quiz"
  | `game:${GameId}`
  | SceneKind
  | "messages"
  | "boards"
  | "wheel"
  | "cake"
  | "break"
  | "finale";

export type SegmentStatus = "pending" | "live" | "done" | "skipped";

export interface Segment {
  id: string;
  kind: SegmentKind;
  title: string;
  /** Planned local clock time "HH:MM" — a guide for the organiser, never a trigger. */
  at: string;
  minutes: number;
  enabled: boolean;
  status: SegmentStatus;
  note: string;
  /** History segment: also include the serious news items. */
  includeSerious?: boolean;
}

export interface ShowState {
  plan: Segment[];
  currentId: string | null;
  /** Timers frozen by the organiser. Restored only if the same question / step is still running. */
  paused: {
    at: number;
    question: { index: number; leftMs: number } | null;
    step: { roundId: string; step: string; leftMs: number } | null;
  } | null;
  /** Emergency stop: speech cut, sound muted, TV shows a holding card. */
  hold: { at: number; prevMuted: boolean } | null;
  /** Fictional data only: set when the server runs in rehearsal mode. */
  rehearsal: boolean;
}

export interface SceneItem {
  id: string;
  kind: "memory" | "photo" | "video" | "history" | "honour" | "card";
  title: string;
  text: string;
  /** Who sent it. Hidden from the TV and phones until the item is revealed (spotlight). */
  from: string | null;
  fromDetail: string | null;
  mediaId: string | null;
  mediaKind: "photo" | "video" | null;
  year?: number;
  sourceUrl?: string;
  sourceName?: string;
}

export interface Scene {
  id: string;
  kind: SceneKind;
  title: string;
  subtitle: string;
  items: SceneItem[];
  /** -1 = title card. */
  index: number;
  revealed: boolean;
  startedAt: number;
  returnPhase: Phase;
}

export interface SceneItemView extends SceneItem {
  mediaUrl: string | null;
}

export interface SceneView extends Omit<Scene, "items" | "returnPhase"> {
  items: SceneItemView[];
}

export interface ShowView {
  plan: Segment[];
  currentId: string | null;
  paused: boolean;
  hold: boolean;
  rehearsal: boolean;
}

/** Content the server builds for a scene (clients only name the segment). */
export interface SceneContent {
  kind: SceneKind;
  title: string;
  subtitle: string;
  items: SceneItem[];
}

export type ShowAction =
  | { type: "host/show/plan"; plan: Segment[] }
  | { type: "host/show/go"; segmentId: string; start?: unknown }
  | { type: "host/show/end" }
  | { type: "host/show/skip"; segmentId: string }
  | { type: "host/show/restore"; segmentId: string }
  | { type: "host/show/pause" }
  | { type: "host/show/resume" }
  | { type: "host/show/emergency" }
  | { type: "host/show/idle" }
  | { type: "host/scene/start"; scene: SceneContent }
  | { type: "host/scene/next" }
  | { type: "host/scene/prev" }
  | { type: "host/scene/reveal" }
  | { type: "host/scene/goto"; index: number }
  | { type: "host/scene/end" }
  | { type: "host/cake/cut" }
  | { type: "host/cake/real" }
  /** Organiser override when Mez's phone isn't to hand. */
  | { type: "host/cake/mez" }
  | { type: "judge/cake/blow" };
