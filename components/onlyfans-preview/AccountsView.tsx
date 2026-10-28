"use client";

// The OnlyFans Accounts surface.
//
// The composition is the dashboard's own: `dashboard-page`, an `h1` at
// `text-2xl font-semibold` with a `text-sm text-muted` line under it, a row of
// `p-4` stat cards, then a card grid — the shape `app/storage/page.tsx` uses for
// its creator grid. Nothing here invents a second visual language.

import AdminOnlyFansSignIn from "./AdminOnlyFansSignIn";
import Link from "next/link";
import { CreatorPlatformHeading } from "./CreatorPlatformPage";
import { useEffect, useRef, type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatAge } from "@/lib/onlyfans-preview/fixtures";
import { workspaceHref } from "@/lib/onlyfans-preview/scope";
import type { OfAccount, RequestState } from "@/lib/onlyfans-preview/types";
import { HealthPill, ModePill, SimulatedTag } from "./labels";
import { FreshnessLine } from "./PreviewChrome";
import PreviewNotice from "./PreviewNotice";
import { RequestStateBlock } from "./RequestStateBlock";
import ConnectionEditor, { RegisterConnection } from "./ConnectionEditor";
import CreatorPortrait from "./CreatorPortrait";
import type { ConnectionCreator } from "@/lib/onlyfans-connections/contract";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 font-mono text-2xl font-semibold">{value}</div>
    </Card>
  );
}

function AccountCard({ account, readOnly, connectionEditable, agencyConnectionEditable, showPreviewChrome, openConnection }: { account: OfAccount; readOnly: boolean; connectionEditable: boolean; agencyConnectionEditable: boolean; showPreviewChrome: boolean; openConnection: boolean }) {
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (openConnection) { card.current?.scrollIntoView({ block: "start" }); card.current?.focus({ preventScroll: true }); }
  }, [openConnection]);
  return (
    <Card ref={card} tabIndex={-1} id={`connection-${account.accountId}`} className="flex h-full flex-col p-4 scroll-mt-6" data-of-account-id={account.accountId}>
      <div className="of-account-identity">
        <CreatorPortrait creatorId={account.binding.creatorId} name={account.binding.creatorName} large />
        <div className="min-w-0">
          <div className="of-account-name">{account.binding.creatorName}</div>
          <div className="mt-0.5 truncate text-sm text-muted">@{account.binding.handle}</div><span className="of-account-brand"><img src="/brand/platforms/onlyfans.svg" alt="" />OnlyFans</span>
        </div>
      </div>

      <dl className="of-account-status">
        <div><dt>Connection</dt><dd><HealthPill health={account.health} /></dd></div>
        <div><dt>Replies</dt><dd>{showPreviewChrome ? <ModePill mode={account.automationMode} /> : <span>Managed per fan in Inbox</span>}</dd></div>
        <div><dt>Last sync</dt><dd><FreshnessLine freshness={account.syncFreshness} /></dd></div>
      </dl>

      {account.syncHealth ? <dl className="mt-3 space-y-2 text-xs">{Object.entries(account.syncHealth).map(([area, status]) => <div key={area}><dt className="font-semibold capitalize">{area}</dt><dd>{status.lastSuccessAt || status.observedAt ? new Date((status.lastSuccessAt ?? status.observedAt)!).toLocaleString("en-AU", { timeZone: "Australia/Brisbane" }) + " AEST" : "No successful observation recorded"}{status.pending !== undefined ? ` · ${status.pending} pending` : ""}{status.pendingConversations !== undefined ? ` · ${status.pendingConversations} conversations pending` : ""}{status.quarantined ? ` · ${status.quarantined} quarantined` : ""}{status.reason ? ` · ${status.reason}` : ""}</dd></div>)}</dl> : null}
      {account.healthReason ? (
        <p className="mt-3 text-xs leading-5 text-[#8a5f06]" data-of-health-reason>
          {account.healthReason}
        </p>
      ) : null}

      <details open={openConnection && !connectionEditable || undefined} className="mt-4 border-t border-line pt-2 text-xs text-muted" onClick={event => event.stopPropagation()}>
        <summary>Account details</summary>      <dl className="mt-4 space-y-1.5 text-xs">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted">Manual send</dt>
          <dd className="font-semibold">{account.capabilities.sendManualMessage}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted">Takeover</dt>
          <dd className="font-semibold">{account.capabilities.requestTakeover}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted">Resolve delivery</dt>
          <dd className="font-semibold">{account.capabilities.resolveDeliveryEvidence}</dd>
        </div>
      </dl>

<p className="break-all">Binding {account.binding.bindingId}</p>
        <p className="mt-1">Synced {formatAge(account.syncFreshness.asOf)}</p>
      </details>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link
          // The creator and account travel in the URL, so this opens *this*
          // account rather than whichever one the inbox would default to. The
          // creator is taken from the server's own binding, not guessed.
          href={workspaceHref("/onlyfans/inbox", {
            creatorId: account.binding.creatorId,
            accountId: account.accountId,
          })}
          // The card around this link selects the account for the grid's own
          // highlight. Letting that handler run as well would fire a same-page
          // scope rewrite in the same tick as this navigation and win the race,
          // leaving the operator on Accounts after clicking "Open inbox".
          onClick={(event) => event.stopPropagation()}
          data-of-open-inbox={account.accountId}
          className="of-primary"
        >
          Open inbox →
        </Link>
        {account.health !== "connected" && !connectionEditable && !agencyConnectionEditable ? (
          <>
            <button
              type="button"
              disabled
              title={showPreviewChrome ? "Reconnecting is done by the backend, which this preview does not reach." : "Account connection management is not configured."}
              className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-muted disabled:cursor-not-allowed"
            >
              Reconnect
              <ArrowUpRight className="size-3.5 opacity-60" />
            </button>
            {showPreviewChrome ? <SimulatedTag /> : null}
          </>
        ) : null}
        {readOnly ? <span className="text-[11px] text-muted">Read only</span> : null}
      </div>
      {agencyConnectionEditable ? <div className="mt-3 flex flex-wrap items-start gap-2"><AdminOnlyFansSignIn creators={[{id:account.binding.creatorId,name:account.binding.creatorName}]} accountId={account.accountId}/></div> : null}
      {connectionEditable ? <ConnectionEditor accountId={account.accountId} creatorId={account.binding.creatorId} creatorName={account.binding.creatorName} initiallyOpen={openConnection} /> : null}
    </Card>
  );
}

