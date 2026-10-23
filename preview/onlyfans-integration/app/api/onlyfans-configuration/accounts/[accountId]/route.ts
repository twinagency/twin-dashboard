import { GET as liveGet, POST } from "@/app/api/onlyfans-configuration/accounts/[accountId]/route";
import { configurationFixture } from "../../../../../ui-fixtures";
export { POST };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(...args: Parameters<typeof liveGet>) {
  return process.env.ONLYFANS_UI_FIXTURE === "1" ? Response.json(configurationFixture((await args[1].params).accountId)) : liveGet(...args);
}
