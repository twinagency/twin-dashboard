import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  MessageCircle,
  Radio,
  UsersRound,
} from "lucide-react";
import FanAvatar from "@/components/FanAvatar";
import MoneyAmount from "@/components/MoneyAmount";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtNum } from "@/lib/money";

export type CrmDashboardRecentFan = {
  id: string;
  cloneId: string;
  cloneName: string;
  cloneColor: string;
  telegramId: number | null;
  name: string;
  username: string | null;
  lastActiveAt: string | null;
  lifetimeStars: number;
};

export type CrmDashboardCreator = {
  id: string;
  name: string;
  color: string;
  status: string;
  businessUsername: string | null;
};

export type CrmDashboardOverviewData = {
  scopeLabel: string;
  reportZone: string;
  lifetimeNetStars: number | null;
  totalFans: number;
  payingFans: number;
  repeatBuyers: number;
  reachableNow: number;
  activeThisWeek: number;
  messagesThisWeek: number;
  newThisWeek: number;
  recentFans: CrmDashboardRecentFan[];
  creators: CrmDashboardCreator[];
};

function MetricCell({ label, value, note, icon }: { label: string; value: string; note: string; icon: ReactNode }) {
  return (
    <div className="min-w-0 bg-panel px-4 py-4 sm:px-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</div>
          <div className="mt-1.5 text-2xl font-semibold tracking-[-0.035em] text-ink tabular-nums">{value}</div>
          <div className="mt-1 text-xs leading-5 text-muted">{note}</div>
        </div>
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-elev text-accent-2">{icon}</span>
      </div>
    </div>
  );
}

