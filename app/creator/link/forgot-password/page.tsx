import { creatorPublicAuthConfig } from "@/lib/creator-public-auth";
import type { Metadata } from "next";
import CreatorForgotPasswordScreen from "@/components/CreatorForgotPasswordScreen";

export const metadata: Metadata = {
  title: "Reset creator password · LYNQ",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default function LinkCreatorForgotPasswordPage() {
  return <CreatorForgotPasswordScreen authConfig={creatorPublicAuthConfig()} brand="link" />;
}
