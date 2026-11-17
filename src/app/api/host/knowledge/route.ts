import { fail, json, requireHost } from "@/lib/host/server/http";
import { knowledge } from "@/lib/host/server/knowledge";

/** Host: personality, facts, announcements and conversation memory (never shown to guests). */
export async function GET(req: Request) {
  const denied = requireHost(req);
  if (denied) return denied;
  const { personality, facts, announcements, conversation } = knowledge().snapshot();
  return json({ ok: true, personality, facts, announcements, conversation });
}

export async function PUT(req: Request) {
  const denied = requireHost(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  if (body?.reset) return json({ ok: true, personality: knowledge().resetPersonality() });
  const r = knowledge().setPersonality({ name: body?.name, style: body?.style, rules: Array.isArray(body?.rules) ? body.rules : undefined });
  return typeof r === "string" ? fail(r, 422) : json({ ok: true, personality: r });
}

/** Forget the push-to-talk conversation memory. */
export async function DELETE(req: Request) {
  const denied = requireHost(req);
  if (denied) return denied;
  knowledge().forgetConversation();
  return json({ ok: true });
}
