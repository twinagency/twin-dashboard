import { headers } from "next/headers";
import CreatorResetPasswordScreen from "@/components/CreatorResetPasswordScreen";
import { isLynqHost } from "@/lib/form-origin";
import { agencyForSlug } from "@/lib/creator-invite-agency";

export const dynamic = "force-dynamic";

export default async function Page() {
  // On the Moxy host (dashboard.lynqai.co) this page wears Moxy's brand, like its sign-in page.
  const moxy = isLynqHost({ headers: (await headers()) as unknown as Headers }) ? await agencyForSlug("moxy") : null;
  return <CreatorResetPasswordScreen brand="twin" agencyBrand={moxy ? { name: moxy.name, slug: moxy.slug, logo: moxy.logo, dark: moxy.dark } : null} />;
}
