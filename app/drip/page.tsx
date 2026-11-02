import { redirect } from "next/navigation";

// Campaigns got renamed to Flows and the route moved to /flows (2026-07-29
// operator decision). This route stays so old links/bookmarks don't 404.
export default function DripPage() {
  redirect("/flows");
}
