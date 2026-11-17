import { eligibleSubmissions } from "@/lib/games/server/content";
import { fail, json, requireHost } from "@/lib/host/server/http";
import { knowledge, type ReviewStatus } from "@/lib/host/server/knowledge";
import { inviteStore } from "@/lib/invite/server/store";

const STATUSES: ReviewStatus[] = ["pending", "approved", "rejected"];

/**
 * Host: guest facts the AI may use. Organiser-typed facts, or suggestions made
 * from approved, consented invite answers; nothing reaches a prompt until approved.
 */
export async function POST(req: Request) {
  const denied = requireHost(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  if (body?.suggest) {
    const questions = inviteStore().questions();
    let added = 0;
    for (const s of eligibleSubmissions()) {
      for (const q of questions) {
        const a = s.data.answers[q.id];
        if (a && typeof knowledge().addFact(`${s.data.name} says, for "${q.prompt}": ${a}`, "invite", `${s.id}:${q.id}`) !== "string") added++;
      }
      if (s.data.memory && typeof knowledge().addFact(`${s.data.name}'s memory with Mez: ${s.data.memory}`, "invite", `${s.id}:memory`) !== "string") added++;
    }
    return json({ ok: true, added });
  }
  const r = knowledge().addFact(String(body?.text ?? ""), "organiser", undefined, "approved");
  return typeof r === "string" ? fail(r, 422) : json({ ok: true, fact: r });
}

export async function PATCH(req: Request) {
  const denied = requireHost(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  if (body?.status && !STATUSES.includes(body.status)) return fail("Unknown status.", 422);
  const f = knowledge().setFact(String(body?.id ?? ""), { status: body?.status, text: body?.text });
  return f ? json({ ok: true, fact: f }) : fail("Fact not found.", 404);
}

export async function DELETE(req: Request) {
  const denied = requireHost(req);
  if (denied) return denied;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  return knowledge().deleteFact(id) ? json({ ok: true }) : fail("Fact not found.", 404);
}
