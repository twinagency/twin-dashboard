import { __setViewerTermsOverrideForTests } from "../lib/platform-cut";
import assert from "node:assert/strict";
import { scopeReadUrl, scopedSelection, AGENCY_ROLLUPS } from "../lib/agency-query";
import { withDashboardAccess, getDashboardAccess, accessCacheKey } from "../lib/dashboard-access";
import { dashboardFetch } from "../lib/agency-fetch";
const a={id:"agency-a",name:"A",cloneIds:["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"]};
const b={id:"agency-b",name:"B",cloneIds:["bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"]};
async function main(){
  const base="https://agency-test.supabase.co/rest/v1/";
  for(const table of ["clones","users","chat_history","star_transactions","photos","videos","photo_bundles","fan_profiles","system_logs","usage_events","intent_offer_events"]){
    const {url}=scopeReadUrl(new URL(`${base}${table}?select=*&or=(clone_id.eq.bad)&limit=20`),a);
    assert.match(url.searchParams.get("and")!,new RegExp(a.cloneIds[0]));
    assert.equal(url.searchParams.get("limit"),"20");
    if(table==="clones")assert.ok(!url.searchParams.get("select")!.split(",").includes("bot_token"));
  }
  assert.match(scopeReadUrl(new URL(base+"users"),{...a,cloneIds:[]}).url.searchParams.get("and")!,/00000000-0000-0000-0000-000000000000/);
  assert.match(scopedSelection("photo_bundles","*, photo_bundle_items(*)"),/photo_bundle_items\(id,bundle_id,storage_path,sort_order\)/);
  for(const select of ["*,clones(*)","secret:bot_token","unknown_column","*,users(*)"]){assert.throws(()=>scopedSelection("clones",select));}
  for(const table of ["app_settings","api_keys","agency_memberships","tracker_items","photo_bundle_items"]){assert.throws(()=>scopeReadUrl(new URL(base+table),a));}
  assert.notEqual(accessCacheKey(a),accessCacheKey(b));assert.notEqual(accessCacheKey(a),accessCacheKey(null));assert.notEqual(accessCacheKey(a),accessCacheKey({...a,cloneIds:[]}));
  await Promise.all([a,b].map(access=>withDashboardAccess(access,async()=>{await new Promise(r=>setTimeout(r,5));assert.equal(await getDashboardAccess(),access);}))); 
  __setViewerTermsOverrideForTests(async()=>({starMult:0.5,usdPerStar:0.013}));
  const original=globalThis.fetch;const seen:{url:string;init?:RequestInit}[]=[];
  globalThis.fetch=async(input:any,init?:RequestInit)=>{seen.push({url:String(input),init});return new Response(JSON.stringify([{id:"safe",bot_token:"must-not-leak"}]),{headers:{"content-type":"application/json"}})};
  try{
    await withDashboardAccess(a,async()=>{
      const result=await dashboardFetch(base+"clones?select=*");assert.equal((await result.json())[0].bot_token,null);assert.ok(decodeURIComponent(seen[0].url).includes(a.cloneIds[0]));
      for(const method of ["POST","PATCH","PUT","DELETE"]){const n=seen.length;assert.equal((await dashboardFetch(base+"users",{method})).status,403);assert.equal(seen.length,n);}
      for(const fn of AGENCY_ROLLUPS){await dashboardFetch(base+"rpc/"+fn,{method:"POST",body:JSON.stringify({p_clone:null,p_clones:b.cloneIds})});const req=seen.at(-1)!;assert.ok(req.url.endsWith("agency_"+fn));assert.deepEqual(JSON.parse(String(req.init?.body)).p_clones,a.cloneIds);}
      assert.equal((await dashboardFetch(base+"rpc/revenue_all_time_stars",{method:"POST",body:JSON.stringify({p_clone:b.cloneIds[0]})})).status,403);
      assert.equal((await dashboardFetch(base+"rpc/unknown",{method:"POST"})).status,403);
      assert.equal((await dashboardFetch("https://agency-test.supabase.co/storage/v1/object/media/other",{method:"DELETE"})).status,403);
      assert.equal((await dashboardFetch("https://agency-test.supabase.co/auth/v1/admin/users",{method:"POST"})).status,403);
    });
    await withDashboardAccess(null,async()=>{const n=seen.length;await dashboardFetch(base+"users",{method:"PATCH"});assert.equal(seen.length,n+1,"Internal access preserved");});
  }finally{globalThis.fetch=original;}
  console.log("Agency query boundary: table isolation, projections, nested rows, RPC scopes, write blocking and concurrent cache identities passed");
}
main().catch(e=>{console.error(e);process.exit(1)});
