import LivePage from "@/app/onlyfans/operations/page";
import { UiFixturePage } from "../../../ui-fixtures";
export const dynamic = "force-dynamic";
export default function PreviewPage(props: Parameters<typeof LivePage>[0]) {
  return process.env.ONLYFANS_UI_FIXTURE === "1" ? <UiFixturePage section="operations" /> : <LivePage {...props} />;
}
