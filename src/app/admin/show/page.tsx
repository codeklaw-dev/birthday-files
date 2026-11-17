import type { Metadata } from "next";
import { ShowScreen } from "./show-screen";

export const metadata: Metadata = { title: "Show director" };

export default function Page() {
  return <ShowScreen />;
}
