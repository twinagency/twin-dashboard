import { supabaseAdmin } from "@/lib/supabase";
import { getCloneScope } from "@/lib/clone-scope";
import { Card } from "@/components/ui/card";
import { AutoRefresh } from "./AutoRefresh";
import { LogFilters } from "./LogFilters";
import { LogsTable, type LogRow } from "./LogsTable";
import { CLAIMED_SOURCES, KIND_LABEL, SYSTEM_SOURCE_BUCKETS, techForSystemSource, techForUsageKind, type Tech } from "./tech";

export const dynamic = "force-dynamic";

// Unified stream: newest 500 across both tables after merge.
const CAP = 500;

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

const TECHS: Tech[] = ["elevenlabs", "llm", "telegram", "supabase", "code"];

function fetchSystemRows(tech: string, level: string, q: string, cloneId: string | null) {
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
  return query;
}

function fetchUsageRows(tech: string, level: string, cloneId: string | null) {
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
  searchParams: Promise<{ tech?: string; level?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const tech = sp.tech && (TECHS as string[]).includes(sp.tech) ? sp.tech : "all";
  const level = sp.level === "info" || sp.level === "warn" || sp.level === "error" ? sp.level : "all";
  const q = sp.q ?? "";
  const cloneId = await getCloneScope();

  // usage_events only feeds the ElevenLabs and LLM buckets, and has no warn level.
  const wantUsage = (tech === "all" || tech === "elevenlabs" || tech === "llm") && level !== "warn";

  const [systemRes, usageRes] = await Promise.all([
    fetchSystemRows(tech, level, q, cloneId),
    wantUsage ? fetchUsageRows(tech, level, cloneId) : Promise.resolve({ data: [], error: null }),
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
    <div className="text-ink">
      <AutoRefresh />
      <div className="mb-1 flex items-start justify-between gap-3">
        <LogFilters tech={tech} level={level} q={q} />
        <span className="mt-1.5 shrink-0 text-xs text-muted">auto-refreshes every 30s</span>
      </div>

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

      <Card className="overflow-hidden p-0">
        <LogsTable rows={rows} showClone={!cloneId} />
      </Card>
    </div>
  );
}
