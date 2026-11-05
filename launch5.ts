import { createDryRun, queueRun } from "@/lib/mtproto/runs";
import { supabaseAdmin } from "@/lib/supabase";
const A = "Ronan via Claude";
(async () => {
  const { data } = await supabaseAdmin.from("clones").select("id,name").in("name", ["Olivia Jade", "Toochi"]);
  for (const c of data!) {
    const run = await createDryRun({ createdBy: A, cloneIds: [c.id], filters: { cloneIds: [c.id], segment: "top_spenders", minSpendStars: 1, includeLegacy: true }, dailyCap: 600, runCap: null, holdoutPct: 10, flowId: null, allowRecontact: true, note: `buyers all600 ${c.name.split(" ")[0].toLowerCase()} 2026-10-26` } as any);
    await supabaseAdmin.from("reengage_runs").update({ filters: { ...(run.filters as object), lifetimeUnlimited: true } }).eq("id", run.id);
    await queueRun(run.id, A);
    console.log(c.name, run.id);
  }
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
