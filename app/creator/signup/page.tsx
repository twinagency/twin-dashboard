import { getFlirtCreatorLocale } from "@/lib/flirt-creator-locale-server";
import { flirtCreatorCopy } from "@/lib/flirt-creator-locale";
import type { Metadata } from "next";
import CreatorSignupScreen from "@/components/CreatorSignupScreen";
import { lookupCreatorInvitation } from "@/lib/creator-invite-agency";

export const dynamic = "force-dynamic";

// A static title export cannot react to ?code=, so an agency invite link
// showed "Twin" in the browser tab and every chat app's link preview even
// though the page itself was correctly branded. This resolves the same way
// the page content does, so the two can never say something different again.
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ code?: string }> }): Promise<Metadata> {
  const { code } = await searchParams;
  const locale = await getFlirtCreatorLocale();
  const t = flirtCreatorCopy(locale);
  const invitation = await lookupCreatorInvitation(typeof code === "string" ? code.trim().toUpperCase().slice(0, 64) : undefined);
  const agency = invitation.agency;
  return {
    title: `${t("Create creator account", "Criar conta de criadora")} · ${agency?.name || "FLIRT"}`,
    // Only set when the invite has its own icon; leaving it out for every
    // other case keeps Twin's favicon exactly as it was.
    ...(agency?.icon ? { icons: { icon: { url: agency.icon, type: "image/svg+xml" } } } : {}),
  };
}

export default async function CreatorSignupPage(props: { searchParams: Promise<{ error?: string; code?: string }> }) {
  // ?code= comes from an agency invite link. It only prefills the field and
  // selects the branding; the signup route still validates and claims it.
  const { code } = await props.searchParams;
  const initialAgencyCode = typeof code === "string" ? code.trim().toUpperCase().slice(0, 64) : undefined;
  // Someone arriving on an agency's invite link is joining that agency, not
  // Twin directly, so the page presents itself as theirs.
  const invitation = await lookupCreatorInvitation(initialAgencyCode);
  let inviteAgency = invitation.agency;
  return <CreatorSignupScreen {...props} brand="twin" initialAgencyCode={initialAgencyCode || undefined} inviteAgency={inviteAgency} invitationStatus={initialAgencyCode ? invitation.status : undefined} />;
}
