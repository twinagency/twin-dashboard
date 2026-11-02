import { GET as liveGet } from "@/app/api/onlyfans-content/accounts/[accountId]/vault/route";
import { vaultFixture } from "../../../../../../ui-fixtures";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(...args: Parameters<typeof liveGet>) {
  return process.env.ONLYFANS_UI_FIXTURE === "1" ? Response.json(vaultFixture((await args[1].params).accountId)) : liveGet(...args);
}
