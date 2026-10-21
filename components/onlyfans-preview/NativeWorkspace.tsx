import Link from "next/link";
import { CreatorPlatformHeading, CreatorPlatformEmpty } from "./CreatorPlatformPage";
import { NextResponse } from "next/server";
import { Card } from "@/components/ui/card";
import { requireOnlyFansRead, requestId } from "@/lib/onlyfans/route";
import { workspaceHref } from "@/lib/onlyfans-preview/scope";
import { CONFIG_ISSUES, formatRecordedMoney, type NativeSection, type WorkspaceRead } from "@/lib/onlyfans/workspace";
import { configuredConfigurationBackend } from "@/lib/onlyfans/configuration-backend";
import ConfigurationEditor from "./ConfigurationEditor";
import { configuredContentBackend } from "@/lib/onlyfans/content-backend";
import ContentEditor from "./ContentEditor";
import VaultManager from "./VaultManager";

export type NativeSearch = { account?: string | string[]; creator?: string | string[]; cursor?: string | string[] };
const TITLES = { content: "Content", sales: "Sales", settings: "Settings" } as const;
const READY = { disabled: "Disabled", free_teaser: "Free teaser", needs_review: "Needs review", terms_checked: "Terms checked" } as const;
const STATUSES: Record<string, string> = { cleared: "Cleared", pending: "Pending", refunded: "Refunded", chargedback: "Charged back", refund_pending: "Refund pending", failed: "Failed" };
const statusLabel = (value: string) => Object.hasOwn(STATUSES, value) ? STATUSES[value] : value;
const yesNo = (value: boolean | null) => value === null ? "Not explicitly saved" : value ? "Enabled" : "Disabled";

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
  const path = `/onlyfans/${section}`;
  const next = "nextCursor" in data ? data.nextCursor : null;
  const href = workspaceHref(path, { creatorId, accountId: account.accountId });
  return <div className="dashboard-page min-w-0 text-ink" data-of-native-section={section}>
    <CreatorPlatformHeading title={title} description={description} />
    <nav aria-label={`${title} account`} className="my-5 flex flex-wrap gap-2">
      {accounts.data.map(item => <Link key={item.accountId} aria-current={item.accountId === account.accountId ? "page" : undefined}
        className={`rounded-lg border px-3 py-2 text-sm ${item.accountId === account.accountId ? "border-accent text-accent" : "border-line text-muted"}`}
        href={workspaceHref(path, { creatorId, accountId: item.accountId })}>{item.binding.creatorName} · @{item.binding.handle}</Link>)}
    </nav>
    {section !== "content" ? <div className="mb-5 rounded-xl border border-line p-4 text-sm" role="status" data-of-native-freshness>
      <p>{data.historyRecoveryRequired ? "Your account history is still syncing." : "Your account history is synced."}</p>
      <p className="mt-1 text-xs text-muted">Last synced: {data.lastCompleteSyncAt ?? "Not recorded"}. {data.providerConnectionVerified ? "Provider connection is verified." : "Provider connection has not been verified."}</p>
    </div> : null}
    {section === "content" && configuredContentBackend(ctx.fetch) ? <VaultManager key={account.accountId} accountId={account.accountId} readOnly={!ctx.canManage} /> : null}
    {section !== "settings" ? <WorkspaceBody data={data} contentEditable={ctx.canManage && section === "content" && !!configuredContentBackend(ctx.fetch)} /> : null}
    {section === "settings" && ctx.canManage && configuredConfigurationBackend(ctx.fetch) ? <ConfigurationEditor key={account.accountId} accountId={account.accountId} /> : null}
    {section === "settings" ? <details className="mt-6 rounded-xl border border-line bg-panel p-5"><summary>Advanced account details</summary><div className="mt-4"><WorkspaceBody data={data} /></div></details> : null}
    {next ? <Link data-of-next-page className="mt-5 inline-block rounded-lg border border-line px-4 py-2 text-sm font-semibold text-accent"
      href={`${href}${href.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(next)}`}>Next page →</Link> : null}
    {cursor ? <Link className="ml-4 mt-5 inline-block text-sm text-accent" href={href}>Back to first page</Link> : null}
    <div className="mt-6 flex flex-wrap gap-4 text-sm font-semibold text-accent"><Link href={workspaceHref("/onlyfans/inbox", { creatorId, accountId: account.accountId })}>Open inbox →</Link>{!ctx.auth.agency ? <Link href={workspaceHref("/onlyfans/operations", { creatorId, accountId: account.accountId })}>Processing status →</Link> : null}</div>
  </div>;
}