export default function AccountsView({
  controls,
  accountsState,
  activeAccountId,
  openConnectionAccountId = null,
  onSelectAccount,
  readOnly,
  creatorName,
  sourceLabel,
  showPreviewChrome = true,
  connectionsConfigured = false,
  connectionCreators = [],
  agencyConnections = false,
}: {
  controls?: ReactNode;
  accountsState: RequestState<OfAccount[]>;
  activeAccountId: string | null;
  openConnectionAccountId?: string | null;
  onSelectAccount: (accountId: string) => void;
  readOnly: boolean;
  /** From the account binding the server returned; null when nothing came back. */
  creatorName: string | null;
  sourceLabel: string;
  /**
   * False on a live surface: the sample-data badge and the developer controls
   * describe fixture data and must not appear over real reads.
   */
  showPreviewChrome?: boolean;
  /** Positive server configuration only; fixtures and read-only sessions still hide writes. */
  connectionsConfigured?: boolean;
  connectionCreators?: ConnectionCreator[];
  agencyConnections?: boolean;
}) {
  const accounts =
    accountsState.status === "ready" || accountsState.status === "stale" ? accountsState.data : [];
  const connected = accounts.filter((account) => account.health === "connected").length;
  const needsAttention = accounts.filter(account => account.health !== "connected" || account.needsAttention || account.syncFreshness.stale).length;

  return (
    <div className="dashboard-page text-ink" data-of-surface="onlyfans-accounts">
      <CreatorPlatformHeading title="Accounts" description={creatorName
        ? `Manage ${creatorName}’s OnlyFans accounts and choose how you want to reply.`
        : "Your creator accounts, connections and reply settings, together."} />
      {showPreviewChrome ? <span data-of-source-note>{sourceLabel}</span> : null}

      {showPreviewChrome ? <PreviewNotice controls={controls} /> : null}

      {readOnly ? (
        <div
          data-of-readonly
          className="mb-5 rounded-xl border border-[#dce8fb] bg-[#edf3fc] p-3 text-xs leading-5 text-[#2f6fed]"
        >
          Read only. You are viewing as the creator. You can explore this account’s activity and settings here.
        </div>
      ) : null}

      {connectionsConfigured && !showPreviewChrome && !readOnly && ["ready", "stale", "empty"].includes(accountsState.status) ? agencyConnections ? <AdminOnlyFansSignIn creators={connectionCreators} /> : <RegisterConnection creators={connectionCreators} /> : null}

      <RequestStateBlock
        state={accountsState}
        label="accounts"
        render={(list) => (
          <>
            <div className="of-account-counts">
              <Stat label="Accounts" value={String(list.length)} />
              <Stat label="Connected" value={String(connected)} />
              <Stat label="Need attention" value={String(needsAttention)} />
            </div>

            {list.length === 0 ? (
              <Card className="p-4 text-sm text-muted">
                {creatorName
                  ? `No OnlyFans account is connected to ${creatorName} yet.`
                  : "Your OnlyFans accounts will appear here once connected."}{" "}
                {connectionsConfigured && !showPreviewChrome && !readOnly ? "Choose Add OnlyFans account to add a creator or select an existing creator." : "Ask your account administrator to connect an OnlyFans account."}
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((account) => (
                  <div key={account.accountId} data-of-selected={activeAccountId === account.accountId || undefined} role="group" tabIndex={0} aria-label={`Select ${account.binding.creatorName} account`} onKeyDown={event => { if (event.target === event.currentTarget && ["Enter", " "].includes(event.key)) { event.preventDefault(); onSelectAccount(account.accountId); } }} onClick={() => onSelectAccount(account.accountId)}>
                    <AccountCard account={account} readOnly={readOnly} showPreviewChrome={showPreviewChrome}
                      openConnection={openConnectionAccountId === account.accountId}
                      agencyConnectionEditable={agencyConnections && connectionsConfigured && !showPreviewChrome && !readOnly && ["ready", "stale"].includes(accountsState.status)}
                      connectionEditable={!agencyConnections && connectionsConfigured && !showPreviewChrome && !readOnly && ["ready", "stale"].includes(accountsState.status)} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      />
    </div>
  );
}


