import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hasInternalAdminAccess } from "@/lib/internal-admin";
import { activeViewAs } from "@/lib/view-as";
import CreatorDashboard from "@/components/dashboard/CreatorDashboard";
import { parseFilters } from "@/components/dashboard/model";
import { creators, fans } from "@/components/fans/data";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!await hasInternalAdminAccess()) redirect("/twin");
  if (await activeViewAs(await cookies())) redirect("/revenue");
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") query.set(key, value);
  }
  return <CreatorDashboard creators={creators} fans={fans} initialFilters={parseFilters(query, creators)} />;
}
