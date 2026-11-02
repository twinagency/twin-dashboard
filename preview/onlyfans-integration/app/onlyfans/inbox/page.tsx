import LivePage from "@/app/onlyfans/inbox/page";
import { UiFixturePage } from "../../../ui-fixtures";
export const dynamic = "force-dynamic";
export default function PreviewPage() {
  return process.env.ONLYFANS_UI_FIXTURE === "1" ? <UiFixturePage section="inbox" /> : <LivePage />;
}
