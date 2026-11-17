import { fieldErrors, guestFormSchema } from "@/lib/invite/schema";
import { fail, guestFromRequest, json, limited } from "@/lib/invite/server/http";
import { inviteStore } from "@/lib/invite/server/store";
import { guestView } from "@/lib/invite/server/views";

/** The guest's own submission (needs the secret edit token). */
export async function GET(req: Request) {
  const slow = limited(req, "read", 60, 10 * 60_000);
  if (slow) return slow;
  const g = guestFromRequest(req);
  if (g.error) return g.error;
  return json({ ok: true, submission: guestView(g.submission) });
}

export async function PUT(req: Request) {
  const slow = limited(req, "update", 40, 10 * 60_000);
  if (slow) return slow;
  const g = guestFromRequest(req);
  if (g.error) return g.error;
  const parsed = guestFormSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Some answers need another look.", 422, { fields: fieldErrors(parsed.error) });
  const s = inviteStore().update(g.token, parsed.data);
  return s ? json({ ok: true, submission: guestView(s) }) : fail("Submission not found.", 404);
}

/** Withdraw: deletes the submission and its photo/video. */
export async function DELETE(req: Request) {
  const g = guestFromRequest(req);
  if (g.error) return g.error;
  inviteStore().deleteByToken(g.token);
  return json({ ok: true });
}
