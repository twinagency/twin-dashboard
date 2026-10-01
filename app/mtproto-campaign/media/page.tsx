import { getCreators } from "@/components/mtproto/data";
import MediaCampaignForm from "@/components/mtproto/MediaCampaignForm";

export const dynamic = "force-dynamic";

export default async function MediaCampaignPage() {
  return <MediaCampaignForm creators={await getCreators()} />;
}
