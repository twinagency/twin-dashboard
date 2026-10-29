import AccountIdentity from "./AccountIdentity";
import Link from "@/components/NavigationLink";
import { CreatorPlatformHeading } from "./CreatorPlatformPage";
import { Card } from "@/components/ui/card";
import { workspaceHref } from "@/lib/onlyfans-preview/scope";
import type { OfAccount } from "@/lib/onlyfans-preview/types";
import { CONFIG_ISSUES, formatRecordedMoney, type NativeSection, type WorkspaceRead } from "@/lib/onlyfans/workspace";
import ConfigurationEditor from "./ConfigurationEditor";
import ContentEditor from "./ContentEditor";
import ContentLibrary from "./ContentLibrary";
import OfferImportPanel from "./OfferImportPanel";
import SalesView from "./SalesView";
import CreatorPortrait from "./CreatorPortrait";
import { StudioTabs, StudioTabPanel, StudioTabSection } from "./StudioTabs";

const READY = { disabled: "Disabled", free_teaser: "Free teaser", needs_review: "Needs review", terms_checked: "Terms checked" } as const;
const TITLES = { content: "Content", sales: "Sales", settings: "Settings" } as const;
const yesNo = (value: boolean | null) => value === null ? "Not explicitly saved" : value ? "Enabled" : "Disabled";

export default function NativeWorkspaceView({ section, account, accounts, data, creatorId, cursor, contentConfigured, configurationConfigured, canManage, agency }: {
  section: NativeSection; account: OfAccount; accounts: OfAccount[]; data: WorkspaceRead; creatorId: string | null; cursor: string | null;
  contentConfigured: boolean; configurationConfigured: boolean; canManage: boolean; agency: boolean;
}) {
  const title = TITLES[section];
  const description = section === "content" ? "Your content, organised and ready to share." : section === "sales" ? "See who bought what, from which creator, and when." : "Your personality, preferences and AI reply settings.";
  const path = `/onlyfans/${section}`;
  const next = "nextCursor" in data ? data.nextCursor : null;
  const href = workspaceHref(path, { creatorId, accountId: account.accountId });
  return <div className="dashboard-page min-w-0 text-ink" data-of-native-section={section}>
    <AccountIdentity account={account} />
    <CreatorPlatformHeading title={title} description={`${account.binding.creatorName} · @${account.binding.handle} · ${description}`} />
    <nav aria-label={`${title} account`} className="of-native-accounts">
      {accounts.map(item => <Link key={item.accountId} aria-current={item.accountId === account.accountId ? "page" : undefined}
        className={`rounded-lg border px-3 py-2 text-sm ${item.accountId === account.accountId ? "border-accent text-accent" : "border-line text-muted"}`}
        href={workspaceHref(path, { creatorId, accountId: item.accountId })}>{item.binding.creatorName} · @{item.binding.handle}</Link>)}
    </nav>
    {section !== "content" ? <details className="of-history-status" data-of-native-freshness>
      <summary>{data.historyRecoveryRequired ? "Your account history is still syncing." : "Your account history is synced."}</summary>
      <p>Last synced: {data.lastCompleteSyncAt ?? "Not recorded"}. {data.providerConnectionVerified ? "Provider connection is verified." : "Provider connection has not been verified."}</p>
    </details> : null}
    {section === "content" ? <ContentLibrary accountId={account.accountId} readOnly={!canManage} configured={contentConfigured} offers={<>{contentConfigured ? <OfferImportPanel key={`import:${account.accountId}`} accountId={account.accountId} readOnly={!canManage} /> : null}<WorkspaceBody data={data} contentEditable={canManage && contentConfigured} /></>} /> : null}
    {data.section === "sales" ? <SalesView data={data} creatorName={account.binding.creatorName} creatorId={account.binding.creatorId} /> : null}
    {section === "settings" ? <StudioTabs label="Creator settings" tabs={[{ value: "personality", label: "Personality" }, { value: "replies", label: "Reply settings" }, { value: "account", label: "Account" }]}>
      <div className="of-settings-layout"><aside className="of-identity-card"><CreatorPortrait creatorId={account.binding.creatorId} name={account.binding.creatorName} large /><h2>{account.binding.creatorName}</h2><p>@{account.binding.handle}</p><span className="of-platform-tag">OnlyFans</span></aside><div className="of-settings-content">
        <StudioTabSection value={["personality", "replies"]}>{canManage && configurationConfigured ? <ConfigurationEditor key={account.accountId} accountId={account.accountId} /> : <><StudioTabPanel value="personality"><WorkspaceBody data={data} settingsSection="personality" /></StudioTabPanel><StudioTabPanel value="replies"><WorkspaceBody data={data} settingsSection="replies" /></StudioTabPanel></>}</StudioTabSection>
        <StudioTabPanel value="account"><section className="of-panel"><h2>Account details</h2><div className="mt-4"><WorkspaceBody data={data} /></div></section></StudioTabPanel>
      </div></div>
    </StudioTabs> : null}
    {next ? <Link data-of-next-page className="mt-5 inline-block rounded-lg border border-line px-4 py-2 text-sm font-semibold text-accent"
      href={`${href}${href.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(next)}`}>Next page →</Link> : null}
    {cursor ? <Link className="ml-4 mt-5 inline-block text-sm text-accent" href={href}>Back to first page</Link> : null}
    <div className="mt-6 flex flex-wrap gap-4 text-sm font-semibold text-accent"><Link href={workspaceHref("/onlyfans/inbox", { creatorId, accountId: account.accountId })}>Open inbox →</Link><Link href={workspaceHref("/onlyfans/launch", { creatorId, accountId: account.accountId })}>Launch control →</Link>{!agency ? <Link href={workspaceHref("/onlyfans/operations", { creatorId, accountId: account.accountId })}>Processing status →</Link> : null}</div>
  </div>;
}

