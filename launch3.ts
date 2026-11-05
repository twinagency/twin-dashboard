import { supabaseAdmin } from "@/lib/supabase";
import { createDryRun, queueRun } from "@/lib/mtproto/runs";
const A = "Ronan via Claude";
const R: [string, string, string | null][] = [
 ["callace","2e5eb05f-cc88-4ba6-870a-924948d4b09a","688205cc-ec96-4784-a863-4e3aad889461"],
 ["tamara","7eae9772-eb7c-4a24-a54f-51cbb28f1def","6a5acbb9-9786-4121-86fe-8ac52ec50494"],
 ["zoey","4fff7866-c7e9-4af2-926a-36e727c0a77f","027e05e5-31b9-4940-b28f-154e5674974b"],
 ["sania","dd1869c2-d1e2-490f-9fae-45200232cc30","434b0e99-3c84-471f-bbca-71ef9a69e823"],
 ["bri","0328e7b3-a1e5-465a-9a30-c9cf6519cba1","2a540e8a-6edf-41b4-921d-29df9aad0aeb"],
 ["cat","046fd9b0-7771-49ef-a7df-9d2c518575cc","0b547624-0116-40ed-aa15-216e2d056bec"],
 ["riley","20ef9407-83f2-4351-8d3c-48cc0ed54e0b",null],
 ["dakota","85d226d6-91f1-4082-9534-d500a68ed537",null],
];
(async () => { for (const [k,c,f] of R) {
  const run = await createDryRun({ createdBy: A, cloneIds:[c], filters:{cloneIds:[c], segment:"top_spenders", minSpendStars:1, includeLegacy:true}, dailyCap:150, runCap:null, holdoutPct:10, flowId:f, allowRecontact:true, note:`buyers nolimit ${k} 2026-10-26` } as any);
  await supabaseAdmin.from("reengage_runs").update({ filters: { ...(run.filters as object), lifetimeUnlimited: true } }).eq("id", run.id); console.log(k, run.id);
}})().catch(e=>{console.error("ERR",e.message);process.exit(1)});
