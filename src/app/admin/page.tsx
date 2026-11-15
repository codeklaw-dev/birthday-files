import type { Metadata } from "next";
import { AdminScreen } from "./admin-screen";

export const metadata: Metadata = { title: "Host dashboard" };

export default function Page() {
  return <AdminScreen />;
}
