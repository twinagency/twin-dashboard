import CrmDashboardOverview, {
  type CrmDashboardCreator,
  type CrmDashboardRecentFan,
} from "@/components/crm/CrmDashboardOverview";
import { chartColorForClone } from "@/lib/colors";
import { getCloneScope } from "@/lib/clone-scope";
import { reportTzLabel } from "@/lib/report-time";
import { resolvePresetRevenueWindow } from "@/lib/revenue-window";
import { cloneUserStats, cloneUserStatsWindow, fanSpendStats } from "@/lib/rollup";
import { getHeaderAllTimeStarsResult } from "@/lib/query-cache";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type CloneRow = {
  id: string;
  name: string;
  status: string | null;
  business_username: string | null;
  intake: unknown;
};

type RecentFanRow = {
  id: string;
  clone_id: string;
  telegram_id: number | null;
  name: string | null;
  stated_name: string | null;
  username: string | null;
  last_message_received: string | null;
  total_spent_stars: number | string | null;
};

const sum = <T,>(rows: T[], value: (row: T) => number) => rows.reduce((total, row) => total + value(row), 0);

export default async function CrmDashboardPage() {
  const cloneId = await getCloneScope();
  const nowMs = Date.now();
  const week = resolvePresetRevenueWindow("1W", nowMs);
  if (!week) throw new Error("Could not resolve the CRM reporting window.");

  let cloneQuery = supabaseAdmin
    .from("clones")
    .select("id,name,status,business_username,intake")
    .order("created_at", { ascending: true });
  if (cloneId) cloneQuery = cloneQuery.eq("id", cloneId);

  let recentFanQuery = supabaseAdmin
    .from("users")
    .select("id,clone_id,telegram_id,name,stated_name,username,last_message_received,total_spent_stars")
    .not("last_message_received", "is", null)
    .order("last_message_received", { ascending: false, nullsFirst: false })
    .limit(7);
  if (cloneId) recentFanQuery = recentFanQuery.eq("clone_id", cloneId);

  const [cloneResult, lifetimeStats, weeklyStats, spendStats, lifetimeRevenue, recentFanResult] = await Promise.all([
    cloneQuery,
    cloneUserStats(nowMs - 86_400_000, cloneId),
    cloneUserStatsWindow(week.startMs, week.endMs, cloneId),
    fanSpendStats(cloneId),
    getHeaderAllTimeStarsResult(cloneId),
    recentFanQuery,
  ]);

  if (cloneResult.error) throw new Error(`Could not load CRM creators: ${cloneResult.error.message}`);
  if (recentFanResult.error) throw new Error(`Could not load recent CRM fans: ${recentFanResult.error.message}`);

  const cloneRows = (cloneResult.data ?? []) as CloneRow[];
  const creators: CrmDashboardCreator[] = cloneRows.map((clone, index) => ({
    id: clone.id,
    name: clone.name,
    color: chartColorForClone(clone.intake, index),
    status: clone.status ?? "paused",
    businessUsername: clone.business_username,
  }));
  const creatorById = new Map(creators.map((creator) => [creator.id, creator]));

  const recentFans: CrmDashboardRecentFan[] = ((recentFanResult.data ?? []) as RecentFanRow[]).map((fan) => {
    const creator = creatorById.get(fan.clone_id);
    return {
      id: fan.id,
      cloneId: fan.clone_id,
      cloneName: creator?.name ?? "Creator",
      cloneColor: creator?.color ?? "#607086",
      telegramId: fan.telegram_id,
      name: fan.name?.trim() || (fan.telegram_id == null ? "Unnamed fan" : `Fan ${fan.telegram_id}`),
      username: fan.username,
      lastActiveAt: fan.last_message_received,
      lifetimeStars: Number(fan.total_spent_stars) || 0,
    };
  });

  const selectedCreator = cloneId ? creators.find((creator) => creator.id === cloneId) : null;
  return (
    <CrmDashboardOverview
      data={{
        scopeLabel: selectedCreator?.name ?? "All creators",
        reportZone: reportTzLabel(new Date(nowMs)),
        lifetimeNetStars: lifetimeRevenue.stars,
        totalFans: sum(lifetimeStats, (row) => Number(row.fans) || 0),
        payingFans: Number(spendStats.buyers) || 0,
        repeatBuyers: Number(spendStats.repeat_buyers) || 0,
        reachableNow: sum(lifetimeStats, (row) => Number(row.active) || 0),
        activeThisWeek: sum(weeklyStats, (row) => Number(row.active) || 0),
        messagesThisWeek: sum(weeklyStats, (row) => Number(row.messages) || 0),
        newThisWeek: sum(weeklyStats, (row) => Number(row.fans) || 0),
        recentFans,
        creators,
      }}
    />
  );
}
