import { requireCreatorWorkspace } from "@/lib/creator-dashboard";
import { withDashboardAccess } from "@/lib/dashboard-access";
import { supabaseAdmin } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { AutoRefresh } from "@/app/logs/AutoRefresh";
export const dynamic = "force-dynamic";

export default async function CreatorLogsPage() {
  const creator = await requireCreatorWorkspace();
  const id = creator.cloneIds[0];
  const levels = id ? await withDashboardAccess(creator, async () => {
    const result = await supabaseAdmin.from("system_logs").select("level").eq("clone_id", id).order("ts", { ascending: false }).limit(500);
    if (result.error) throw new Error("Your activity summary could not be loaded. Refresh to try again.");
    return result.data || [];
  }) : [];
  const counts = {
    info: levels.filter(row => row.level === "info").length,
    warn: levels.filter(row => row.level === "warn").length,
    error: levels.filter(row => row.level === "error").length,
  };
  return <div className="grid min-w-0 gap-5 text-ink">
    <div className="flex items-center justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">Logs</h1><p className="mt-1 text-sm text-muted">Activity summary for your AI profile, based on the latest {levels.length.toLocaleString()} entries.</p></div>
      <AutoRefresh />
    </div>
    <div className="grid gap-4 sm:grid-cols-3">
      {([["Information", counts.info], ["Warnings", counts.warn], ["Errors", counts.error]] as const).map(([label, value]) => <Card key={label} className="p-5"><h2 className="text-sm text-muted">{label}</h2><p className="mt-2 text-2xl font-semibold">{value.toLocaleString()}</p></Card>)}
    </div>
    <p className="text-sm text-muted">Your agency manages detailed activity logs.</p>
  </div>;
}
