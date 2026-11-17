import type { Metadata } from "next";
import { HostSetupScreen } from "./host-setup";

export const metadata: Metadata = { title: "AI host setup" };

export default function Page() {
  return <HostSetupScreen />;
}
