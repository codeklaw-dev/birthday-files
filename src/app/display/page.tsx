import type { Metadata } from "next";
import { DisplayScreen } from "./display-screen";

export const metadata: Metadata = { title: "Display" };

export default function Page() {
  return <DisplayScreen />;
}
