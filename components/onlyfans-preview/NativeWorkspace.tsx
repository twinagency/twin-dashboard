import { CreatorPlatformHeading, CreatorPlatformEmpty } from "./CreatorPlatformPage";
import { NextResponse } from "next/server";
import { requireOnlyFansRead, requestId } from "@/lib/onlyfans/route";
import { type NativeSection } from "@/lib/onlyfans/workspace";
import { configuredConfigurationBackend } from "@/lib/onlyfans/configuration-backend";
import { configuredContentBackend } from "@/lib/onlyfans/content-backend";
import NativeWorkspaceView from "./NativeWorkspaceView";

export type NativeSearch = { account?: string | string[]; creator?: string | string[]; cursor?: string | string[] };
const TITLES = { content: "Content", sales: "Sales", settings: "Settings" } as const;
export default async function NativeWorkspace({ section, searchParams }: { section: NativeSection; searchParams: Promise<NativeSearch> }) {
  const title = TITLES[section];
  const description = section === "content" ? "Your content, organised and ready to share." : section === "sales" ? "See your purchases, payments and refunds." : "Your personality, preferences and AI reply settings.";
  const unavailable = (message: string, connect = false) => <div className="dashboard-page"><CreatorPlatformHeading title={title} description={description} /><CreatorPlatformEmpty title={connect ? "Bring your account into your studio." : "Let’s get this ready."} description={message} actionHref={connect ? "/onlyfans/accounts" : undefined} /></div>;
  const ctx = await requireOnlyFansRead({ agency: true });
  if (ctx instanceof NextResponse) return unavailable("Your session cannot read this section. Sign in again.");
  if (!ctx.backend?.getWorkspace) return unavailable("This section is not configured.");
  const query = await searchParams;
  const accountId = typeof query.account === "string" ? requestId(query.account) : null;
  const creatorId = typeof query.creator === "string" ? requestId(query.creator) : null;
  const cursor = typeof query.cursor === "string" && /^[A-Za-z0-9_-]{1,256}$/.test(query.cursor) ? query.cursor : null;
  if ((query.account !== undefined && !accountId) || (query.creator !== undefined && !creatorId) ||
    (query.cursor !== undefined && !cursor) || (section === "settings" && cursor)) return unavailable("That account or page reference is invalid.");
  const accounts = await ctx.backend.listAccounts({ creatorId });
  if (!accounts.ok) return unavailable(accounts.error);
  const account = accountId ? accounts.data.find(item => item.accountId === accountId) : accounts.data[0];
  if (!account) return unavailable(accountId ? "That account is not available to this session." : "Connect an OnlyFans account to see your content, earnings and settings here.", !accountId);
  const result = await ctx.backend.getWorkspace(account.accountId, section, cursor);
  if (!result.ok) return unavailable(result.error);
  const data = result.data;
  return <NativeWorkspaceView section={section} account={account} accounts={accounts.data} data={data} creatorId={creatorId} cursor={cursor}
    contentConfigured={!!configuredContentBackend(ctx.fetch)} configurationConfigured={!!configuredConfigurationBackend(ctx.fetch)} canManage={ctx.canManage} agency={ctx.auth.agency} />;
}

