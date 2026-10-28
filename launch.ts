import { createFlow, setFlowEnabled } from "@/lib/mtproto/flows";
import { createDryRun, queueRun } from "@/lib/mtproto/runs";
import { supabaseAdmin } from "@/lib/supabase";
const ACTOR = "Ronan via Claude";
const EXEC = process.argv[2] === "exec";
const G: Record<string, { clone: string; bundle?: string; more?: string; runCap?: number | null }> = {
  callace: { clone: "2e5eb05f-cc88-4ba6-870a-924948d4b09a", bundle: "6073754d-9818-40d9-a567-84b41543a5df", more: "0525fb0d-10b7-45f5-8175-31469b2e0e3c", runCap: 5 },
};
async function main() {
  const { data: clones } = await supabaseAdmin.from("clones").select("id,name").in("name", ["Briana Redd","Riley Mae Lewis","Cat","Tamara","Zoey Foxx","Dakota Lyn","Sania Mallory"]);
  const id = (n: string) => clones!.find((c: any) => c.name === n)!.id as string;
  const { data: bs } = await supabaseAdmin.from("photo_bundles").select("id,clone_id,name,star_price").in("clone_id", clones!.map((c: any) => c.id)).eq("campaign_only", false);
  const pick = (cid: string, name: string) => bs!.find((b: any) => b.clone_id === cid && b.name === name)!.id as string;
  G.tamara = { clone: id("Tamara"), bundle: pick(id("Tamara"), "BBYTAM VIP Bundle") };
  G.zoey = { clone: id("Zoey Foxx"), bundle: pick(id("Zoey Foxx"), "Welcome Pack") };
  G.sania = { clone: id("Sania Mallory"), bundle: pick(id("Sania Mallory"), "Welcome Pack") };
  G.bri = { clone: id("Briana Redd"), bundle: pick(id("Briana Redd"), "For You") };
  G.cat = { clone: id("Cat"), bundle: pick(id("Cat"), "Lingerie and bath set") };
  G.riley = { clone: id("Riley Mae Lewis") };
  G.dakota = { clone: id("Dakota Lyn") };
  console.log(JSON.stringify(G, null, 1));
  if (!EXEC) return;
  const lim = await supabaseAdmin.from("app_settings").select("value").eq("key", "mtproto_limits").single();
  const l = JSON.parse(lim.data!.value as string); l.hourlyCap = 25;
  await supabaseAdmin.from("app_settings").update({ value: JSON.stringify(l) }).eq("key", "mtproto_limits");
  await supabaseAdmin.from("app_settings").upsert({ key: "mtproto_flows_enabled", value: "true" });
  for (const [k, g] of Object.entries(G)) {
    let flowId: string | null = null;
    if (g.bundle) {
      const steps: any[] = [
        { id: "yes_offer", when: "yes", action: { type: "bundle_offer", bundleId: g.bundle, caption: "here it is baby, unlock it for me x" } },
        { id: "nudge", when: "after_minutes", afterMinutes: 10, action: { type: "text", lines: ["did you see it? x", "still got it for you baby x"] } },
      ];
      if (g.more) steps.push({ id: "bought_more", when: "purchased", action: { type: "bundle_offer", bundleId: g.more, caption: "theres a bit more from that set too. want it? x" } });
      const f = await createFlow({ name: `GPT flow ${k} 2026-10-26`, cloneId: g.clone, steps }, ACTOR);
      await setFlowEnabled(f.id, true, ACTOR);
      flowId = f.id;
    }
    const run = await createDryRun({ createdBy: ACTOR, cloneIds: [g.clone], filters: { cloneIds: [g.clone], segment: "top_spenders", minSpendStars: 1, includeLegacy: true }, dailyCap: 150, runCap: g.runCap ?? null, holdoutPct: 10, flowId, note: `buyers flow ${k} 2026-10-26` } as any);
    await queueRun(run.id, ACTOR);
    console.log(k, "flow", flowId, "run", run.id);
  }
}
main().catch((e) => { console.error("ERR", e); process.exit(1); });
