import { supabaseAdmin } from "@/lib/supabase";
import { getCloneScope } from "@/lib/clone-scope";
import { Card } from "@/components/ui/card";
import { AutoRefresh } from "./AutoRefresh";
import { LogFilters } from "./LogFilters";
import { LogsTable, type LogRow } from "./LogsTable";
import { CLAIMED_SOURCES, KIND_LABEL, SYSTEM_SOURCE_BUCKETS, techForSystemSource, techForUsageKind, type Tech } from "./tech";
import { SpendView } from "./SpendView";
import { isSpendWindow } from "@/lib/spend-data";

export const dynamic = "force-dynamic";

// Unified stream: newest 500 across both tables after merge.
const CAP = 500;

// Fan/clone-scope params carry over between tabs so switching to Spend while
// looking at one fan's logs does not silently snap back to the whole fleet.
type FanParams = { clone?: string; fan?: string; fanUser?: string; fanLabel?: string };

function buildSpendHref(sp: FanParams): string {
  const p = new URLSearchParams();
  p.set("view", "spend");
  if (sp.clone) p.set("clone", sp.clone);
  return `/logs?${p.toString()}`;
}

function buildActivityHref(sp: FanParams): string {
  const p = new URLSearchParams();
  if (sp.clone) p.set("clone", sp.clone);
  if (sp.fan) p.set("fan", sp.fan);
  if (sp.fanUser) p.set("fanUser", sp.fanUser);
  if (sp.fanLabel) p.set("fanLabel", sp.fanLabel);
  const qs = p.toString();
  return qs ? `/logs?${qs}` : "/logs";
}

