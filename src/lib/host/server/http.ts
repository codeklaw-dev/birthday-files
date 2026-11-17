import "server-only";
import { isHostKey } from "@/lib/server/room-store";

export const NO_STORE = { "Cache-Control": "no-store" };
export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });
export const fail = (error: string, status: number, extra: Record<string, unknown> = {}) => json({ ok: false, error, ...extra }, status);
export const requireHost = (req: Request) => (isHostKey(req.headers.get("x-host-key")) ? null : fail("Wrong host key.", 401));
