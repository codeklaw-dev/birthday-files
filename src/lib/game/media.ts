/** Shared (client + server + engine) rules for guest photo/video attachments. */
export type MediaKind = "image" | "video";

export interface MediaItem {
  kind: MediaKind;
  /** Server path, always `/api/uploads/<uuid>.<ext>`. */
  url: string;
}

export const MAX_MEDIA_PER_WISH = 10;

/** File names the upload store creates: a UUID plus a known extension. */
export const UPLOAD_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|mp4|mov|webm)$/;

const VIDEO_EXT = new Set(["mp4", "mov", "webm"]);

/** Accepts only links to our own upload store, with a kind that matches the file type. */
export function isMediaItem(value: unknown): value is MediaItem {
  if (!value || typeof value !== "object") return false;
  const { kind, url } = value as Record<string, unknown>;
  if ((kind !== "image" && kind !== "video") || typeof url !== "string") return false;
  const prefix = "/api/uploads/";
  if (!url.startsWith(prefix) || !UPLOAD_NAME.test(url.slice(prefix.length))) return false;
  return VIDEO_EXT.has(url.split(".").pop()!) === (kind === "video");
}
