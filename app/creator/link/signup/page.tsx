import CreatorSignupScreen from "@/components/CreatorSignupScreen";
export const metadata = { title: "Join LYNQ as a creator", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default function LinkCreatorSignup(props: { searchParams: Promise<{ error?: string }> }) {
  return <CreatorSignupScreen {...props} brand="link" />;
}
