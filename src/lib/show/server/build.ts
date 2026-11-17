import "server-only";
import type { Action, RoomState } from "@/lib/game/types";
import { buildContent, eligibleSubmissions } from "@/lib/games/server/content";
import { PRIZES } from "@/lib/games/config";
import type { GameId } from "@/lib/games/types";
import { gamesView } from "@/lib/games/engine-games";
import type { Submission } from "@/lib/invite/types";
import { HISTORY } from "../history";
import type { SceneContent, SceneItem, Segment } from "../types";

/**
 * Turns a running-order segment into the action that starts it. All scene
 * content is built here from approved, consented submissions (or verified
 * history), never from anything a client sends.
 */

const byOrder = (a: Submission, b: Submission) => (a.moderation.order ?? 9999) - (b.moderation.order ?? 9999) || a.createdAt - b.createdAt;
const detail = (s: Submission) => (s.data.rsvp === "remote" ? `${s.data.relationship} · joining remotely` : s.data.relationship);

function spotlight(): SceneContent {
  const items: SceneItem[] = eligibleSubmissions()
    .sort(byOrder)
    .flatMap((s) => {
      // Spotlight is for guests at the party; remote friends get the montage and honours.
      if (s.data.rsvp === "remote") return [];
      const base = { from: s.data.name, fromDetail: detail(s), year: undefined };
      const out: SceneItem[] = [];
      if (s.photo) out.push({ ...base, id: `${s.id}:photo`, kind: "photo", title: "Exhibit: a photo", text: s.data.memory.slice(0, 280), mediaId: s.photo.id, mediaKind: "photo" });
      else if (s.data.memory) out.push({ ...base, id: `${s.id}:memory`, kind: "memory", title: "Exhibit: a memory", text: s.data.memory, mediaId: null, mediaKind: null });
      if (s.video) out.push({ ...base, id: `${s.id}:video`, kind: "video", title: "Exhibit: a video", text: "", mediaId: s.video.id, mediaKind: "video" });
      return out;
    });
  return { kind: "spotlight", title: "Guest spotlight", subtitle: "Who sent this? Make your guess — then we reveal.", items };
}

function honours(): SceneContent {
  const items: SceneItem[] = eligibleSubmissions()
    .filter((s) => s.moderation.honourable)
    .sort(byOrder)
    .map((s) => ({
      id: `${s.id}:honour`,
      kind: "honour",
      title: s.data.name,
      text: s.data.memory.slice(0, 220),
      from: s.data.name,
      fromDetail: detail(s),
      mediaId: s.photo?.id ?? null,
      mediaKind: s.photo ? "photo" : null,
    }));
  return { kind: "honours", title: "Honourable mentions", subtitle: "With love — near and far.", items };
}

function montage(): SceneContent {
  const items: SceneItem[] = eligibleSubmissions()
    .filter((s) => s.video)
    .sort(byOrder)
    .map((s) => ({ id: `${s.id}:montage`, kind: "video", title: `From ${s.data.name}`, text: "", from: s.data.name, fromDetail: detail(s), mediaId: s.video!.id, mediaKind: "video" }));
  return { kind: "montage", title: "Messages for Mez", subtitle: "From everyone who loves you.", items };
}

function history(seg: Segment): SceneContent {
  const items: SceneItem[] = HISTORY.filter((h) => seg.includeSerious || !h.serious)
    .sort((a, b) => a.year - b.year)
    .map((h) => ({ id: h.id, kind: "history", title: h.headline, text: h.detail, from: null, fromDetail: null, mediaId: null, mediaKind: null, year: h.year, sourceUrl: h.sourceUrl, sourceName: h.sourceName }));
  return { kind: "history", title: "21 November", subtitle: "Mez arrived on 21 November 2002. Here's what else the date has seen.", items };
}

const PLACE = ["1st", "2nd", "3rd", "4th", "5th"];

/** Counts down from 5th to 1st on each board, ending with the overall winner. */
function ceremony(state: RoomState): SceneContent {
  const { live, expert } = gamesView(state, { role: "host", playerId: null }).boards;
  const rows = (board: typeof live, label: string, n: number): SceneItem[] =>
    board
      .slice(0, n)
      .map((r, i) => ({ id: `${label}:${i}`, kind: "card" as const, title: `${PLACE[i]} · ${label}`, text: `${r.total} points`, from: r.subject.name, fromDetail: r.subject.remote ? "joining remotely" : null, mediaId: null, mediaKind: null }))
      .reverse();
  return { kind: "ceremony", title: "The final standings", subtitle: "Two boards. One night. Drumroll…", items: [...rows(expert, "Mez Expert board", 3), ...rows(live, "Live party board", 5)] };
}

function prizes(state: RoomState): SceneContent {
  const { live, expert } = gamesView(state, { role: "host", playerId: null }).boards;
  const label = (id: string) => PRIZES.find((p) => p.id === id)?.label ?? id;
  const items: SceneItem[] = [
    ...expert.slice(0, 3).map((r, i) => ({ id: `ex:${i}`, kind: "card" as const, title: `${PLACE[i]} place · Mez Expert`, text: "A prize from the organiser", from: r.subject.name, fromDetail: null, mediaId: null, mediaKind: null })),
    ...live.slice(0, 3).map((r, i) => ({ id: `lv:${i}`, kind: "card" as const, title: `${PLACE[i]} place · Live party`, text: "A prize from the organiser", from: r.subject.name, fromDetail: null, mediaId: null, mediaKind: null })),
    ...state.wheel.history
      .filter((w) => w.status === "accepted")
      .map((w) => ({ id: `wh:${w.id}`, kind: "card" as const, title: "Won on the prize wheel", text: label(w.prize), from: w.recipient.name, fromDetail: null, mediaId: null, mediaKind: null })),
  ];
  return { kind: "prizes", title: "Prize announcements", subtitle: "Collect them from Mez.", items };
}

export function sceneFor(seg: Segment, state: RoomState): SceneContent | null {
  switch (seg.kind) {
    case "spotlight": return spotlight();
    case "honours": return honours();
    case "montage": return montage();
    case "history": return history(seg);
    case "ceremony": return ceremony(state);
    case "prizes": return prizes(state);
    default: return null;
  }
}

/** The action a segment starts with, or null if it only marks the segment live. */
export function startFor(seg: Segment, state: RoomState): Action | null {
  if (seg.kind.startsWith("game:")) {
    const game = seg.kind.slice(5) as GameId;
    return { type: "host/game/start", game, content: buildContent(game, state) } as Action;
  }
  const scene = sceneFor(seg, state);
  if (scene) return { type: "host/scene/start", scene: { ...scene, title: seg.title || scene.title } };
  switch (seg.kind) {
    case "welcome":
    case "break": return { type: "host/show/idle" };
    case "quiz": return { type: "host/next" };
    case "messages": return { type: "host/showMessages" };
    case "boards": return { type: "host/showBoards" };
    case "wheel": return { type: "host/wheel/show" };
    case "cake": return { type: "host/startCake" };
    case "finale": return { type: "host/finish" };
    default: return null;
  }
}
