import { notFound } from "next/navigation";
import CreatorTelegramFeed from "@/components/CreatorTelegramFeed";
import { requireCreatorWorkspace } from "@/lib/creator-dashboard";
import { getCreatorTelegramScope } from "@/lib/creator-telegram-access";

export const dynamic = "force-dynamic";

export default async function CreatorTelegramPage() {
  const creator = await requireCreatorWorkspace();
  if (!await getCreatorTelegramScope(creator)) notFound();
  return <CreatorTelegramFeed />;
}
