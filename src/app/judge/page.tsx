import type { Metadata } from "next";
import { JudgeScreen } from "./judge-screen";

export const metadata: Metadata = { title: "Judge Mez" };

export default function Page() {
  return <JudgeScreen />;
}
