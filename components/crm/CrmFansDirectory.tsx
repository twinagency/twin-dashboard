import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Flame,
  Search,
  UsersRound,
  Waves,
} from "lucide-react";
import FanAvatar from "@/components/FanAvatar";
import { SpendTierChip } from "@/components/SpendTierBadge";
import { Card, CardContent } from "@/components/ui/card";
import { fmtNum } from "@/lib/money";

export type CrmFansSegment = "all" | "active" | "paying" | "whales" | "at-risk";
export type CrmFansSort = "last_active" | "spend" | "purchases" | "joined";

export type CrmFansDirectoryRow = {
  id: string;
  cloneId: string;
  cloneName: string;
  cloneColor: string;
  telegramId: number | null;
  name: string;
  statedName: string | null;
  username: string | null;
  languageCode: string | null;
  firstSeenAt: string | null;
  lastActiveAt: string | null;
  lifetimeStars: number;
  purchaseCount: number;
  messageCount: number;
  spendTier: string | null;
  active: boolean;
  blocked: boolean;
};

export type CrmFansDirectoryData = {
  scopeLabel: string;
  query: string;
  segment: CrmFansSegment;
  sort: CrmFansSort;
  page: number;
  pageSize: number;
  resultCount: number;
  totalFans: number;
  activeFans: number;
  payingFans: number;
  whaleFans: number;
  rows: CrmFansDirectoryRow[];
};

const SEGMENTS: { key: CrmFansSegment; label: string }[] = [
  { key: "all", label: "All fans" },
  { key: "active", label: "Active 24h" },
  { key: "paying", label: "Paying" },
  { key: "whales", label: "Whales" },
  { key: "at-risk", label: "At risk" },
];

function hrefFor(data: CrmFansDirectoryData, patch: Partial<{ q: string; segment: CrmFansSegment; sort: CrmFansSort; page: number }>): string {
  const params = new URLSearchParams();
  const q = patch.q ?? data.query;
  const segment = patch.segment ?? data.segment;
  const sort = patch.sort ?? data.sort;
  const page = patch.page ?? data.page;
  if (q) params.set("q", q);
  if (segment !== "all") params.set("segment", segment);
  if (sort !== "last_active") params.set("sort", sort);
  if (page > 1) params.set("page", String(page));
  const value = params.toString();
  return value ? `/crm/fans?${value}` : "/crm/fans";
}

