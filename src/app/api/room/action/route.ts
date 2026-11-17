import type { Action } from "@/lib/game/types";
import { buildContent, buildSurveyBoard, contributorById, eligibleSubmissions } from "@/lib/games/server/content";
import { knowledge } from "@/lib/host/server/knowledge";
import type { GameId } from "@/lib/games/types";
import { ensureHostService } from "@/lib/host/server/service";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";
import { isHostKey, isJudgeKey, roomStore } from "@/lib/server/room-store";

const LIMITS: Record<string, [number, number]> = {
  submitMessage: [6, 60_000],
  join: [12, 60_000],
  blow: [40, 5_000],
  "game/clue": [10, 10_000],
  "game/vote": [10, 10_000],
  "game/guess": [10, 10_000],
};
const GAMES: GameId[] = ["imposter", "wkmb", "survey", "trial", "mystery"];
const fail = (error: string, status: number) => Response.json({ ok: false, error }, { status });

export async function POST(req: Request) {
  ensureHostService();
  let action: Action & Record<string, unknown>;
  try {
    action = await req.json();
  } catch {
    return fail("Invalid JSON.", 400);
  }
  const type = typeof action?.type === "string" ? action.type : "";

  // Who may send what: system/* never; host/* needs the host key; judge/* needs Mez's judge key.
  if (type.startsWith("system/")) return fail("Forbidden.", 403);
  if (type.startsWith("host/") && !isHostKey(req.headers.get("x-host-key"))) return fail("Wrong host key.", 401);
  if (type.startsWith("judge/") && !isJudgeKey(req.headers.get("x-judge-key"))) return fail("This phone isn't Mez's judge phone.", 401);
  const limit = LIMITS[type];
  if (limit && !rateLimit(`${clientIp(req)}:${type}`, limit[0], limit[1])) return fail("Slow down a little and try again in a minute.", 429);

  // Server-built inputs: anything the client sent for these fields is replaced.
  if (type === "host/game/start") {
    if (!GAMES.includes(action.game as GameId)) return fail("Unknown game.", 422);
    action = { type, game: action.game as GameId, content: buildContent(action.game as GameId, roomStore.getState()) } as typeof action;
  }
  if (type === "host/setup/survey") {
    const questionId = String(action.questionId ?? "");
    if (action.clear) action = { type, questionId, board: null } as typeof action;
    else {
      const board = buildSurveyBoard(questionId, Array.isArray(action.groups) ? (action.groups as { label: string; members: string[] }[]) : []);
      if (typeof board === "string") return fail(board, 422);
      action = { type, questionId, board } as typeof action;
    }
  }
  // Surprises are built here from approved content only; clients just name which one.
  if (type === "host/surprise/show") {
    const id = String(action.id ?? "");
    if (action.kind === "announcement") {
      const a = knowledge().announcement(id);
      if (!a || a.status !== "approved") return fail("Only approved announcements can be shown.", 422);
      action = { type, surprise: { id: a.id, kind: "announcement", title: a.title, text: a.text, from: null, mediaId: null } } as typeof action;
    } else if (action.kind === "memory") {
      const s = eligibleSubmissions().find((x) => x.id === id && x.data.memory);
      if (!s) return fail("Only approved memories the guest allowed us to show can be revealed.", 422);
      action = { type, surprise: { id: s.id, kind: "memory", title: `A memory from ${s.data.name}`, text: { en: s.data.memory, bn: s.data.memory }, from: s.data.name, mediaId: s.photo?.id ?? null } } as typeof action;
    } else return fail("Unknown surprise.", 422);
  }
  if (type === "host/correct" && (action.subject as { kind?: string })?.kind === "contributor") {
    const c = contributorById(String((action.subject as { id?: string }).id ?? ""));
    if (!c) return fail("Unknown contributor.", 422);
    action = { ...action, subject: { kind: "contributor", id: c.id, name: c.name, remote: c.remote } } as typeof action;
  }

  const result = roomStore.dispatch(action as Action);
  return result.ok ? Response.json({ ok: true }) : fail(result.error, 422);
}
