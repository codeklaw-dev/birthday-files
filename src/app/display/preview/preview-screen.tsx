"use client";

import { useEffect, useState } from "react";
import type { RoomView } from "@/lib/game/types";
import { TvShell } from "../display-screen";

/**
 * Preview-before-live, inside an iframe on the dashboard. The parent posts a
 * preview view (fetched with the host key) and this renders it exactly as the
 * TV would, silently. It never connects to the room.
 */
export function PreviewScreen() {
  const [view, setView] = useState<RoomView | null>(null);
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === "bf-preview") setView(e.data.view as RoomView | null);
    };
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: "bf-preview-ready" }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  return <TvShell view={view} status={null} clockOffset={0} audio={{ sfx: () => {} }} />;
}
