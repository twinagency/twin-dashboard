import type { Metadata } from "next";
import CreatorSignupScreen from "@/components/CreatorSignupScreen";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { lookupCreatorInvitation } from "@/lib/creator-invite-agency";
import { isLynqHost } from "@/lib/form-origin";
import { creatorSignupForward } from "@/lib/creator-invite-forward";

export const dynamic = "force-dynamic";

// A static title export cannot react to ?code=, so an agency invite link
// showed "Twin" in the browser tab and every chat app's link preview even
// though the page itself was correctly branded. This resolves the same way
// the page content does, so the two can never say something different again.
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ code?: string }> }): Promise<Metadata> {
  const { code } = await searchParams;
  const invitation = await lookupCreatorInvitation(typeof code === "string" ? code.trim().toUpperCase().slice(0, 64) : undefined);
  const agency = invitation.agency || (isLynqHost({ headers: await headers() }) ? { name: "Moxy", icon: "/moxy/icon.svg" } : null);
  return {
    title: agency ? `Create creator account · ${agency.name}` : "Create creator account · Twin",
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
  const moxyHost = isLynqHost({ headers: await headers() });
  if (!inviteAgency && moxyHost) inviteAgency = { name: "Moxy", slug: "moxy", logo: "/moxy/logo.png", icon: "/moxy/icon.svg", dark: true };
  // Old tgaiclone Moxy invite links land on the Moxy host; a non-Moxy invite
  // opened on the Moxy host goes back to the canonical host. Generic and
  // other-agency signups on tgaiclone are untouched.
  const forward = creatorSignupForward({ url: "https://dashboard.tgaiclone.xyz/creator/signup", headers: await headers() }, inviteAgency?.slug, initialAgencyCode);
  if (forward) redirect(forward.toString());
  return <CreatorSignupScreen {...props} brand="twin" initialAgencyCode={initialAgencyCode || undefined} inviteAgency={inviteAgency} invitationStatus={initialAgencyCode || moxyHost ? invitation.status : undefined} />;
}
