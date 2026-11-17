import type { NextRequest } from "next/server";
import { viewFor } from "@/lib/game/engine";
import type { Role, RoomState } from "@/lib/game/types";
import { withMedia } from "@/lib/server/media-view";
import { knowledge } from "@/lib/host/server/knowledge";
import { isHostKey, isJudgeKey, lanHosts, roomStore } from "@/lib/server/room-store";

/** Server-Sent Events: pushes a role-filtered view on every state change. */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const role = params.get("role") as Role | null;
  const token = params.get("token");

  if (role !== "host" && role !== "display" && role !== "player" && role !== "judge") {
    return Response.json({ error: "Unknown role." }, { status: 400 });
  }
  if (role === "host" && !isHostKey(params.get("key"))) {
    return Response.json({ error: "Wrong host key." }, { status: 401 });
  }
  if (role === "judge" && !isJudgeKey(params.get("key"))) {
    return Response.json({ error: "Not the judge phone." }, { status: 401 });
  }

  const encoder = new TextEncoder();
  const hosts = role === "player" ? undefined : lanHosts();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (state: RoomState) => {
        // A rotated judge key signs the old judge phone out.
        if (role === "judge" && !isJudgeKey(params.get("key"))) return cleanup();
        const view = withMedia({ ...viewFor(state, role, role === "player" ? token : null, Date.now()), lanHosts: hosts, hostName: knowledge().personality().name.en });
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(view)}\n\n`));
        } catch {
          cleanup();
        }
      };
      send(roomStore.getState());
      const unsubscribe = roomStore.subscribe(send);
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          cleanup();
        }
      }, 15000);
      cleanup = () => {
        unsubscribe();
        clearInterval(heartbeat);
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
