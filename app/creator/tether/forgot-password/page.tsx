import { creatorPublicAuthConfig } from "@/lib/creator-public-auth";

import CreatorForgotPasswordScreen from "@/components/CreatorForgotPasswordScreen";

export default function TetherCreatorForgotPasswordPage() {
  return <CreatorForgotPasswordScreen authConfig={creatorPublicAuthConfig()} brand="tether" />;
}
