import { json, requireHost } from "@/lib/invite/server/http";
import { inviteStore } from "@/lib/invite/server/store";
import { adminView } from "@/lib/invite/server/views";
import type { AdminPayload } from "@/lib/invite/types";

/** Host: every submission (with fresh signed media links), stats and questions. */
export async function GET(req: Request) {
  const denied = requireHost(req);
  if (denied) return denied;
  const store = inviteStore();
  const payload: AdminPayload = {
    submissions: store
      .list()
      .map(adminView)
      .sort((a, b) => b.updatedAt - a.updatedAt),
    stats: store.stats(),
    questions: store.questions(),
  };
  return json({ ok: true, ...payload });
}
