import CreatorLoginScreen from "@/components/CreatorLoginScreen";

export const metadata = { title: "Creator sign in · FLIRT" };
export const dynamic = "force-dynamic";

export default function CreatorLoginPage(props: { searchParams: Promise<{ next?: string; error?: string }> }) {
  return <CreatorLoginScreen {...props} brand="twin" />;
}
