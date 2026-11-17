import { z } from "zod";
import { fail, json, requireHost } from "@/lib/invite/server/http";
import { inviteStore } from "@/lib/invite/server/store";

const schema = z.object({ ids: z.array(z.string().uuid()).max(500) });

/** Host: set the party running order. */
export async function PUT(req: Request) {
  const denied = requireHost(req);
  if (denied) return denied;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Invalid order.", 422);
  inviteStore().reorder(parsed.data.ids);
  return json({ ok: true });
}