function WorkspaceBody({ data, contentEditable = false, settingsSection }: { data: WorkspaceRead; contentEditable?: boolean; settingsSection?: "personality" | "replies" }) {
  if (data.section === "content") return <section className="mt-8"><h2 className="mb-2 text-lg font-semibold">Items prepared for sale</h2><p className="mb-4 text-sm text-muted">Your curated offers, separate from the media library above.</p><div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3" data-of-catalogue>
    {data.items.map(item => <Card key={item.itemId} className="min-w-0 p-4" data-of-catalog-item={item.itemId}>
      <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="break-words font-semibold">{item.label}</h2><span className="rounded-full bg-elev px-2 py-1 text-xs text-muted">{READY[item.readiness]}</span></div>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm text-muted">{item.description || "No saved description."}</p>
      {item.descriptionTruncated ? <p className="mt-1 text-xs text-muted">Description excerpt.</p> : null}
      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm"><dt className="text-muted">Media</dt><dd>{item.mediaCount ?? "Needs review"}</dd><dt className="text-muted">Free previews</dt><dd>{item.previewCount ?? "Needs review"}</dd><dt className="text-muted">Saved price</dt><dd className="font-semibold">{item.priceCents === null ? "Needs review" : formatRecordedMoney(item.priceCents, item.currency)}</dd></dl>
      <p className="mt-3 text-xs text-muted">{item.kind}. {item.readiness === "terms_checked" ? "Catalogue terms passed the current media checks. Sale permission also depends on the conversation and account." : "Saved catalogue metadata."}</p>
      {contentEditable ? <ContentEditor key={`${data.accountId}:${item.itemId}`} accountId={data.accountId} itemId={item.itemId} /> : null}
    </Card>)}
    {!data.items.length ? <p className="text-sm text-muted">No items prepared for sale yet. Use Create offer to choose media and prepare an item for sale.</p> : null}
  </div></section>;
  if (data.section === "sales") return null;
  const cfg = data.configuration;
  return <div className="grid gap-4 lg:grid-cols-2" data-of-settings>
    {settingsSection !== "personality" ? <Card className="min-w-0 p-4"><h2 className="font-semibold">Recorded runtime permissions</h2><dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
      <dt className="text-muted">Account processing</dt><dd>{yesNo(data.runtimeEnabled)}</dd><dt className="text-muted">Delivery permission</dt><dd>{data.deliveryPolicy ? yesNo(data.deliveryPolicy.enabled) : "Not configured"}</dd><dt className="text-muted">Media permission</dt><dd>{data.deliveryPolicy ? yesNo(data.deliveryPolicy.mediaEnabled) : "Not configured"}</dd><dt className="text-muted">Used allowance</dt><dd>{data.deliveryPolicy ? `${data.deliveryPolicy.usedUnits} / ${data.deliveryPolicy.limitUnits}` : "Not configured"}</dd>
    </dl></Card> : null}
    {cfg ? <>
      {settingsSection !== "personality" ? <Card className="min-w-0 p-4"><h2 className="font-semibold">Saved model and language</h2><dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm"><dt className="text-muted">Default model</dt><dd className="break-all">{cfg.savedDefaultModel ?? "Not saved"}</dd><dt className="text-muted">Reply override</dt><dd className="break-all">{cfg.savedReplyModelOverride ?? "No saved override"}</dd><dt className="text-muted">Account language</dt><dd>{cfg.language ?? "No account override"}</dd><dt className="text-muted">Daily model cap per provider</dt><dd>{formatRecordedMoney(cfg.dailyModelCapCents, "USD")}</dd></dl><p className="mt-4 text-xs text-muted">Saved choices do not verify model credentials or a successful provider call.</p></Card> : null}
      {settingsSection !== "replies" ? <Card className="min-w-0 p-4"><h2 className="font-semibold">Creator persona{cfg.personaTruncated ? " excerpt" : ""}</h2><p className="mt-3 whitespace-pre-wrap break-words text-sm text-muted">{cfg.personaExcerpt || "Not saved."}</p><dl className="mt-4 space-y-3">{cfg.creatorFacts.map(fact => <div key={fact.label}><dt className="text-xs text-muted">{fact.label}</dt><dd className="mt-1 break-words text-sm">{fact.value}</dd></div>)}</dl></Card> : null}
      {settingsSection !== "personality" ? <Card className="min-w-0 p-4"><h2 className="font-semibold">Saved on-request sales permissions</h2><dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm"><dt className="text-muted">Media offers</dt><dd>{yesNo(cfg.salesPermissions.pack_send_enabled)}</dd><dt className="text-muted">Offers on request</dt><dd>{yesNo(cfg.salesPermissions.pack_on_ask_enabled)}</dd><dt className="text-muted">Qualification gate</dt><dd>{yesNo(cfg.salesPermissions.qualification_gate_enabled)}</dd></dl>{cfg.issues.length ? <ul className="mt-4 list-disc space-y-1 pl-4 text-xs text-muted">{cfg.issues.map(issue => <li key={issue}>{CONFIG_ISSUES[issue]}</li>)}</ul> : null}</Card> : null}
    </> : <Card className="p-4 text-sm text-muted">No creator configuration is saved.</Card>}
  </div>;
}

