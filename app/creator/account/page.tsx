import { notFound } from "next/navigation";
import { canManageCreatorLogin } from "@/lib/creator-account-settings";
import { requireCreatorWorkspace } from "@/lib/creator-dashboard";
import { serviceClient } from "@/lib/supabase-service";
import AccountForms from "./AccountForms";

export const metadata = { title: "Account settings · FLIRT" };

export default async function CreatorAccountPage({ searchParams }: {
  searchParams: Promise<{ status?: string }>;
}) {
  const creator = await requireCreatorWorkspace();
  if (!canManageCreatorLogin(creator)) notFound();
  const { data, error } = await serviceClient().auth.admin.getUserById(creator.userId);
  const { status } = await searchParams;
  return <AccountForms email={error ? undefined : data.user?.email} pendingEmail={data.user?.new_email} status={status} />;
}
