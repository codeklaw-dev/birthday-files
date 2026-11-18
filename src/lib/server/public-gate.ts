/**
 * Public gate for the invitation. When the laptop is reachable from the
 * internet through a Cloudflare Tunnel, Cloudflare adds `cf-connecting-ip`
 * and `cf-ray` to every request it forwards. Those requests may reach the
 * invitation and nothing else: no admin, no TV, no show, no AI host.
 * Requests from the party Wi-Fi (no Cloudflare headers) are not affected.
 *
 * Defence in depth: every admin route also checks the host key.
 */

const UUID = "[0-9a-f-]{36}";
const ALLOWED: [RegExp, string[]][] = [
  [/^\/$/, ["GET", "HEAD"]], // redirects to /invite
  [/^\/invite\/?$/, ["GET", "HEAD"]],
  [/^\/favicon\.ico$/, ["GET", "HEAD"]],
  [/^\/_next\/(static|image)\//, ["GET", "HEAD"]],
  [/^\/api\/invite\/settings$/, ["GET"]],
  [/^\/api\/invite\/submissions$/, ["POST"]],
  [/^\/api\/invite\/submissions\/me$/, ["GET", "PUT", "DELETE"]],
  [/^\/api\/invite\/media\/(photo|video)$/, ["PUT", "DELETE"]],
  [new RegExp(`^/api/invite/media/file/${UUID}$`), ["GET", "HEAD"]],
];

export function viaCloudflare(headers: Headers): boolean {
  return headers.has("cf-connecting-ip") || headers.has("cf-ray");
}

export function publicAllowed(method: string, pathname: string): boolean {
  return ALLOWED.some(([re, methods]) => re.test(pathname) && methods.includes(method.toUpperCase()));
}
