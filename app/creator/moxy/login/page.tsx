import type { Metadata } from "next";
import CreatorLoginScreen from "@/components/CreatorLoginScreen";
import { agencyForSlug, MOXY_CREATOR_PRESENTATION } from "@/lib/creator-invite-agency";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const agency = await agencyForSlug("moxy") || MOXY_CREATOR_PRESENTATION;
  return {
    title: agency ? `Sign in · ${agency.name}` : "Creator sign in · Twin",
    ...(agency?.icon ? { icons: { icon: { url: agency.icon, type: "image/svg+xml" } } } : {}),
  };
}

export default async function MoxyCreatorLoginPage(props: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const agencyBrand = await agencyForSlug("moxy") || MOXY_CREATOR_PRESENTATION;
  return <CreatorLoginScreen {...props} brand="twin" agencyBrand={agencyBrand} />;
}
