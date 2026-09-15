import FansPage from "@/app/users/page";

export const dynamic = "force-dynamic";

export default async function CrmInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ fan?: string; q?: string; status?: string; sort?: string; dir?: string; show?: string }>;
}) {
  return <FansPage searchParams={searchParams} basePath="/crm/inbox" />;
}