function relativeTime(value: string | null): string {
  if (!value) return "Never";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h ago`;
  if (seconds < 604_800) return `${Math.floor(seconds / 86_400)}d ago`;
  return new Date(value).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function Summary({ label, value, note, icon }: { label: string; value: number; note: string; icon: ReactNode }) {
  return (
    <Card size="sm" className="gap-0 rounded-xl py-0">
      <CardContent className="flex items-start justify-between gap-3 px-4 py-3.5">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted">{label}</div>
          <div className="mt-1 text-2xl font-semibold tracking-[-0.035em] text-ink tabular-nums">{fmtNum(value)}</div>
          <div className="mt-0.5 text-xs text-muted">{note}</div>
        </div>
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-elev text-accent-2">{icon}</span>
      </CardContent>
    </Card>
  );
}

function FanIdentity({ fan }: { fan: CrmFansDirectoryRow }) {
  const alias = fan.statedName?.trim();
  const differentAlias = alias && alias.toLowerCase() !== fan.name.trim().toLowerCase() ? alias : null;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <FanAvatar cloneId={fan.cloneId} telegramId={fan.telegramId} name={fan.name} color={fan.cloneColor} className="size-9 text-xs" />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-ink">{fan.name}</span>
          {fan.blocked ? <span className="shrink-0 rounded-full bg-crit/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-crit">Blocked</span> : null}
        </div>
        <div className="truncate text-xs text-muted">
          {fan.username ? `@${fan.username}` : fan.telegramId == null ? "No platform ID" : `id ${fan.telegramId}`}
          {differentAlias ? ` · known as ${differentAlias}` : ""}
        </div>
      </div>
    </div>
  );
}

export default function CrmFansDirectory({ data }: { data: CrmFansDirectoryData }) {
  const firstResult = data.rows.length === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const lastResult = data.rows.length === 0 ? 0 : Math.min(data.page * data.pageSize, data.resultCount);
  const hasPrevious = data.page > 1;
  const hasNext = lastResult < data.resultCount;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.13em] text-accent-2">
            <span className="size-1.5 rounded-full bg-accent-2" /> Audience directory
          </div>
          <h1 className="mt-1.5 font-heading text-2xl font-semibold tracking-[-0.035em] text-ink sm:text-[28px]">Fans</h1>
          <p className="mt-1 text-sm text-muted">Search, segment, and open any fan conversation across {data.scopeLabel === "All creators" ? "all creators" : data.scopeLabel}.</p>
        </div>
        <Link href="/crm/inbox" className="inline-flex h-9 w-fit items-center gap-2 rounded-lg bg-accent px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-deep">
          Open inbox <ArrowRight className="size-4" />
        </Link>
      </header>

      <section aria-label="Audience totals" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Summary label="All fans" value={data.totalFans} note="Lifetime profiles" icon={<UsersRound className="size-4" />} />
        <Summary label="Active 24h" value={data.activeFans} note="Messaged in 24 hours" icon={<Waves className="size-4" />} />
        <Summary label="Paying" value={data.payingFans} note="At least one purchase" icon={<CircleDollarSign className="size-4" />} />
        <Summary label="Whales" value={data.whaleFans} note="Highest spend tier" icon={<Flame className="size-4" />} />
      </section>

      <Card className="gap-0 overflow-hidden rounded-xl py-0">
        <div className="border-b border-line px-4 py-4 sm:px-5">
          <form action="/crm/fans" method="get" className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search fans</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input name="q" type="search" defaultValue={data.query} placeholder="Search name, username, ID, or connection…" className="h-10 w-full rounded-lg border border-line bg-panel pl-9 pr-3 text-sm text-ink outline-none placeholder:text-muted focus:border-accent-2 focus:ring-2 focus:ring-accent-2/15" />
            </label>
            <input type="hidden" name="segment" value={data.segment === "all" ? "" : data.segment} />
            <label className="flex items-center gap-2 rounded-lg border border-line bg-panel px-3">
              <span className="text-xs font-medium text-muted">Sort</span>
              <select name="sort" defaultValue={data.sort} className="h-[38px] min-w-36 bg-transparent text-sm font-medium text-ink outline-none">
                <option value="last_active">Last active</option>
                <option value="spend">Highest spend</option>
                <option value="purchases">Most purchases</option>
                <option value="joined">Newest joined</option>
              </select>
            </label>
            <button type="submit" className="h-10 rounded-lg bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-2/40">Apply</button>
            {data.query || data.segment !== "all" || data.sort !== "last_active" ? (
              <Link href="/crm/fans" className="inline-flex h-10 items-center justify-center px-2 text-sm font-semibold text-muted hover:text-ink">Clear</Link>
            ) : null}
          </form>
          <nav aria-label="Fan segments" className="mt-3 flex max-w-full gap-1.5 overflow-x-auto pb-0.5">
            {SEGMENTS.map((segment) => (
              <Link key={segment.key} href={hrefFor(data, { segment: segment.key, page: 1 })} aria-current={data.segment === segment.key ? "page" : undefined} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${data.segment === segment.key ? "border-accent bg-accent text-white" : "border-line bg-panel text-muted hover:bg-elev hover:text-ink"}`}>
                {segment.label}
              </Link>
            ))}
          </nav>
        </div>

        {data.rows.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <UsersRound className="mx-auto size-7 text-muted/50" />
            <div className="mt-3 text-sm font-semibold text-ink">No fans match this view</div>
            <p className="mt-1 text-xs text-muted">Try another segment or clear the search.</p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[900px] text-left">
                <thead className="bg-elev/75 text-[10px] font-semibold uppercase tracking-[0.09em] text-muted">
                  <tr>
                    <th className="px-5 py-2.5 font-semibold">Fan</th>
                    <th className="px-4 py-2.5 font-semibold">Creator</th>
                    <th className="px-4 py-2.5 font-semibold">Segment</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Lifetime spend</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Purchases</th>
                    <th className="px-4 py-2.5 font-semibold">Last activity</th>
                    <th className="w-16 px-5 py-2.5"><span className="sr-only">Open conversation</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.rows.map((fan) => (
                    <tr key={fan.id} className="transition hover:bg-elev/55">
                      <td className="px-5 py-3">
                        <Link href={`/crm/inbox?fan=${encodeURIComponent(fan.id)}`} className="block rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-2/35"><FanIdentity fan={fan} /></Link>
                      </td>
                      <td className="px-4 py-3"><span className="creator-name text-sm font-medium text-ink">{fan.cloneName}</span></td>
                      <td className="px-4 py-3"><SpendTierChip tier={fan.spendTier} /></td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-good tabular-nums">{fan.lifetimeStars > 0 ? `${fmtNum(fan.lifetimeStars)}★` : "—"}</td>
                      <td className="px-4 py-3 text-right text-sm text-ink tabular-nums">{fmtNum(fan.purchaseCount)}</td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-ink">{relativeTime(fan.lastActiveAt)}</div>
                        <div className="mt-0.5 text-[11px] text-muted">{fmtNum(fan.messageCount)} messages</div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link href={`/crm/inbox?fan=${encodeURIComponent(fan.id)}`} aria-label={`Open ${fan.name} in inbox`} className="inline-grid size-8 place-items-center rounded-lg border border-line text-muted transition hover:border-accent-2/40 hover:bg-panel hover:text-accent-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-2/35"><ArrowRight className="size-4" /></Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-line lg:hidden">
              {data.rows.map((fan) => (
                <Link key={fan.id} href={`/crm/inbox?fan=${encodeURIComponent(fan.id)}`} className="block px-4 py-4 transition hover:bg-elev/60">
                  <div className="flex items-center gap-3">
                    <FanIdentity fan={fan} />
                    <ArrowRight className="ml-auto size-4 shrink-0 text-muted" />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-elev/65 p-2.5 text-xs">
                    <div><div className="text-[10px] uppercase tracking-wide text-muted">Creator</div><div className="creator-name mt-0.5 truncate font-semibold text-ink">{fan.cloneName}</div></div>
                    <div><div className="text-[10px] uppercase tracking-wide text-muted">Spend</div><div className="mt-0.5 font-semibold text-good tabular-nums">{fan.lifetimeStars > 0 ? `${fmtNum(fan.lifetimeStars)}★` : "—"}</div></div>
                    <div><div className="text-[10px] uppercase tracking-wide text-muted">Active</div><div className="mt-0.5 font-semibold text-ink">{relativeTime(fan.lastActiveAt)}</div></div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}

        <div className="flex flex-col gap-3 border-t border-line bg-elev/45 px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <span className="text-muted">
            {data.resultCount === 0
              ? "No matching fans"
              : data.rows.length === 0
                ? `${fmtNum(data.resultCount)} matching fans · choose Previous to return to results`
                : `Showing ${fmtNum(firstResult)}–${fmtNum(lastResult)} of ${fmtNum(data.resultCount)} matching fans`}
          </span>
          <div className="flex items-center gap-2">
            {hasPrevious ? (
              <Link href={hrefFor(data, { page: data.page - 1 })} className="inline-flex h-8 items-center gap-1 rounded-lg border border-line bg-panel px-2.5 font-semibold text-ink transition hover:border-accent-2/40"><ChevronLeft className="size-3.5" /> Previous</Link>
            ) : (
              <span aria-disabled="true" className="inline-flex h-8 items-center gap-1 rounded-lg border border-line bg-panel px-2.5 font-semibold text-muted/45"><ChevronLeft className="size-3.5" /> Previous</span>
            )}
            <span className="px-1 font-semibold text-muted tabular-nums">Page {fmtNum(data.page)}</span>
            {hasNext ? (
              <Link href={hrefFor(data, { page: data.page + 1 })} className="inline-flex h-8 items-center gap-1 rounded-lg border border-line bg-panel px-2.5 font-semibold text-ink transition hover:border-accent-2/40">Next <ChevronRight className="size-3.5" /></Link>
            ) : (
              <span aria-disabled="true" className="inline-flex h-8 items-center gap-1 rounded-lg border border-line bg-panel px-2.5 font-semibold text-muted/45">Next <ChevronRight className="size-3.5" /></span>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
