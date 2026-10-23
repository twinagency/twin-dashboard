import assert from "node:assert/strict";
import { parseNativeEarnings } from "../lib/onlyfans/earnings";
import { parseCombinedEarnings } from "../lib/combined-earnings";
import { createHttpOnlyFansBackend,ONLYFANS_SCHEMA_VERSION_HEADER } from "../lib/onlyfans/backend";
import { ONLYFANS_PREVIEW_SCHEMA_VERSION } from "../lib/onlyfans-preview/types";
import { STAR_USD,starsToMoney } from "../lib/money";
async function main(){
 const window={start:"2026-10-01T00:00:00.000Z",end:"2026-10-18T00:00:00.000Z"};
 const native={schemaVersion:"of-earnings.v1",window,asOf:window.end,accountCount:1,coveredAccountCount:1,status:"current",reasons:[],currency:"USD",clearedGrossCents:1000,clearedNetCents:null,clearedCount:1,pendingCount:1,refundedCount:1,recentLedgerAt:window.end,fullLedgerAt:window.end};
 assert(parseNativeEarnings(native,window));
 for(const changed of [{currency:"AUD"},{clearedGrossCents:0.01},{accountCount:0},{status:"unavailable"},{window:{...window,end:"2026-10-19T00:00:00.000Z"}}])assert.equal(parseNativeEarnings({...native,...changed},window),null);
 const unavailable={...native,status:"unavailable",reasons:["ledger_unavailable"],coveredAccountCount:0,clearedGrossCents:null,clearedNetCents:null,clearedCount:null,pendingCount:null,refundedCount:null};
 assert(parseNativeEarnings(unavailable,window));assert.equal(parseNativeEarnings({...unavailable,clearedGrossCents:0},window),null);
 const combined={schemaVersion:"combined-earnings.v1",period:"1M",window,telegram:{status:"current",netStars:-100,sales:2,usdPayoutEstimate:starsToMoney(-100,"USD"),usdPerStar:STAR_USD,asOf:window.end,stale:false},onlyfans:native,onlyfansError:null};
 assert(parseCombinedEarnings(combined,"1M"));
 assert.equal(parseCombinedEarnings({...combined,totalRevenueUsd:8.7},"1M"),null,"no invented sum of unlike accounting bases");
 assert.equal(parseCombinedEarnings({...combined,telegram:{...combined.telegram,status:"unavailable"}},"1M"),null);
 const backend=createHttpOnlyFansBackend({baseUrl:"http://127.0.0.1:1",token:"synthetic-read-only",fetchImpl:async(url,init)=>{
  assert.equal(String(url),"http://127.0.0.1:1/onlyfans/api/v1/earnings?start="+encodeURIComponent(window.start)+"&end="+encodeURIComponent(window.end)+"&includePending=true");
  assert.equal(init?.method,"GET");assert.equal(init?.credentials,"omit");assert.equal(init?.cache,"no-store");
  const headers=new Headers(init?.headers);assert.equal(headers.get(ONLYFANS_SCHEMA_VERSION_HEADER),ONLYFANS_PREVIEW_SCHEMA_VERSION);assert.equal(headers.get("cookie"),null);
  return Response.json({schemaVersion:ONLYFANS_PREVIEW_SCHEMA_VERSION,earnings:native});
 }});
 assert((await backend.getEarnings!(window)).ok);
 console.log("PASS combined earnings: exact shared window, native currency and cent precision, signed Star proceeds, explicit missing net/unavailable values, no mixed-basis grand total, existing read-only backend transport");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
