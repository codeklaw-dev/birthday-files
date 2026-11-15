import type { NextRequest } from "next/server";
import { viewFor } from "@/lib/game/engine";
import type { Role, RoomState } from "@/lib/game/types";
import { isHostKey, lanHosts, roomStore } from "@/lib/server/room-store";

/** Server-Sent Events: pushes a role-filtered view on every state change. */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const role = params.get("role") as Role | null;
  const token = params.get("token");

  if (role !== "host" && role !== "display" && role !== "player") {
    return Response.json({ error: "Unknown role." }, { status: 400 });
  }
  if (role === "host" && !isHostKey(params.get("key"))) {
    return Response.json({ error: "Wrong host key." }, { status: 401 });
  }

  const encoder = new TextEncoder();
  const hosts = role === "player" ? undefined : lanHosts();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (state: RoomState) => {
        const view = { ...viewFor(state, role, role === "player" ? token : null, Date.now()), lanHosts: hosts };
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
