import type { Metadata } from "next";
import CreatorLoginScreen from "@/components/CreatorLoginScreen";
import { agencyForSlug } from "@/lib/creator-invite-agency";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const agency = await agencyForSlug("moxy");
  return {
    title: agency ? `Sign in · ${agency.name}` : "Creator sign in · FLIRT",
    ...(agency?.icon ? { icons: { icon: { url: agency.icon, type: "image/svg+xml" } } } : {}),
  };
}

export default async function MoxyCreatorLoginPage(props: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const agencyBrand = await agencyForSlug("moxy");
  return <CreatorLoginScreen {...props} brand="twin" agencyBrand={agencyBrand} />;
}
