import type { Metadata } from "next";
import { EVENT } from "@/lib/event";
import { InviteScreen } from "./invite-screen";

export const metadata: Metadata = {
  title: "You're invited",
  description: `${EVENT.guestOfHonour}'s ${EVENT.age}th birthday · ${EVENT.dateLabel}. RSVP and add your evidence.`,
};

export default function Page() {
  return <InviteScreen />;
}
