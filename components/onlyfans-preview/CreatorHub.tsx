"use client";

// The selected creator's workspace, shown at the top of Creators.
//
// Everything here comes from data already loaded: the scoped account list and
// one earnings read made by the page. A line the backend did not report says
// "Not reported", and earnings that cannot be attributed to this creator say
// "Unavailable" rather than showing a zero.

import Link from "next/link";
import PlatformIcon from "@/components/PlatformIcon";
import { createContext, useContext, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { formatAge } from "@/lib/onlyfans-preview/fixtures";
import { parseWorkspaceScope, workspaceHref } from "@/lib/onlyfans-preview/scope";
import type { OfAccount } from "@/lib/onlyfans-preview/types";
import type { NativeEarnings } from "@/lib/onlyfans/earnings";
import type { OverviewPeriod } from "@/lib/onlyfans/overview";
import { HUB_PERIOD_LABEL, aiArea, creatorEarnings, paymentArea, syncArea, type HubArea } from "@/lib/onlyfans/creator-hub";
import { formatRecordedMoney } from "@/lib/onlyfans/workspace";
import { HEALTH_LABEL, MODE_LABEL } from "./labels";
import CreatorPortrait from "./CreatorPortrait";

export type CreatorHubData = { earnings: NativeEarnings | null; error: string | null; period: OverviewPeriod };
const HubData = createContext<CreatorHubData>({ earnings: null, error: "Earnings are not loaded on this screen.", period: "30d" });
export function CreatorHubProvider({ data, children }: { data: CreatorHubData; children: ReactNode }) {
  return <HubData.Provider value={data}>{children}</HubData.Provider>;
}

const Hint = ({ text }: { text: string }) => <span className="ml-1 cursor-help text-muted/80" title={text} aria-label={text}>ⓘ</span>;

function StatusLine({ label, area, hint, action }: { label: string; area: HubArea | null; hint: string; action: { label: string; href: string } | null }) {
  return (
    <div className="of-hub-line" data-of-hub-line={label}>
      <dt>{label}<Hint text={hint} /></dt>
      <dd>
        <span className="font-semibold">{area ? area.state : "Not reported"}</span>
        {area?.checkedAt ? <span className="text-[11px] text-muted"> · checked {formatAge(area.checkedAt)}</span> : null}
        {action ? <Link href={action.href} className="of-text-link ml-2">{action.label}</Link> : null}
      </dd>
    </div>
  );
}

export default function CreatorHub({ accounts }: { accounts: OfAccount[] }) {
  const data = useContext(HubData);
  const scope = parseWorkspaceScope(useSearchParams() ?? new URLSearchParams());
  const requested = scope.accountId ? accounts.find(account => account.accountId === scope.accountId) : undefined;
  const creatorId = requested?.binding.creatorId ?? scope.creatorId;
  const owned = creatorId ? accounts.filter(account => account.binding.creatorId === creatorId) : [];
  const ids = new Set(accounts.map(account => account.binding.creatorId));
  const name = owned[0]?.binding.creatorName ?? (ids.size === 1 ? accounts[0]?.binding.creatorName : null) ?? null;

  // One authoritative selection: the same creator/account params every other OnlyFans screen reads.
  const context = <p className="mb-4 text-sm text-muted" data-of-creator-context={name ? "creator" : "all"}>
    Showing: <span className="font-semibold text-ink">{name ?? "All creators"}</span>
    {creatorId ? <Link href="/onlyfans/accounts" className="of-text-link ml-3">All creators</Link> : null}
  </p>;
  if (!creatorId || owned.length === 0) return context;

  const first = owned[0];
  const linkScope = { creatorId, accountId: scope.accountId ?? (owned.length === 1 ? first.accountId : null) };
  const earnings = creatorEarnings(data.earnings, data.error, owned.map(account => account.accountId));
  const needAttention = owned.filter(account => account.needsAttention).length;

  return (
    <>
      {context}
      <section className="of-hub mb-6" data-of-creator-hub={creatorId}>
        <Card className="of-hub-identity p-4">
          <CreatorPortrait creatorId={creatorId} name={first.binding.creatorName} providerAvatarUrl={first.creatorProfile?.avatarUrl} large />
          <div className="min-w-0">
            <h2 className="of-account-name">{first.binding.creatorName}</h2>
            <div className="mt-0.5 truncate text-sm text-muted">@{first.binding.handle}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {owned.map(account => <span key={account.accountId} className="of-account-brand mt-0"><PlatformIcon platform="onlyfans" size={22} />OnlyFans{owned.length > 1 ? ` @${account.binding.handle}` : ""}</span>)}
            </div>
          </div>
          <form className="of-period-form ml-auto" action="/onlyfans/accounts" method="get">
            <input type="hidden" name="creator" value={creatorId} />
            {scope.accountId ? <input type="hidden" name="account" value={scope.accountId} /> : null}
            <label><span className="sr-only">Earnings period</span><select name="period" defaultValue={data.period}>{Object.entries(HUB_PERIOD_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <button type="submit">Update</button>
          </form>
        </Card>

        <div className="of-hub-cards">
          <Card className="p-4" data-of-hub-card="earnings">
            <div className="text-xs text-muted">Earnings, {HUB_PERIOD_LABEL[data.period].toLowerCase()}<Hint text="Net recorded earnings from this creator's verified payment history. Shown as Unavailable, never zero, when the import for any of this creator's accounts is incomplete." /></div>
            <div className="mt-1 font-mono text-2xl font-semibold">{earnings.state === "value" ? formatRecordedMoney(earnings.netCents, "USD") : "Unavailable"}</div>
            <div className="mt-1 text-[11px] text-muted">{earnings.state === "value" ? `${earnings.paymentCount.toLocaleString("en-US")} payments` : earnings.reason}</div>
            <Link href={workspaceHref("/onlyfans/sales", linkScope)} className="of-text-link mt-2">Open earnings</Link>
          </Card>
          <Card className="p-4" data-of-hub-card="conversations">
            <div className="text-xs text-muted">Conversations<Hint text="Conversation counts are not loaded on this screen. Open the inbox to see who needs a reply." /></div>
            <div className="mt-1 text-sm font-semibold">{needAttention ? `Account needs attention (${needAttention})` : "Open the inbox"}</div>
            <Link href={workspaceHref("/onlyfans/inbox", linkScope)} className="of-text-link mt-2" data-of-hub-open-inbox>Open inbox</Link>
          </Card>
          <Card className="p-4" data-of-hub-card="content">
            <div className="text-xs text-muted">Content<Hint text="Folders, media and prices for this creator." /></div>
            <div className="mt-1 text-sm font-semibold">Content library</div>
            <Link href={workspaceHref("/onlyfans/content", linkScope)} className="of-text-link mt-2" data-of-hub-open-content>Open content library</Link>
          </Card>
          <Card className="p-4" data-of-hub-card="connection">
            <div className="text-xs text-muted">Connection and import</div>
            {owned.map(account => <dl key={account.accountId} className="of-hub-lines" data-of-hub-account={account.accountId}>
              {owned.length > 1 ? <div className="text-xs font-semibold">@{account.binding.handle}</div> : null}
              <StatusLine label="Account connection" hint="Whether the OnlyFans account is signed in. Reconnecting is done from the account card below."
                area={{ state: HEALTH_LABEL[account.health].label + (account.syncFreshness.stale ? ", history may be out of date" : ""), checkedAt: account.syncFreshness.asOf }}
                action={account.health !== "connected" ? { label: "Review connection", href: workspaceHref("/onlyfans/accounts", { creatorId, accountId: account.accountId }) + "&connection=1" } : null} />
              <StatusLine label="Message history" hint="Conversations imported from OnlyFans." area={syncArea(account, "messages")} action={{ label: "Open inbox", href: workspaceHref("/onlyfans/inbox", { creatorId, accountId: account.accountId }) }} />
              <StatusLine label="Media" hint="Vault media imported from OnlyFans." area={syncArea(account, "media")} action={{ label: "Open content library", href: workspaceHref("/onlyfans/content", { creatorId, accountId: account.accountId }) }} />
              <StatusLine label="Payment history" hint="Payments imported for earnings. Earnings stay Unavailable until this is complete." area={paymentArea(data.earnings, account.accountId)} action={{ label: "Open earnings", href: workspaceHref("/onlyfans/sales", { creatorId, accountId: account.accountId }) }} />
              <StatusLine label="AI replies" hint={`Connecting or importing an account never turns AI replies on. Reply mode: ${MODE_LABEL[account.automationMode].label.replace("Replies: ", "")}.`} area={aiArea(account)} action={{ label: "Review reply settings", href: workspaceHref("/onlyfans/settings", { creatorId, accountId: account.accountId }) }} />
            </dl>)}
          </Card>
        </div>
      </section>
    </>
  );
}
