import CreatorLoginScreen from "@/components/CreatorLoginScreen";
export const metadata = { title: "Creator sign in · LYNQ", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default function LinkCreatorLogin(props: { searchParams: Promise<{ next?: string; error?: string }> }) {
  return <CreatorLoginScreen {...props} brand="link" />;
}
