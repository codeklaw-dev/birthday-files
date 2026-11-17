import type { Metadata } from "next";
import { PreviewScreen } from "./preview-screen";

export const metadata: Metadata = { title: "Preview", robots: { index: false } };

export default function Page() {
  return <PreviewScreen />;
}
