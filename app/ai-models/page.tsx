import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Info } from "@/components/clone/fields";
import { getDashboardAccess } from "@/lib/dashboard-access";
import { supabaseAdmin } from "@/lib/supabase";
import { tablesMissing } from "@/lib/tsocial";
import { NewModelForm } from "./Controls";

export const dynamic = "force-dynamic";

type Model = { id: string; slug: string; name: string; status: string; tsocial_enabled: boolean; created_at: string };

export default async function AiModelsPage() {
  if ((await getDashboardAccess()) !== null) notFound();
  const res = await supabaseAdmin.from("ai_models").select("id,slug,name,status,tsocial_enabled,created_at").order("created_at", { ascending: false }).limit(200);
  const missing = !!res.error && (tablesMissing(res.error) || /ai_models/.test(res.error.message));
  const models = ((res.error ? [] : res.data) ?? []) as Model[];
  const imgs = models.length ? (((await supabaseAdmin.from("ai_model_images").select("model_id,status,access").in("model_id", models.map((m) => m.id)).limit(20000)).data ?? []) as { model_id: string; status: string; access: string }[]) : [];
  const stat = (id: string) => {
    const mine = imgs.filter((i) => i.model_id === id);
    return { total: mine.length, pending: mine.filter((i) => i.status === "pending").length, free: mine.filter((i) => i.status === "approved" && i.access === "free").length, locked: mine.filter((i) => i.status === "approved" && i.access === "locked").length };
  };
  return (
    <main className="dashboard-page flex flex-col gap-6">
      <h1 className="flex items-center gap-1 text-3xl font-bold text-ink">AI Models<Info text="Made-up girls for the T-Social Mini App. Fill in her persona, upload pics, mark each Free or Locked, approve them, then switch her on." /></h1>
      {missing ? (
        <Card><CardContent><p className="text-sm text-ink">The AI model tables are not created yet. Apply <code>db/migrations/20261008140000_ai_models.sql</code> in the bot repo first.</p></CardContent></Card>
      ) : (
        <>
          <Card><CardContent><NewModelForm /></CardContent></Card>
          <Card>
            <CardContent>
              <h2 className="mb-3 text-lg font-semibold text-ink">Models ({models.length})</h2>
              {models.length === 0 ? <p className="text-sm text-ink">No AI models yet.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="text-xs text-muted"><tr><th className="py-2 pr-3">Name</th><th className="px-2">In T-Social</th><th className="px-2">Free pics</th><th className="px-2">Locked pics</th><th className="px-2">Pending</th><th className="px-2">Files</th></tr></thead>
                    <tbody className="divide-y divide-line">
                      {models.map((m) => { const s = stat(m.id); return (
                        <tr key={m.id}>
                          <td className="py-2 pr-3"><Link href={`/ai-models/${m.id}`} className="font-medium text-ink underline-offset-2 hover:underline">{m.name}</Link><div className="text-xs text-muted">{m.slug}</div></td>
                          <td className="px-2">{m.tsocial_enabled ? "On" : "Off"}</td><td className="px-2">{s.free}</td><td className="px-2">{s.locked}</td><td className="px-2">{s.pending}</td><td className="px-2">{s.total}</td>
                        </tr>
                      ); })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
