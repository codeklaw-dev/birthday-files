import type { Metadata } from "next";
import { GamesSetupScreen } from "./setup-screen";

export const metadata: Metadata = { title: "Games setup" };

export default function Page() {
  return <GamesSetupScreen />;
}
