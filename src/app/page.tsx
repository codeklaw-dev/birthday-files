import { redirect } from "next/navigation";

/** Guests who open the bare address land on the invitation. Organiser links live at /hub. */
export default function Home() {
  redirect("/invite");
}
