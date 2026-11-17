import type { Metadata } from "next";
import { SubmissionsScreen } from "./submissions-screen";

export const metadata: Metadata = { title: "Guest submissions" };

export default function Page() {
  return <SubmissionsScreen />;
}
