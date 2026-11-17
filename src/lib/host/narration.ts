import type { Lang } from "@/lib/game/types";

/** Shape of public/narration/manifest.json, written by `npm run narration:render`. */
export interface NarrationClip {
  file: string;
  text: string;
  provider: string;
  bytes: number;
  /** True for robotic stand-in audio that should be replaced before the party. */
  placeholder?: boolean;
}

export interface NarrationManifest {
  version: 1;
  generatedAt: string | null;
  clips: Record<string, Partial<Record<Lang, NarrationClip>>>;
}

export const EMPTY_MANIFEST: NarrationManifest = { version: 1, generatedAt: null, clips: {} };
/** Approved clips only (served by the app, filtered by the organiser's review). */
export const MANIFEST_URL = "/api/host/narration";