function relativeTime(value: string | null): string {
  if (!value) return "No messages yet";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h ago`;
  if (seconds < 604_800) return `${Math.floor(seconds / 86_400)}d ago`;
  return new Date(value).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export default function CrmDashboardOverview({ data }: { data: CrmDashboardOverviewData }) {
  const activeCreators = data.creators.filter((creator) => creator.status === "active").length;
  const creatorsWithUsername = data.creators.filter((creator) => creator.businessUsername).length;
  const buyerRate = data.totalFans > 0 ? data.payingFans / data.totalFans : null;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.13em] text-accent-2">
            <span className="size-1.5 rounded-full bg-good" /> Live CRM workspace
          </div>
          <h1 className="mt-1.5 font-heading text-2xl font-semibold tracking-[-0.035em] text-ink sm:text-[28px]">Dashboard</h1>
          <p className="mt-1 text-sm text-muted">
            {data.scopeLabel} · current audience health and the last seven reporting days ({data.reportZone})
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/crm/fans" className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-panel px-3 text-sm font-semibold text-ink transition hover:border-accent-2/45 hover:bg-elev">
            View fans <ArrowRight className="size-4" />
          </Link>
          <Link href="/crm/inbox" className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-deep">
            Open inbox <MessageCircle className="size-4" />
          </Link>
        </div>
      </header>

      <Card className="gap-0 overflow-hidden rounded-xl py-0">
        <CardHeader className="border-b border-line px-5 py-4 sm:flex sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base font-semibold">Creator earnings overview</CardTitle>
            <p className="mt-0.5 text-xs text-muted">Recorded receipts and audience activity from the authorized workspace.</p>
          </div>
          <span className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-full border border-line bg-elev px-2.5 py-1 text-[11px] font-semibold text-muted sm:mt-0">
            <Clock3 className="size-3.5" /> Lifetime revenue · 7-day activity
          </span>
        </CardHeader>
        <div className="grid lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,2.2fr)]">
          <div className="flex min-h-52 flex-col justify-between border-b border-line bg-[#f8fbff] p-5 lg:border-b-0 lg:border-r">
            <div>
              <div className="grid size-10 place-items-center rounded-xl bg-accent text-white shadow-sm">
                <CircleDollarSign className="size-5" />
              </div>
              <div className="mt-5 text-xs font-semibold uppercase tracking-[0.1em] text-muted">Recorded net revenue</div>
              {data.lifetimeNetStars == null ? (
                <>
                  <div className="mt-1 text-3xl font-semibold tracking-[-0.045em] text-muted">Unavailable</div>
                  <div className="mt-1 text-xs text-muted">The revenue ledger could not be loaded. Refresh to try again.</div>
                </>
              ) : (
                <>
                  <MoneyAmount stars={data.lifetimeNetStars} className="mt-1 block text-3xl font-semibold tracking-[-0.045em] text-good tabular-nums" />
                  <div className="mt-1 text-xs text-muted">{fmtNum(data.lifetimeNetStars)} Stars · lifetime after ledger adjustments</div>
                </>
              )}
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-line pt-4 text-xs">
              <span className="text-muted">Paying fan rate</span>
              <span className="font-semibold text-ink tabular-nums">{buyerRate === null ? "—" : `${(buyerRate * 100).toFixed(1)}%`}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3">
            <MetricCell label="All fans" value={fmtNum(data.totalFans)} note="Lifetime profiles" icon={<UsersRound className="size-4" />} />
            <MetricCell label="Paying fans" value={fmtNum(data.payingFans)} note={`${fmtNum(data.repeatBuyers)} repeat buyers`} icon={<CircleDollarSign className="size-4" />} />
            <MetricCell label="Active 24h" value={fmtNum(data.reachableNow)} note="Messaged in the last 24h" icon={<Radio className="size-4" />} />
            <MetricCell label="Active this week" value={fmtNum(data.activeThisWeek)} note="Fans who sent a message" icon={<CheckCircle2 className="size-4" />} />
            <MetricCell label="Messages this week" value={fmtNum(data.messagesThisWeek)} note="Conversation events recorded" icon={<MessageCircle className="size-4" />} />
            <MetricCell label="New this week" value={fmtNum(data.newThisWeek)} note="New fan profiles" icon={<UsersRound className="size-4" />} />
          </div>
        </div>
      </Card>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <Card className="gap-0 rounded-xl py-0">
          <CardHeader className="flex flex-row items-center justify-between border-b border-line px-5 py-4">
            <div>
              <CardTitle className="text-base font-semibold">Recent fan activity</CardTitle>
              <p className="mt-0.5 text-xs text-muted">The latest fan profiles to message a creator.</p>
            </div>
            <Link href="/crm/fans?sort=last_active" className="text-xs font-semibold text-accent-2 hover:underline">All fans</Link>
          </CardHeader>
          <CardContent className="px-0">
            {data.recentFans.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <MessageCircle className="mx-auto size-6 text-muted/55" />
                <div className="mt-2 text-sm font-medium text-ink">No fan messages yet</div>
                <p className="mt-1 text-xs text-muted">Activity will appear here after a fan sends a message.</p>
              </div>
            ) : (
              <div className="divide-y divide-line">
                {data.recentFans.map((fan) => (
                  <Link key={fan.id} href={`/crm/inbox?fan=${encodeURIComponent(fan.id)}`} className="flex min-w-0 items-center gap-3 px-4 py-3 transition hover:bg-elev/70 sm:px-5">
                    <FanAvatar cloneId={fan.cloneId} telegramId={fan.telegramId} name={fan.name} color={fan.cloneColor} className="size-9 text-xs" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-ink">{fan.name}</span>
                        {fan.lifetimeStars > 0 ? <span className="shrink-0 text-xs font-semibold text-good tabular-nums">{fmtNum(fan.lifetimeStars)}★</span> : null}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {fan.username ? `@${fan.username} · ` : ""}<span className="creator-name">{fan.cloneName}</span>
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted">{relativeTime(fan.lastActiveAt)}</span>
                    <ArrowRight className="size-4 shrink-0 text-muted" />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="gap-0 rounded-xl py-0">
          <CardHeader className="border-b border-line px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-semibold">Creator coverage</CardTitle>
                <p className="mt-0.5 text-xs text-muted">Account identity and operating state.</p>
              </div>
              <span className="rounded-full bg-good/10 px-2.5 py-1 text-[11px] font-semibold text-good tabular-nums">{activeCreators}/{data.creators.length} active</span>
            </div>
          </CardHeader>
          <CardContent className="px-0">
            {data.creators.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted">No creators are in this workspace yet.</div>
            ) : (
              <div className="divide-y divide-line">
                {data.creators.slice(0, 7).map((creator) => {
                  const active = creator.status === "active";
                  return (
                    <Link key={creator.id} href={`/clones/${creator.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-elev/70">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: active ? "var(--color-good)" : "var(--color-muted)" }} />
                      <span className="creator-name min-w-0 flex-1 truncate text-sm font-semibold text-ink">{creator.name}</span>
                      <span className="text-right">
                        <span className={`block text-[11px] font-semibold ${active ? "text-good" : "text-muted"}`}>{active ? "Active" : "Paused"}</span>
                        <span className="block max-w-32 truncate text-[10px] text-muted">{creator.businessUsername ? `@${creator.businessUsername}` : "Username not recorded"}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
            {data.creators.length > 0 ? (
              <div className="flex items-center justify-between border-t border-line bg-elev/55 px-5 py-3 text-xs">
                <span className="text-muted">Accounts with username</span>
                <span className="font-semibold text-ink tabular-nums">{creatorsWithUsername} of {data.creators.length}</span>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
