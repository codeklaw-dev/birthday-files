import { ProviderError } from "../types";

/** fetch + useful errors. Never logs request bodies or keys. */
export async function call(provider: string, url: string, init: RequestInit & { signal: AbortSignal }): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    if (init.signal.aborted) throw new ProviderError(provider, "timed out");
    throw new ProviderError(provider, `network error (${(err as Error).message})`);
  }
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 240);
    const hint =
      res.status === 401 || res.status === 403
        ? "key rejected or missing permission"
        : res.status === 429
          ? "rate limit or free quota exhausted"
          : res.status === 404
            ? "model or endpoint not found (check the model name)"
            : "request failed";
    throw new ProviderError(provider, `${hint} [HTTP ${res.status}] ${body}`, res.status);
  }
  return res;
}

export const env = (name: string) => process.env[name]?.trim() || "";
