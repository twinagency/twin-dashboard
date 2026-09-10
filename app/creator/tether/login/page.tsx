import type { Metadata } from "next";
import CreatorLoginScreen from "@/components/CreatorLoginScreen";

export const metadata: Metadata = { title: "Creator sign in · Tether", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function TetherCreatorLoginPage(props: { searchParams: Promise<{ next?: string; error?: string }> }) {
  return <CreatorLoginScreen {...props} brand="tether" />;
}
