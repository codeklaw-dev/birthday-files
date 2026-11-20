import type { Metadata, Viewport } from "next";
import { InviteScreen } from "./invite-screen";

export const metadata: Metadata = { title: "You're invited" };
export const viewport: Viewport = { themeColor: "#ffffff" };

export default function Page() {
  return <InviteScreen />;
}
