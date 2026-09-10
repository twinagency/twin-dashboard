import CreatorSignupScreen from "@/components/CreatorSignupScreen";

export const metadata = { title: "Create creator account · Twin" };
export const dynamic = "force-dynamic";

export default function CreatorSignupPage(props: { searchParams: Promise<{ error?: string }> }) {
  return <CreatorSignupScreen {...props} />;
}
