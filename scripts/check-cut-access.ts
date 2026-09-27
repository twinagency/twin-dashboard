import assert from "node:assert/strict";
import { withDashboardAccess } from "../lib/dashboard-access";
import { dashboardFetch } from "../lib/agency-fetch";
import { getCutPctForClone, getCutPctForAgency, getAgencyCreatorCutPct, invalidateCutCache, setCut } from "../lib/platform-cut";
import { JESS_KATE_PORTAL } from "../lib/partner-portals";

async function main() {
  Object.assign(process.env, { SUPABASE_URL: "https://cut-test.supabase.co", SUPABASE_SERVICE_KEY: "offline-test-key" });
  const clone = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const other = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const agency = {id:JESS_KATE_PORTAL.id,name:JESS_KATE_PORTAL.name,cloneIds:[clone]};
  const original = globalThis.fetch;
  const calls: URL[] = [];
  let broken = false;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push(url);
    assert.equal(init?.method ?? "GET", "GET", "Metadata lookup must not write");
    if (broken) return new Response(JSON.stringify({message:"database unavailable"}), {status:503});
    let data: unknown;
    if (url.pathname.endsWith("/agency_creators")) data = [{agency_id:agency.id}];
    else if (url.pathname.endsWith("/agency_creator_cuts")) data = [{cut_pct:30}];
    else if (url.pathname.endsWith("/platform_cuts")) data = url.searchParams.has("clone_id") ? null : {cut_pct:20};
    else throw new Error("Unexpected metadata request");
    return new Response(JSON.stringify(data), {headers:{"content-type":"application/json"}});
  };
  try {
    invalidateCutCache();
    await withDashboardAccess(agency, async () => {
      assert.equal(await getCutPctForClone(clone), 20, "Assigned creator resolves platform cut on cold cache");
      assert.equal(await getAgencyCreatorCutPct(clone), 30);
      const before = calls.length;
      assert.equal((await dashboardFetch("https://cut-test.supabase.co/rest/v1/platform_cuts?select=*")).status, 403, "Raw cut tables remain private");
      await assert.rejects(setCut({cloneId:clone},20,"test"));
      assert.equal(calls.length, before, "Unauthorized raw reads and writes never reach database");
    });
    await withDashboardAccess(null, async () => {
      assert.equal(await getCutPctForClone(other),20);
      assert.equal(await getAgencyCreatorCutPct(other),30);
      assert.equal(await getCutPctForAgency(agency.id),20);
    });
    const before = calls.length;
    await withDashboardAccess(agency, async () => {
      await assert.rejects(getCutPctForClone(other), /access denied/i);
      await assert.rejects(getAgencyCreatorCutPct(other), /access denied/i);
      await assert.rejects(getCutPctForAgency(agency.id), /Administrator/);
    });
    assert.equal(calls.length,before,"Cache hits still require creator authorization");
    invalidateCutCache(); broken = true;
    await withDashboardAccess(agency, async () => {
      await assert.rejects(getCutPctForClone(clone), /database unavailable/, "Metadata failure must not silently show gross earnings");
    });
    console.log("Cut access checks passed: cold agency lookup, private metadata, mutation denial, cached cross-creator denial, failure remains closed");
  } finally { globalThis.fetch=original; invalidateCutCache(); }
}
main().catch(error => { console.error(error); process.exitCode=1; });
