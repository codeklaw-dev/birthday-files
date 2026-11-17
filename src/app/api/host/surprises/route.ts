import { eligibleSubmissions } from "@/lib/games/server/content";
import { json, requireHost } from "@/lib/host/server/http";
import { knowledge } from "@/lib/host/server/knowledge";

/** Host: surprises ready to trigger (approved announcements; memories from approved, consented guests). */
export async function GET(req: Request) {
  const denied = requireHost(req);
  if (denied) return denied;
  return json({
    ok: true,
    announcements: knowledge()
      .snapshot()
      .announcements.filter((a) => a.status === "approved")
      .map((a) => ({ id: a.id, title: a.title, text: a.text, prepared: a.prepared })),
    memories: eligibleSubmissions()
      .filter((s) => s.data.memory)
      .map((s) => ({ id: s.id, name: s.data.name, remote: s.data.rsvp === "remote", memory: s.data.memory, hasPhoto: !!s.photo })),
  });
}
