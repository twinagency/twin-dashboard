import AbcWorkspace from "@/components/onlyfans-launch/AbcWorkspace";
import { ID } from "@/lib/onlyfans/launch/a-types";

export const dynamic = "force-dynamic";
export default async function LaunchPage({ searchParams }: { searchParams: Promise<{ account?: string | string[] }> }) {
  const query = await searchParams;
  const account = typeof query.account === "string" && ID.test(query.account) ? query.account : null;
  return <AbcWorkspace initialAccountId={account} />;
}
