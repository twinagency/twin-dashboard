import { requireCreatorDashboard } from "@/lib/creator-dashboard-access";
import { serviceClient } from "@/lib/supabase-service";
import { LogsTable, type LogRow } from "@/app/logs/LogsTable";
import { KIND_LABEL, techForUsageKind } from "@/app/logs/tech";
import { Card } from "@/components/ui/card";
export const dynamic = "force-dynamic";
export default async function CreatorLogsPage({ searchParams }: { searchParams: Promise<{ level?: string; q?: string }> }) {
  const identity = await requireCreatorDashboard();
  const { level = "", q = "" } = await searchParams;
  let rows: LogRow[] = [];
  if (identity.cloneId) {
    let query = serviceClient().from("usage_events").select("id,created_at,kind,ok").eq("clone_id", identity.cloneId).order("created_at", { ascending: false }).limit(500);
    if (level === "error") query = query.eq("ok", false);
    if (level === "info") query = query.eq("ok", true);
    const result = await query;
    if (result.error) throw new Error("Unable to load your activity logs.");
    rows = (result.data || []).map(row => ({ key: row.id, ts: row.created_at, level: row.ok ? "info" : "error", tech: techForUsageKind(row.kind), source: row.kind, cloneName: identity.cloneName, fan: null, message: `${KIND_LABEL[row.kind] || row.kind} ${row.ok ? "completed" : "failed"}`, detail: { result: row.ok ? "Completed" : "Failed", time: row.created_at }, model: null }));
    rows = rows.filter(row => row.message.toLowerCase().includes(q.toLowerCase()));
  }
  return <div className="dashboard-page text-ink"><h1 className="mb-1 text-2xl font-semibold">Logs</h1><p className="mb-5 text-sm text-muted">Recent activity for your clone.</p><form action="/creator/logs" className="mb-4 flex flex-wrap gap-3"><input name="q" aria-label="Search logs" defaultValue={q} placeholder="Search activity" className="rounded-lg border border-line bg-panel px-3 py-2 text-sm" /><select name="level" aria-label="Log level" defaultValue={level} className="rounded-lg border border-line bg-panel px-3 py-2 text-sm"><option value="">All levels</option><option value="info">Completed</option><option value="error">Errors</option></select><button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">Apply / refresh</button></form><Card className="overflow-x-auto p-0"><LogsTable rows={rows} showClone={false} /></Card></div>;
}
