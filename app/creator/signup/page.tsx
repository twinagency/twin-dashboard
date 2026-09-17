import CreatorSignupScreen from "@/components/CreatorSignupScreen";

export const metadata = { title: "Create creator account · Twin" };
export const dynamic = "force-dynamic";

export default async function CreatorSignupPage(props: { searchParams: Promise<{ error?: string; code?: string }> }) {
  // ?code= comes from an agency invite link generated at /agency-admin/creator-codes.
  // It only prefills the field, the signup route still validates and claims it.
  const { code } = await props.searchParams;
  const initialAgencyCode = typeof code === "string" ? code.trim().toUpperCase().slice(0, 64) : undefined;
  return <CreatorSignupScreen {...props} brand="twin" initialAgencyCode={initialAgencyCode || undefined} />;
}
