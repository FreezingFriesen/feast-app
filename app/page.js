// app/page.js (server component)
import { redirect } from "next/navigation";

export default function Page() {
  // server-side redirect to the login route
  redirect("/login");
}