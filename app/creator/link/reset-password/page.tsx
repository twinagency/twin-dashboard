import { creatorPublicAuthConfig } from "@/lib/creator-public-auth";
import type { Metadata } from "next";
import CreatorResetPasswordScreen from "@/components/CreatorResetPasswordScreen";

export const metadata: Metadata = {
  title: "Choose a new creator password · LYNQ",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default function LinkCreatorResetPasswordPage() {
  return <CreatorResetPasswordScreen authConfig={creatorPublicAuthConfig()} brand="link" />;
}
