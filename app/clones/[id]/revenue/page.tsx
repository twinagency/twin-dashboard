import RevenueDashboard from "@/components/RevenueDashboard";

export const dynamic = "force-dynamic";

export default async function CloneRevenuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RevenueDashboard cloneId={id} />;
}
