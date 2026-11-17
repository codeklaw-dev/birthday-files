import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { inviteDir } from "./paths";

/** Guest edit tokens: 192 random bits, shown once; only a SHA-256 hash is stored. */
export function newEditToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function looksLikeToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{32}$/.test(token);
}

/**
 * Key for signing media links. From INVITE_SIGNING_SECRET, otherwise a random
 * key generated once and kept (mode 600) next to the data.
 */
let cached: Buffer | null = null;
function signingKey(): Buffer {
  if (cached) return cached;
  const fromEnv = process.env.INVITE_SIGNING_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 32) return (cached = Buffer.from(fromEnv));
  const file = `${inviteDir()}/signing.key`;
  try {
    cached = Buffer.from(readFileSync(file, "utf8").trim(), "base64url");
    if (cached.length >= 32) return cached;
  } catch {}
  mkdirSync(inviteDir(), { recursive: true });
  cached = randomBytes(32);
  writeFileSync(file, cached.toString("base64url"), { mode: 0o600 });
  try {
    chmodSync(file, 0o600);
  } catch {}
  return cached;
}

export function resetSigningKeyForTests() {
  cached = null;
}

const sign = (payload: string) => createHmac("sha256", signingKey()).update(payload).digest("base64url");

/** Short-lived link to a private file, for <img>/<video> tags that can't send headers. */
export function signedMediaUrl(mediaId: string, ttlMs = 15 * 60_000, now = Date.now()): string {
  const exp = Math.floor((now + ttlMs) / 1000);
  return `/api/invite/media/file/${mediaId}?exp=${exp}&sig=${sign(`${mediaId}.${exp}`)}`;
}

export function verifyMediaSignature(mediaId: string, exp: string | null, sig: string | null, now = Date.now()): boolean {
  if (!exp || !sig || !/^\d{1,12}$/.test(exp)) return false;
  if (Number(exp) * 1000 < now) return false;
  const want = Buffer.from(sign(`${mediaId}.${exp}`));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}