function WorkspaceBody({ data, contentEditable = false }: { data: WorkspaceRead; contentEditable?: boolean }) {
  if (data.section === "content") return <section className="mt-8"><h2 className="mb-2 text-lg font-semibold">Items prepared for sale</h2><p className="mb-4 text-sm text-muted">Your curated offers, separate from the media library above.</p><div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3" data-of-catalogue>
    {data.items.map(item => <Card key={item.itemId} className="min-w-0 p-4" data-of-catalog-item={item.itemId}>
      <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="break-words font-semibold">{item.label}</h2><span className="rounded-full bg-elev px-2 py-1 text-xs text-muted">{READY[item.readiness]}</span></div>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm text-muted">{item.description || "No saved description."}</p>
      {item.descriptionTruncated ? <p className="mt-1 text-xs text-muted">Description excerpt.</p> : null}
      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm"><dt className="text-muted">Media</dt><dd>{item.mediaCount ?? "Needs review"}</dd><dt className="text-muted">Free previews</dt><dd>{item.previewCount ?? "Needs review"}</dd><dt className="text-muted">Saved price</dt><dd className="font-semibold">{item.priceCents === null ? "Needs review" : formatRecordedMoney(item.priceCents, item.currency)}</dd></dl>
      <p className="mt-3 text-xs text-muted">{item.kind}. {item.readiness === "terms_checked" ? "Catalogue terms passed the current media checks. Sale permission also depends on the conversation and account." : "Saved catalogue metadata."}</p>
      {contentEditable ? <ContentEditor key={`${data.accountId}:${item.itemId}`} accountId={data.accountId} itemId={item.itemId} /> : null}
    </Card>)}
    {!data.items.length ? <p className="text-sm text-muted">No items prepared for sale yet. Choose media above, then open Create an item for sale.</p> : null}
  </div></section>;
  if (data.section === "sales") return <div data-of-sales>
    <h2 className="font-semibold">All recorded transactions</h2>
    <p className="mt-1 text-xs text-muted">Gross amounts remain separate by currency and payment status. An offer or delivery receipt is not a purchase.</p>
    <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">{data.totals.map(total => <Card key={`${total.currency}:${total.status}`} className="min-w-0 p-4" data-of-sales-total={`${total.currency}:${total.status}`}>
      <div className="text-xs text-muted">{statusLabel(total.status)} gross</div><div className="mt-2 break-words font-mono text-lg font-semibold">{formatRecordedMoney(total.grossCents, total.currency)}</div><div className="mt-1 text-xs text-muted">{total.count} recorded {total.count === 1 ? "transaction" : "transactions"}</div>
    </Card>)}</div>
    <Card className="mt-5 p-4" data-of-open-offers><h2 className="font-semibold">Open offers: {data.openOfferCount}</h2>
      <p className="mt-1 text-xs text-muted">These are recorded offers, not payments. A message reference alone does not confirm delivery.</p>
      <ul className="mt-3 space-y-2">{data.openOffers.map(offer => <li key={offer.offerId} className="flex flex-wrap justify-between gap-2 border-t border-line pt-2 text-sm"><span>Fan {offer.fanId} · {offer.mode}{offer.messageId === null ? " · No message reference" : " · Message reference recorded"}</span><span className="font-mono">{offer.mode === "ppv" && offer.priceCents > 0 ? formatRecordedMoney(offer.priceCents, offer.currency) : offer.mode === "tip" && offer.tipUnlockCents > 0 ? `Tip threshold: ${formatRecordedMoney(offer.tipUnlockCents, offer.currency)}` : offer.mode === "both" && offer.priceCents > 0 && offer.tipUnlockCents > 0 ? `${formatRecordedMoney(offer.priceCents, offer.currency)} / tip ${formatRecordedMoney(offer.tipUnlockCents, offer.currency)}` : "Review saved terms"}</span></li>)}</ul>
      {data.moreOpenOffers ? <p className="mt-3 text-xs text-muted">Showing the latest {data.openOffers.length} open offers of {data.openOfferCount}.</p> : null}
    </Card>
    <ul className="mt-5 space-y-3">{data.transactions.map(item => <li key={item.transactionId} data-of-sale={item.transactionId} className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap justify-between gap-2"><span className="break-words font-semibold">{item.kind.replaceAll("_", " ")}</span><span className="font-mono font-semibold">{formatRecordedMoney(item.grossCents, item.currency)}</span></div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted"><span>{statusLabel(item.status)}</span><span>{item.occurredAt}</span><span>{item.fanId ? `Fan ${item.fanId}` : "No fan reference"}</span>{item.netCents === null ? null : <span>Recorded net: {formatRecordedMoney(item.netCents, item.currency)}</span>}</div>
    </li>)}</ul>
    {!data.transactions.length ? <p className="mt-4 text-sm text-muted">No transactions are recorded on this page.</p> : null}
  </div>;
  const cfg = data.configuration;
  return <div className="grid gap-4 lg:grid-cols-2" data-of-settings>
    <Card className="min-w-0 p-4"><h2 className="font-semibold">Recorded runtime permissions</h2><dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
      <dt className="text-muted">Account processing</dt><dd>{yesNo(data.runtimeEnabled)}</dd><dt className="text-muted">Delivery permission</dt><dd>{data.deliveryPolicy ? yesNo(data.deliveryPolicy.enabled) : "Not configured"}</dd><dt className="text-muted">Media permission</dt><dd>{data.deliveryPolicy ? yesNo(data.deliveryPolicy.mediaEnabled) : "Not configured"}</dd><dt className="text-muted">Used allowance</dt><dd>{data.deliveryPolicy ? `${data.deliveryPolicy.usedUnits} / ${data.deliveryPolicy.limitUnits}` : "Not configured"}</dd>
    </dl></Card>
    {cfg ? <>
      <Card className="min-w-0 p-4"><h2 className="font-semibold">Saved model and language</h2><dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm"><dt className="text-muted">Default model</dt><dd className="break-all">{cfg.savedDefaultModel ?? "Not saved"}</dd><dt className="text-muted">Reply override</dt><dd className="break-all">{cfg.savedReplyModelOverride ?? "No saved override"}</dd><dt className="text-muted">Account language</dt><dd>{cfg.language ?? "No account override"}</dd><dt className="text-muted">Daily model cap per provider</dt><dd>{formatRecordedMoney(cfg.dailyModelCapCents, "USD")}</dd></dl><p className="mt-4 text-xs text-muted">Saved choices do not verify model credentials or a successful provider call.</p></Card>
      <Card className="min-w-0 p-4"><h2 className="font-semibold">Creator persona{cfg.personaTruncated ? " excerpt" : ""}</h2><p className="mt-3 whitespace-pre-wrap break-words text-sm text-muted">{cfg.personaExcerpt || "Not saved."}</p><dl className="mt-4 space-y-3">{cfg.creatorFacts.map(fact => <div key={fact.label}><dt className="text-xs text-muted">{fact.label}</dt><dd className="mt-1 break-words text-sm">{fact.value}</dd></div>)}</dl></Card>
      <Card className="min-w-0 p-4"><h2 className="font-semibold">Saved on-request sales permissions</h2><dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm"><dt className="text-muted">Media offers</dt><dd>{yesNo(cfg.salesPermissions.pack_send_enabled)}</dd><dt className="text-muted">Offers on request</dt><dd>{yesNo(cfg.salesPermissions.pack_on_ask_enabled)}</dd><dt className="text-muted">Qualification gate</dt><dd>{yesNo(cfg.salesPermissions.qualification_gate_enabled)}</dd></dl>{cfg.issues.length ? <ul className="mt-4 list-disc space-y-1 pl-4 text-xs text-muted">{cfg.issues.map(issue => <li key={issue}>{CONFIG_ISSUES[issue]}</li>)}</ul> : null}</Card>
    </> : <Card className="p-4 text-sm text-muted">No creator configuration is saved.</Card>}
  </div>;
}
