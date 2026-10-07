import { requireCreatorWorkspace } from "@/lib/creator-dashboard";
import { withDashboardAccess } from "@/lib/dashboard-access";
import { supabaseAdmin } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AutoRefresh } from "@/app/logs/AutoRefresh";
export const dynamic = "force-dynamic";
export default async function CreatorLogsPage({ searchParams }: { searchParams: Promise<{ level?: string; q?: string }> }) {
  const creator = await requireCreatorWorkspace();
  const id = creator.cloneIds[0];
  const params = await searchParams;
  const level = ["info", "warn", "error"].includes(params.level || "") ? params.level! : "all";
  const search = (params.q || "").slice(0, 200);
  const rows = id ? await withDashboardAccess(creator, async () => {
    let query = supabaseAdmin.from("system_logs").select("id,ts,level,source,message").eq("clone_id", id).order("ts", { ascending: false }).limit(500);
    if (level !== "all") query = query.eq("level", level);
    if (search.trim()) query = query.ilike("message", `%${search.trim().replace(/[%_]/g, "\\$&")}%`);
    const result = await query;
    if (result.error) throw new Error("Your activity logs could not be loaded. Refresh to try again.");
    return result.data || [];
  }) : [];
  return <div className="grid min-w-0 gap-5 text-ink"><div className="flex items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Logs</h1><p className="mt-1 text-sm text-muted">Latest activity for your AI profile. Up to 500 matching entries.</p></div><AutoRefresh /></div><form action="/creator/logs" method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-panel p-4"><label className="grid gap-1 text-sm text-muted">Level<select name="level" defaultValue={level} className="rounded-lg border border-line bg-panel px-3 py-2 text-ink"><option value="all">All levels</option><option value="info">Info</option><option value="warn">Warning</option><option value="error">Error</option></select></label><label className="grid min-w-0 flex-1 gap-1 text-sm text-muted">Search<input name="q" defaultValue={search} maxLength={200} placeholder="Search activity" className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-ink" /></label><Button type="submit">Apply</Button><a href="/creator/logs" className="rounded-lg border border-line px-3 py-2 text-sm">Clear</a></form><Card className="overflow-x-auto p-0"><table className="w-full text-left text-sm"><thead className="border-b border-line bg-elev text-xs text-muted"><tr><th className="px-4 py-3">Time</th><th className="px-4 py-3">Level</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Activity</th></tr></thead><tbody className="divide-y divide-line">{rows.map(row => <tr key={row.id} className="align-top"><td className="whitespace-nowrap px-4 py-3 text-xs text-muted">{new Date(row.ts).toLocaleString("en-AU", { timeZone: "Australia/Brisbane" })}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs ${row.level === "error" ? "bg-crit/10 text-crit" : row.level === "warn" ? "bg-warn/10 text-warn" : "bg-elev text-muted"}`}>{row.level}</span></td><td className="px-4 py-3 text-xs text-muted">{row.source}</td><td className="min-w-[200px] max-w-2xl whitespace-pre-wrap break-words px-4 py-3">{row.message}</td></tr>)}{!rows.length && <tr><td colSpan={4} className="p-10 text-center text-muted">No activity matches these filters.</td></tr>}</tbody></table></Card><p className="text-xs text-muted">Times shown in Brisbane time.</p></div>;
}
