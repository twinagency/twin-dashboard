"use client";

// The OnlyFans Accounts surface.
//
// The composition is the dashboard's own: `dashboard-page`, an `h1` at
// `text-2xl font-semibold` with a `text-sm text-muted` line under it, a row of
// `p-4` stat cards, then a card grid — the shape `app/storage/page.tsx` uses for
// its creator grid. Nothing here invents a second visual language.

import Link from "next/link";
import { CreatorPlatformHeading } from "./CreatorPlatformPage";
import type { ReactNode } from "react";
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
import type { ConnectionCreator } from "@/lib/onlyfans-connections/contract";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 font-mono text-2xl font-semibold">{value}</div>
    </Card>
  );
}

function AccountCard({ account, readOnly, connectionEditable, showPreviewChrome }: { account: OfAccount; readOnly: boolean; connectionEditable: boolean; showPreviewChrome: boolean }) {
  return (
    <Card className="flex h-full flex-col p-4" data-of-account-id={account.accountId}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold">{account.binding.creatorName}</div>
          <div className="mt-0.5 truncate text-xs text-muted">@{account.binding.handle}</div>
        </div>
        <HealthPill health={account.health} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <ModePill mode={account.automationMode} />
        <FreshnessLine freshness={account.syncFreshness} />
      </div>

      {account.healthReason ? (
        <p className="mt-3 text-xs leading-5 text-[#8a5f06]" data-of-health-reason>
          {account.healthReason}
        </p>
      ) : null}

      <dl className="mt-4 space-y-1.5 text-xs">
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

      <details className="mt-4 border-t border-line pt-2 text-xs text-muted" onClick={event => event.stopPropagation()}>
        <summary>Account details</summary><p className="break-all">Binding {account.binding.bindingId}</p>
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
          className="text-sm font-semibold text-accent"
        >
          Open inbox →
        </Link>
        {account.health !== "connected" && !connectionEditable ? (
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
      {connectionEditable ? <ConnectionEditor accountId={account.accountId} /> : null}
    </Card>
  );
}

export default function AccountsView({
  controls,
  accountsState,
  activeAccountId,
  onSelectAccount,
  readOnly,
  creatorName,
  sourceLabel,
  showPreviewChrome = true,
  connectionsConfigured = false,
  connectionCreators = [],
}: {
  controls?: ReactNode;
  accountsState: RequestState<OfAccount[]>;
  activeAccountId: string | null;
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
}) {
  const accounts =
    accountsState.status === "ready" || accountsState.status === "stale" ? accountsState.data : [];
  const connected = accounts.filter((account) => account.health === "connected").length;
  const needsAttention = accounts.length - connected;

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

      {connectionsConfigured && !showPreviewChrome && !readOnly && ["ready", "stale", "empty"].includes(accountsState.status) ? <RegisterConnection creators={connectionCreators} /> : null}

      <RequestStateBlock
        state={accountsState}
        label="accounts"
        render={(list) => (
          <>
            <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3">
              <Stat label="Accounts" value={String(list.length)} />
              <Stat label="Connected" value={String(connected)} />
              <Stat label="Need attention" value={String(needsAttention)} />
            </div>

            {list.length === 0 ? (
              <Card className="p-4 text-sm text-muted">
                {creatorName
                  ? `No OnlyFans account is connected to ${creatorName} yet.`
                  : "Your OnlyFans accounts will appear here once connected."}{" "}
                {connectionsConfigured && !showPreviewChrome && !readOnly ? "Choose Add OnlyFans account to start setup for an existing creator." : "Ask your account administrator to connect an OnlyFans account."}
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((account) => (
                  <div key={account.accountId} onClick={() => onSelectAccount(account.accountId)}>
                    <AccountCard account={account} readOnly={readOnly} showPreviewChrome={showPreviewChrome}
                      connectionEditable={connectionsConfigured && !showPreviewChrome && !readOnly && ["ready", "stale"].includes(accountsState.status)} />
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
