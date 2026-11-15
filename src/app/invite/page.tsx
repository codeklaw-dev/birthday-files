import type { Metadata } from "next";
import { InviteScreen } from "./invite-screen";

export const metadata: Metadata = { title: "You're invited" };

export default function Page() {
  return <InviteScreen />;
}
