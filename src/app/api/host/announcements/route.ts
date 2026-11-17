import type { Lang } from "@/lib/game/types";
import { fail, json, requireHost } from "@/lib/host/server/http";
import { knowledge, type ReviewStatus } from "@/lib/host/server/knowledge";
import { speech } from "@/lib/host/server/speech-cache";

const STATUSES: ReviewStatus[] = ["pending", "approved", "rejected"];

/** Pre-generate (and cache) the voice for an approved announcement, so it plays instantly. */
async function prepare(id: string) {
  const a = knowledge().announcement(id);
  if (!a || a.status !== "approved") return;
  await Promise.all(
    (["en", "bn"] as Lang[])
      .filter((l) => a.text[l])
      .map(async (l) => {
        knowledge().setPrepared(id, l, "pending");
        try {
          const r = await speech(a.text[l], l, 30_000);
          // The mock "voice" is a beep, not speech: treat it as not prepared.
          knowledge().setPrepared(id, l, r.provider.startsWith("mock") ? "failed" : "cached");
        } catch {
          knowledge().setPrepared(id, l, "failed");
        }
      }),
  );
}

export async function GET(req: Request) {
  const denied = requireHost(req);
  if (denied) return denied;
  return json({ ok: true, announcements: knowledge().snapshot().announcements });
}

/** Create or edit. Edited words go back to "pending". */
export async function POST(req: Request) {
  const denied = requireHost(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const r = knowledge().saveAnnouncement({ id: body?.id, title: String(body?.title ?? ""), text: body?.text ?? {} });
  return typeof r === "string" ? fail(r, 422) : json({ ok: true, announcement: r });
}

/** Approve / reject. Approving starts pre-generating the voice in the background. */
export async function PATCH(req: Request) {
  const denied = requireHost(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  if (!STATUSES.includes(body?.status)) return fail("Unknown status.", 422);
  const a = knowledge().setAnnouncementStatus(String(body?.id ?? ""), body.status);
  if (!a) return fail("Announcement not found.", 404);
  if (a.status === "approved") {
    const job = prepare(a.id);
    if (body?.wait) await job;
  }
  return json({ ok: true, announcement: knowledge().announcement(a.id) });
}

export async function DELETE(req: Request) {
  const denied = requireHost(req);
  if (denied) return denied;
  return knowledge().deleteAnnouncement(new URL(req.url).searchParams.get("id") ?? "") ? json({ ok: true }) : fail("Announcement not found.", 404);
}
