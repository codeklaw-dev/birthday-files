import type { MediaItem } from "@/lib/game/media";
import type { GuestMessage } from "@/lib/game/types";

/**
 * The premiere: a slideshow of every guest's wish, shown on the TV before the
 * game show. Each photo or video gets its own slide; a wish with only a note
 * gets one slide. Shared by the engine (to clamp the index) and the screens.
 */
export type Slide =
  | { kind: "intro" }
  | { kind: "wish"; message: GuestMessage; item: MediaItem | null; part: number; parts: number }
  | { kind: "outro" };

export function premiereSlides(messages: GuestMessage[]): Slide[] {
  const wishes = messages.filter((m) => m.status !== "hidden").sort((a, b) => a.createdAt - b.createdAt);
  const slides: Slide[] = [{ kind: "intro" }];
  for (const message of wishes) {
    const media = message.media ?? [];
    if (media.length === 0) slides.push({ kind: "wish", message, item: null, part: 1, parts: 1 });
    else media.forEach((item, i) => slides.push({ kind: "wish", message, item, part: i + 1, parts: media.length }));
  }
  slides.push({ kind: "outro" });
  return slides;
}
