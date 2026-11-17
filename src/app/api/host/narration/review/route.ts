import { fail, json, requireHost } from "@/lib/host/server/http";
import { knowledge } from "@/lib/host/server/knowledge";
import { approvedManifest, readManifest } from "@/lib/host/server/service";
import { CLIP_KEYS, CLIPS, type ClipKey } from "@/lib/host/script";

/** Host: every narration clip with its review status. */
export async function GET(req: Request) {
  const denied = requireHost(req);
  if (denied) return denied;
  const manifest = readManifest();
  const approved = approvedManifest(manifest);
  const approvals = knowledge().narrationApprovals();
  const clips = CLIP_KEYS.flatMap((key) =>
    (["en", "bn"] as const).map((lang) => {
      const c = manifest.clips[key]?.[lang];
      const a = approvals[`${key}:${lang}`];
      const status = !c ? "missing" : approved.clips[key]?.[lang] ? "approved" : a?.status === "rejected" && a.text === c.text && a.bytes === c.bytes ? "rejected" : "pending";
      return { key, lang, script: CLIPS[key][lang], file: c?.file ?? null, provider: c?.provider ?? null, placeholder: !!c?.placeholder, outdated: !!c && c.text !== CLIPS[key][lang], status };
    }),
  );
  return json({ ok: true, clips });
}

/** Approve or reject clips; `approveAll` approves every up-to-date clip that isn't a robotic placeholder. */
export async function PATCH(req: Request) {
  const denied = requireHost(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const manifest = readManifest();
  const items: { key: string; lang: "en" | "bn"; status: "approved" | "rejected" | "pending" }[] = body?.approveAll
    ? CLIP_KEYS.flatMap((key) => (["en", "bn"] as const).filter((lang) => manifest.clips[key]?.[lang] && !manifest.clips[key]![lang]!.placeholder).map((lang) => ({ key, lang, status: "approved" as const })))
    : Array.isArray(body?.items)
      ? body.items
      : [];
  let n = 0;
  for (const it of items) {
    if (!CLIP_KEYS.includes(it.key as ClipKey) || (it.lang !== "en" && it.lang !== "bn") || !["approved", "rejected", "pending"].includes(it.status)) return fail("Invalid clip.", 422);
    const c = manifest.clips[it.key]?.[it.lang];
    if (!c) continue;
    if (c.text !== CLIPS[it.key as ClipKey][it.lang]) return fail(`${it.key} (${it.lang}) is out of date; re-render it first.`, 422);
    knowledge().setNarration(it.key, it.lang, it.status, c);
    n++;
  }
  return json({ ok: true, updated: n });
}
