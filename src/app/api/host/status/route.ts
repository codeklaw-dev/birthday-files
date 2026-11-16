import { providerStatus } from "@/lib/host/server/router";
import { ensureHostService, narrationCoverage, playbackLog } from "@/lib/host/server/service";
import { isHostKey } from "@/lib/server/room-store";

/** Host-only: provider health, narration coverage and recent playback. No secrets. */
export async function GET(req: Request) {
  ensureHostService();
  if (!isHostKey(req.headers.get("x-host-key"))) return Response.json({ error: "Wrong host key." }, { status: 401 });
  return Response.json({
    chains: providerStatus(),
    narration: narrationCoverage(),
    playback: playbackLog.slice(-12).reverse(),
  });
}
