import AbcWorkspace from "@/components/onlyfans-launch/AbcWorkspace";
import { ID, SCREENS, type Screen } from "@/lib/onlyfans/launch/a-types";

export const dynamic = "force-dynamic";
export default async function LaunchPage({ searchParams }: { searchParams: Promise<{ account?: string | string[]; screen?: string | string[] }> }) {
  const query = await searchParams;
  const account = typeof query.account === "string" && ID.test(query.account) ? query.account : null;
  const screen = typeof query.screen === "string" && (SCREENS as string[]).includes(query.screen) ? query.screen as Screen : undefined;
  return <AbcWorkspace initialAccountId={account} initialScreen={screen} />;
}
