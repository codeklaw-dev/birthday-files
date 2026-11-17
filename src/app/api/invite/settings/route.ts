import { questionsSchema, fieldErrors } from "@/lib/invite/schema";
import { fail, json, requireHost } from "@/lib/invite/server/http";
import { inviteStore } from "@/lib/invite/server/store";

/** Public: the three questions the invite asks. */
export async function GET() {
  return json({ ok: true, questions: inviteStore().questions() });
}

/** Host: change the questions. */
export async function PUT(req: Request) {
  const denied = requireHost(req);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  const parsed = questionsSchema.safeParse(body?.questions);
  if (!parsed.success) return fail("Check the questions.", 422, { fields: fieldErrors(parsed.error) });
  inviteStore().setQuestions(parsed.data);
  return json({ ok: true, questions: parsed.data });
}
