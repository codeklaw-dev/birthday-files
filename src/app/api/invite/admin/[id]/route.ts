import { fieldErrors, moderationPatchSchema } from "@/lib/invite/schema";
import { fail, json, requireHost } from "@/lib/invite/server/http";
import { inviteStore } from "@/lib/invite/server/store";
import { adminView } from "@/lib/invite/server/views";

/** Host: approve / reject / tag / honourable mention / note. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireHost(req);
  if (denied) return denied;
  const parsed = moderationPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Invalid change.", 422, { fields: fieldErrors(parsed.error) });
  const s = inviteStore().moderate((await ctx.params).id, parsed.data);
  return s ? json({ ok: true, submission: adminView(s) }) : fail("Submission not found.", 404);
}

/** Host: delete a submission and its files. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireHost(req);
  if (denied) return denied;
  return inviteStore().deleteById((await ctx.params).id) ? json({ ok: true }) : fail("Submission not found.", 404);
}
