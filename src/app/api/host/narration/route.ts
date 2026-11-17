import { approvedManifest } from "@/lib/host/server/service";

/** The TV's narration list: approved clips only (unapproved or re-rendered clips are left out). */
export async function GET(req: Request) {
  // Reading the request makes this run per request (approvals change at runtime; never prerendered).
  void req.headers;
  return Response.json(approvedManifest(), { headers: { "Cache-Control": "no-store" } });
}
