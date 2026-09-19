import { creatorPublicAuthConfig } from "@/lib/creator-public-auth";
import CreatorResetPasswordScreen from "@/components/CreatorResetPasswordScreen";

export default function CreatorResetPasswordPage() {
  return <CreatorResetPasswordScreen authConfig={creatorPublicAuthConfig()} brand="twin" />;
}
