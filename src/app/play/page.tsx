import type { Metadata, Viewport } from "next";
import { PlayScreen } from "./play-screen";

export const metadata: Metadata = { title: "Play" };
export const viewport: Viewport = { themeColor: "#9e48aa" };

export default function Page() {
  return <PlayScreen />;
}
