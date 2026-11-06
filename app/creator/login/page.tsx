import { getFlirtCreatorLocale } from "@/lib/flirt-creator-locale-server";
import CreatorLoginScreen from "@/components/CreatorLoginScreen";

export async function generateMetadata() {
  const locale = await getFlirtCreatorLocale();
  return { title: locale === "pt-BR" ? "Entrar na conta de criadora · FLIRT" : "Creator sign in · FLIRT" };
}
export const dynamic = "force-dynamic";

export default function CreatorLoginPage(props: { searchParams: Promise<{ next?: string; error?: string }> }) {
  return <CreatorLoginScreen {...props} brand="twin" />;
}
