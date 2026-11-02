import LivePage from "@/app/onlyfans/campaigns/page";
import { UiFixturePage } from "../../../ui-fixtures";
export const dynamic = "force-dynamic";
export default function PreviewPage(props: Parameters<typeof LivePage>[0]) {
  return process.env.ONLYFANS_UI_FIXTURE === "1" ? <UiFixturePage section="campaigns" /> : <LivePage {...props} />;
}
