import "server-only";
import type { RoomView } from "@/lib/game/types";
import { signedMediaUrlStable } from "@/lib/invite/server/secrets";

/** Screens that show exhibits get signed links (stable for the hour, so the TV can cache them); phones don't need them. */
export function withMedia(view: RoomView): RoomView {
  if (view.role === "player") return view;
  if (view.surprise?.mediaId) view = { ...view, surprise: { ...view.surprise, mediaUrl: signedMediaUrlStable(view.surprise.mediaId) } };
  if (view.scene) view = { ...view, scene: { ...view.scene, items: view.scene.items.map((it) => (it.mediaId ? { ...it, mediaUrl: signedMediaUrlStable(it.mediaId) } : it)) } };
  const g = view.games.game;
  if (g?.id !== "mystery" || !g.exhibit.mediaId) return view;
  return { ...view, games: { ...view.games, game: { ...g, exhibit: { ...g.exhibit, mediaUrl: signedMediaUrlStable(g.exhibit.mediaId) } } } };
}
