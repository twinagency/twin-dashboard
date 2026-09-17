import CreatorSignupScreen from "@/components/CreatorSignupScreen";
import { agencyForInviteCode } from "@/lib/creator-invite-agency";

export const metadata = { title: "Create creator account · Twin" };
export const dynamic = "force-dynamic";

export default async function CreatorSignupPage(props: { searchParams: Promise<{ error?: string; code?: string }> }) {
  // ?code= comes from an agency invite link. It only prefills the field and
  // selects the branding; the signup route still validates and claims it.
  const { code } = await props.searchParams;
  const initialAgencyCode = typeof code === "string" ? code.trim().toUpperCase().slice(0, 64) : undefined;
  // Someone arriving on an agency's invite link is joining that agency, not
  // Twin directly, so the page presents itself as theirs.
  const inviteAgency = await agencyForInviteCode(initialAgencyCode);
  return <CreatorSignupScreen {...props} brand="twin" initialAgencyCode={initialAgencyCode || undefined} inviteAgency={inviteAgency} />;
}
