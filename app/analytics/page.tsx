import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Money analytics now lives as a tab inside the Revenue page (one money
// destination). Keep this route as a redirect so old links don't 404.
export default function AnalyticsPage() {
  redirect("/revenue");
}