function Tabs({
  active,
  spendHref,
  activityHref,
}: {
  active: "activity" | "spend";
} & ({ spendHref: string; activityHref?: undefined } | { activityHref: string; spendHref?: undefined })) {
  return (
    <div className="mb-3 flex items-center gap-1 rounded-full bg-elev p-1 w-fit">
      <a
        href={active === "activity" ? "#" : activityHref!}
        className={
          "rounded-full px-3.5 py-1.5 text-xs font-medium transition " +
          (active === "activity" ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink")
        }
      >
        Activity
      </a>
      <a
        href={active === "spend" ? "#" : spendHref!}
        className={
          "rounded-full px-3.5 py-1.5 text-xs font-medium transition " +
          (active === "spend" ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink")
        }
      >
        Spend
      </a>
    </div>
  );
}

type SystemDbRow = {
  id: number;
  ts: string;
  level: "info" | "warn" | "error";
  source: string;
  telegram_id: number | null;
  message: string;
  detail: Record<string, unknown> | null;
  clones: { name: string; slug: string } | null;
};

type UsageDbRow = {
  id: string;
  created_at: string;
  kind: string;
  model: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  cost_usd: number | null;
  ok: boolean;
  error: string | null;
  clones: { name: string; slug: string } | null;
  users: { name: string | null; stated_name: string | null; telegram_id: number | null } | null;
};

const TECHS: Tech[] = ["elevenlabs", "llm", "telegram", "supabase", "payments", "code"];

function fetchSystemRows(tech: string, level: string, q: string, cloneId: string | null, fanTelegramId: number | null) {
  let query = supabaseAdmin
    .from("system_logs")
    .select("id,ts,level,source,telegram_id,message,detail,clones(name,slug)")
    .order("ts", { ascending: false })
    .limit(CAP);
  if (level === "info" || level === "warn" || level === "error") query = query.eq("level", level);
  if (tech === "code") {
    query = query.not("source", "in", `(${CLAIMED_SOURCES.map((s) => `"${s}"`).join(",")})`);
  } else if (TECHS.includes(tech as Tech)) {
    query = query.in("source", SYSTEM_SOURCE_BUCKETS[tech as Exclude<Tech, "code">]);
  }
  if (q.trim()) query = query.ilike("message", `%${q.trim().replace(/[%_]/g, "\\$&")}%`);
  if (cloneId) query = query.eq("clone_id", cloneId);
  if (fanTelegramId != null) query = query.eq("telegram_id", fanTelegramId);
  return query;
}

function fetchUsageRows(tech: string, level: string, cloneId: string | null, fanUserId: string | null) {
  let query = supabaseAdmin
    .from("usage_events")
    .select("id,created_at,kind,model,prompt_tokens,completion_tokens,cost_usd,ok,error,clones(name,slug),users(name,stated_name,telegram_id)")
    .order("created_at", { ascending: false })
    .limit(CAP);
  if (tech === "elevenlabs") query = query.eq("kind", "tts");
  if (tech === "llm") query = query.neq("kind", "tts");
  // Successful calls surface as info, failed ones as error (see usageToRow).
  if (level === "info") query = query.eq("ok", true);
  if (level === "error") query = query.eq("ok", false);
  if (cloneId) query = query.eq("clone_id", cloneId);
  if (fanUserId) query = query.eq("user_id", fanUserId);
  return query;
}

function systemToRow(r: SystemDbRow): LogRow {
  return {
    key: `s-${r.id}`,
    ts: r.ts,
    level: r.level,
    tech: techForSystemSource(r.source),
    source: r.source,
    cloneName: r.clones?.name ?? null,
    fan: r.telegram_id != null ? String(r.telegram_id) : null,
    message: r.message,
    detail: r.detail,
    model: null,
  };
}

function usageToRow(r: UsageDbRow): LogRow {
  // Human headline first ("Voice message generated"), raw kind/model/cost/
  // tokens stay in `detail` below so nothing is lost, just moved out of the
  // main line a non-developer has to read every time.
  const friendly = KIND_LABEL[r.kind] ?? r.kind;
  const message = r.ok
    ? `${friendly} generated`
    : `${friendly} failed${r.error ? `: ${r.error.slice(0, 200)}` : ""}`;
  return {
    key: `u-${r.id}`,
    ts: r.created_at,
    level: r.ok ? "info" : "error",
    tech: techForUsageKind(r.kind),
    source: r.kind,
    cloneName: r.clones?.name ?? null,
    fan: r.users?.stated_name ?? r.users?.name ?? (r.users?.telegram_id != null ? String(r.users.telegram_id) : null),
    message,
    model: r.model,
    detail: {
      model: r.model,
      prompt_tokens: r.prompt_tokens,
      completion_tokens: r.completion_tokens,
      cost_usd: r.cost_usd,
      ...(r.error ? { error: r.error } : {}),
    },
  };
}

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tech?: string;
    level?: string;
    q?: string;
    // Per-fan filter (item 8: "agent logs" for a single fan). Reuses this
    // page's existing tech/level/search machinery rather than a parallel
    // view - set from the "View logs for this fan" link on the Fans page.
    // `clone` overrides the header clone-switcher scope for THIS request
    // only (no cookie write) since a fan always belongs to exactly one
    // clone and the header switcher may be sitting on "All clones".
    clone?: string;
    fan?: string;
    fanUser?: string;
    fanLabel?: string;
    // The Spend tab. A sub-section of this page, not its own route (operator
    // ask, 2026-08-14) - so it rides the same searchParams as everything else.
    view?: string;
    w?: string;
  }>;
}) {
  const sp = await searchParams;
  const tech = sp.tech && (TECHS as string[]).includes(sp.tech) ? sp.tech : "all";
  const level = sp.level === "info" || sp.level === "warn" || sp.level === "error" ? sp.level : "all";
  const q = sp.q ?? "";
  const scopeCloneId = await getCloneScope();
  const cloneId = sp.clone?.trim() || scopeCloneId;
  const fanTelegramId = sp.fan?.trim() ? Number(sp.fan.trim()) : null;
  const fanUserId = sp.fanUser?.trim() || null;
  const fanLabel = sp.fanLabel?.trim() || (fanTelegramId != null ? String(fanTelegramId) : null);
  const view = sp.view === "spend" ? "spend" : "activity";
  // Defaults to "today", not "7d" - at current call volume (~66k/day and
  // climbing) a 7-day window is 200-400k rows. Still fetchable (see
  // fetchUsageEventsPaged in lib/spend-data.ts) but "today" is both the
  // faster default and the actual question ("what are we burning right now").
  const spendWindow = isSpendWindow(sp.w) ? sp.w : "today";

  // The Spend tab reads usage_events itself (lib/spend-data.ts, paged, whole
  // window) - the activity fetch below is skipped entirely rather than run
  // and thrown away.
  if (view === "spend") {
    return (
      <div className="dashboard-page text-ink">
        <Tabs active="spend" activityHref={buildActivityHref(sp)} />
        <SpendView window={spendWindow} cloneId={cloneId} />
      </div>
    );
  }

  // usage_events only feeds the ElevenLabs and LLM buckets, and has no warn level.
  const wantUsage = (tech === "all" || tech === "elevenlabs" || tech === "llm") && level !== "warn";

  const [systemRes, usageRes] = await Promise.all([
    fetchSystemRows(tech, level, q, cloneId, Number.isFinite(fanTelegramId) ? fanTelegramId : null),
    wantUsage
      ? fetchUsageRows(tech, level, cloneId, fanUserId)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const systemMissing =
    !!systemRes.error && /system_logs|does not exist|schema cache|relation/i.test(systemRes.error.message);

  const systemRows = ((systemRes.data ?? []) as unknown as SystemDbRow[]).map(systemToRow);
  let usageRows = ((usageRes.data ?? []) as unknown as UsageDbRow[]).map(usageToRow);
  if (q.trim()) {
    const needle = q.trim().toLowerCase();
    usageRows = usageRows.filter((r) => r.message.toLowerCase().includes(needle));
  }

  const rows = [...systemRows, ...usageRows]
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    .slice(0, CAP);

  const errCount = rows.filter((r) => r.level === "error").length;
  const warnCount = rows.filter((r) => r.level === "warn").length;
  const spend = usageRows.reduce((s, r) => s + (Number((r.detail as { cost_usd?: number | null })?.cost_usd) || 0), 0);

  return (
    <div className="dashboard-page text-ink">
      <AutoRefresh />
      <Tabs active="activity" spendHref={buildSpendHref(sp)} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white/90 p-3 shadow-[var(--shadow-card)] backdrop-blur-xl">
        <LogFilters tech={tech} level={level} q={q} clone={sp.clone} fan={sp.fan} fanUser={sp.fanUser} fanLabel={sp.fanLabel} />
        <span className="shrink-0 rounded-full bg-elev px-2.5 py-1 text-[11px] font-medium text-muted">Refreshes every 30s</span>
      </div>

      {fanTelegramId != null && (
        <Card className="mb-4 flex items-center justify-between gap-3 border-accent/30 bg-accent/5 p-3">
          <span className="text-sm text-ink">
            Filtered to fan <span className="font-medium">{fanLabel}</span> - errors/warnings and AI calls for this
            fan only.
          </span>
          <a href="/logs" className="shrink-0 text-xs font-medium text-accent hover:underline">
            Clear fan filter
          </a>
        </Card>
      )}

      {systemMissing && (
        <Card className="mb-4 border-warn/40 p-4">
          <div className="text-sm font-medium text-warn">System logs table not set up</div>
          <p className="mt-1 text-sm text-muted">
            Apply migration <span className="font-mono text-ink">db/migrations/032_system_logs.sql</span> to Supabase,
            then restart the bot. Until then only AI call rows are shown.
          </p>
        </Card>
      )}
      {!systemMissing && systemRes.error && (
        <Card className="mb-4 border-crit/40 p-4">
          <div className="text-sm font-medium text-crit">Could not load system logs</div>
          <p className="mt-1 text-sm text-muted">{systemRes.error.message}</p>
        </Card>
      )}

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted">Events shown{rows.length >= CAP ? ` (newest ${CAP})` : ""}</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums">{rows.length.toLocaleString()}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted">Warnings / Errors</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums">
            <span className={warnCount > 0 ? "text-warn" : ""}>{warnCount}</span>
            <span className="text-muted"> / </span>
            <span className={errCount > 0 ? "text-crit" : ""}>{errCount}</span>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted">AI spend (shown rows)</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-good">${spend.toFixed(4)}</div>
        </Card>
      </div>

      <Card className="max-h-[calc(100vh-22rem)] min-h-80 overflow-y-auto p-0">
        <LogsTable rows={rows} showClone={!cloneId} />
      </Card>
    </div>
  );
}
