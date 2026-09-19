import { creatorPublicAuthConfig } from "@/lib/creator-public-auth";

import CreatorResetPasswordScreen from "@/components/CreatorResetPasswordScreen";

export default function TetherCreatorResetPasswordPage() {
  return <CreatorResetPasswordScreen authConfig={creatorPublicAuthConfig()} brand="tether" />;
}
