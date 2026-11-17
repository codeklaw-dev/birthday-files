import "server-only";
import { isHostKey } from "@/lib/server/room-store";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";
import { looksLikeToken } from "./secrets";
import { inviteStore } from "./store";

/** Responses never cached by browsers or proxies: everything here is personal. */
export const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: PRIVATE_HEADERS });
export const fail = (error: string, status: number, extra: Record<string, unknown> = {}) => json({ ok: false, error, ...extra }, status);

export function requireHost(req: Request): Response | null {
  return isHostKey(req.headers.get("x-host-key")) ? null : fail("Wrong host key.", 401);
}

/** The guest's own submission, from the secret token in the `x-edit-token` header. */
export function guestFromRequest(req: Request) {
  const token = req.headers.get("x-edit-token");
  if (!looksLikeToken(token)) return { token: null, submission: null, error: fail("This edit link isn't valid.", 401) };
  const submission = inviteStore().byToken(token);
  if (!submission) return { token: null, submission: null, error: fail("We couldn't find that submission. It may have been withdrawn.", 404) };
  return { token, submission, error: null };
}

export function limited(req: Request, bucket: string, limit: number, windowMs: number): Response | null {
  return rateLimit(`${clientIp(req)}:invite:${bucket}`, limit, windowMs) ? null : fail("Too many tries. Please wait a few minutes and try again.", 429);
}
