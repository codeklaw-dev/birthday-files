import { fieldErrors, guestFormSchema } from "@/lib/invite/schema";
import { fail, json, limited } from "@/lib/invite/server/http";
import { inviteStore } from "@/lib/invite/server/store";
import { guestView } from "@/lib/invite/server/views";

/** Create a submission. Returns the secret edit token exactly once. */
export async function POST(req: Request) {
  const slow = limited(req, "create", 6, 10 * 60_000);
  if (slow) return slow;
  const body = await req.json().catch(() => null);
  const parsed = guestFormSchema.safeParse(body);
  if (!parsed.success) return fail("Some answers need another look.", 422, { fields: fieldErrors(parsed.error) });
  const { submission, token } = inviteStore().create(parsed.data);
  return json({ ok: true, token, submission: guestView(submission) }, 201);
}
