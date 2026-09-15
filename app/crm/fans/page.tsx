import CrmFansDirectory, {
  type CrmFansDirectoryRow,
  type CrmFansSegment,
  type CrmFansSort,
} from "@/components/crm/CrmFansDirectory";
import { chartColorForClone } from "@/lib/colors";
import { getCloneScope } from "@/lib/clone-scope";
import { cloneUserStats, fanTiers } from "@/lib/rollup";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 40;
const SEGMENTS = new Set<CrmFansSegment>(["all", "active", "paying", "whales", "at-risk"]);
const SORTS = new Set<CrmFansSort>(["last_active", "spend", "purchases", "joined"]);

type FanRow = {
  id: string;
  clone_id: string;
  telegram_id: number | null;
  name: string | null;
  stated_name: string | null;
  username: string | null;
  language_code: string | null;
  first_seen_at: string | null;
  last_message_received: string | null;
  total_spent_stars: number | string | null;
  purchase_count: number | null;
  total_messages_sent: number | null;
  spend_tier: string | null;
  is_active: boolean | null;
  blocked: boolean | null;
};

type CloneRow = { id: string; name: string; intake: unknown };

export default async function CrmFansPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; segment?: string; sort?: string; page?: string }>;
}) {
  const params = await searchParams;
  const cloneId = await getCloneScope();
  const query = (params.q ?? "").trim().slice(0, 120);
  const segment = SEGMENTS.has(params.segment as CrmFansSegment) ? (params.segment as CrmFansSegment) : "all";
  const sort = SORTS.has(params.sort as CrmFansSort) ? (params.sort as CrmFansSort) : "last_active";
  const parsedPage = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(parsedPage) ? Math.min(1_000, Math.max(1, parsedPage)) : 1;
  const nowMs = Date.now();
  const activeCutoff = new Date(nowMs - 86_400_000).toISOString();
  const riskCutoff = new Date(nowMs - 7 * 86_400_000).toISOString();

  let fansQuery = supabaseAdmin
    .from("users")
    .select(
      "id,clone_id,telegram_id,name,stated_name,username,language_code,first_seen_at,last_message_received,total_spent_stars,purchase_count,total_messages_sent,spend_tier,is_active,blocked",
      { count: "exact" },
    );
  if (cloneId) fansQuery = fansQuery.eq("clone_id", cloneId);

  if (query) {
    const cleaned = query.toLowerCase().replace(/[,()*]/g, "");
    const like = `*${cleaned}*`;
    const clauses = [
      `name.ilike.${like}`,
      `stated_name.ilike.${like}`,
      `username.ilike.${like}`,
      `business_connection_id.ilike.${like}`,
    ];
    if (/^\d+$/.test(cleaned)) clauses.push(`telegram_id.eq.${cleaned}`);
    fansQuery = fansQuery.or(clauses.join(","));
  }

  if (segment === "active") fansQuery = fansQuery.gte("last_message_received", activeCutoff);
  else if (segment === "paying") fansQuery = fansQuery.or("purchase_count.gt.0,total_spent_stars.gt.0");
  else if (segment === "whales") fansQuery = fansQuery.eq("spend_tier", "whale");
  else if (segment === "at-risk") {
    fansQuery = fansQuery
      .or("purchase_count.gt.0,total_spent_stars.gt.0")
      .or(`last_message_received.is.null,last_message_received.lt.${riskCutoff}`);
  }

  const sortColumn = {
    last_active: "last_message_received",
    spend: "total_spent_stars",
    purchases: "purchase_count",
    joined: "first_seen_at",
  }[sort];
  fansQuery = fansQuery
    .order(sortColumn, { ascending: false, nullsFirst: false })
    .order("id", { ascending: true })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  let cloneQuery = supabaseAdmin.from("clones").select("id,name,intake").order("created_at", { ascending: true });
  if (cloneId) cloneQuery = cloneQuery.eq("id", cloneId);

  const [fansResult, cloneResult, stats, tiers] = await Promise.all([
    fansQuery,
    cloneQuery,
    cloneUserStats(nowMs - 86_400_000, cloneId),
    fanTiers(cloneId),
  ]);
  if (fansResult.error) throw new Error(`Could not load CRM fans: ${fansResult.error.message}`);
  if (cloneResult.error) throw new Error(`Could not load CRM creator names: ${cloneResult.error.message}`);

  const clones = ((cloneResult.data ?? []) as CloneRow[]).map((clone, index) => ({
    id: clone.id,
    name: clone.name,
    color: chartColorForClone(clone.intake, index),
  }));
  const cloneById = new Map(clones.map((clone) => [clone.id, clone]));
  const rows: CrmFansDirectoryRow[] = ((fansResult.data ?? []) as FanRow[]).map((fan) => {
    const creator = cloneById.get(fan.clone_id);
    return {
      id: fan.id,
      cloneId: fan.clone_id,
      cloneName: creator?.name ?? "Creator",
      cloneColor: creator?.color ?? "#607086",
      telegramId: fan.telegram_id,
      name: fan.name?.trim() || (fan.telegram_id == null ? "Unnamed fan" : `Fan ${fan.telegram_id}`),
      statedName: fan.stated_name,
      username: fan.username,
      languageCode: fan.language_code,
      firstSeenAt: fan.first_seen_at,
      lastActiveAt: fan.last_message_received,
      lifetimeStars: Number(fan.total_spent_stars) || 0,
      purchaseCount: Number(fan.purchase_count) || 0,
      messageCount: Number(fan.total_messages_sent) || 0,
      spendTier: fan.spend_tier,
      active: Boolean(fan.is_active),
      blocked: Boolean(fan.blocked),
    };
  });

  const totalFans = stats.reduce((total, row) => total + (Number(row.fans) || 0), 0);
  const activeFans = stats.reduce((total, row) => total + (Number(row.active) || 0), 0);
  const payingFans = stats.reduce((total, row) => total + (Number(row.buyers) || 0), 0);
  const whaleFans = tiers.find((tier) => tier.tier === "whale")?.fans ?? 0;
  const selectedCreator = cloneId ? clones.find((clone) => clone.id === cloneId) : null;

  return (
    <CrmFansDirectory
      data={{
        scopeLabel: selectedCreator?.name ?? "All creators",
        query,
        segment,
        sort,
        page,
        pageSize: PAGE_SIZE,
        resultCount: fansResult.count ?? 0,
        totalFans,
        activeFans,
        payingFans,
        whaleFans: Number(whaleFans) || 0,
        rows,
      }}
    />
  );
}
