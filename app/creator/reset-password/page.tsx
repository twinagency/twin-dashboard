import CreatorPasswordRecovery from "@/components/CreatorPasswordRecovery";
import { getCreatorPortal } from "@/lib/creator-portal-server";
export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<{ portal?: string }> };
export async function generateMetadata({ searchParams }: Props) {
  const portal = await getCreatorPortal((await searchParams).portal);
  return { title: `New password · ${portal === "link" ? "LYNQ" : "Twin"}` };
}
export default async function CreatorResetPasswordPage({ searchParams }: Props) {
  return <CreatorPasswordRecovery portal={await getCreatorPortal((await searchParams).portal)} mode="reset" />;
}
