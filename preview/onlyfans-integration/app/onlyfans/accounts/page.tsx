import LivePage from "@/app/onlyfans/accounts/page";
import { UiFixturePage } from "../../../ui-fixtures";
export const dynamic = "force-dynamic";
export default function PreviewPage({ searchParams }: { searchParams: Parameters<typeof LivePage>[0]["searchParams"] }) {
  return process.env.ONLYFANS_UI_FIXTURE === "1" ? <UiFixturePage section="accounts" /> : <LivePage searchParams={searchParams} />;
}
