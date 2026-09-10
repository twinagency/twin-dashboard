import type { Metadata } from "next";
import CreatorSignupScreen from "@/components/CreatorSignupScreen";

export const metadata: Metadata = {
  title: "Create creator account · LYNQ",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default function LinkCreatorSignupPage(props: { searchParams: Promise<{ error?: string; status?: string }> }) {
  return <CreatorSignupScreen {...props} brand="link" />;
}
