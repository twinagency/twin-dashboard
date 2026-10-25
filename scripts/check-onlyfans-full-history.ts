import assert from "node:assert/strict";
import {parseNativeEarnings,validEarningsWindow} from "../lib/onlyfans/earnings";
import {loadOnlyFansOverview} from "../lib/onlyfans/overview";
import type {OnlyFansBackend} from "../lib/onlyfans/backend";
const window={start:"1970-01-01T00:00:00.000Z",end:"2026-10-26T00:00:00.000Z"};
const recorded={grossCents:1500,netCents:1200,pendingGrossCents:0,pendingNetCents:0,paymentCount:1,lastSuccessfulSyncAt:window.end};
const value={schemaVersion:"of-earnings.v1",window,asOf:window.end,accountCount:1,coveredAccountCount:1,status:"current",reasons:[],currency:"USD",clearedGrossCents:1500,clearedNetCents:1200,clearedCount:1,pendingCount:0,refundedCount:0,recentLedgerAt:window.end,fullLedgerAt:window.end,recorded,
history:{accountCount:1,completedAccountCount:1,accounts:[{accountId:"account-a",status:"complete",importedPayments:1,lastSuccessfulSyncAt:window.end}]},
statistics:{byKind:[{kind:"tip",paymentCount:1,grossCents:1500,netCents:1200}],byAccount:[{accountId:"account-a",paymentCount:1,grossCents:1500,netCents:1200}]}};
assert(validEarningsWindow(window));
assert(!validEarningsWindow({...window,start:"1969-12-31T00:00:00.000Z"}));
assert(parseNativeEarnings(value,window));
const legacy={...value};delete (legacy as Partial<typeof value>).history;delete (legacy as Partial<typeof value>).statistics;
assert(parseNativeEarnings(legacy,window),"Existing callers remain compatible");
for(const change of [
 {history:{...value.history,completedAccountCount:0}},
 {history:{...value.history,accounts:[{...value.history.accounts[0],accountId:"../foreign"}]}},
 {history:{...value.history,accounts:[{...value.history.accounts[0],lastSuccessfulSyncAt:null}]}},
 {statistics:{...value.statistics,byKind:[{...value.statistics.byKind[0],grossCents:2000}]}},
 {statistics:{...value.statistics,byAccount:[...value.statistics.byAccount,...value.statistics.byAccount]}},
 {statistics:{...value.statistics,byAccount:[{...value.statistics.byAccount[0],netCents:1100}]}}
]) assert.equal(parseNativeEarnings({...value,...change},window),null);
let queries:{start:string;end:string}[]=[];
const backend={listAccounts:async()=>({ok:true,data:[]}),getEarnings:async(w:typeof window)=>{
 queries.push(w);return {ok:true,data:{...value,window:w}};
}} as unknown as OnlyFansBackend;
async function main(){
 for(const period of ["all","90d","30d","7d"] as const){
  const result=await loadOnlyFansOverview(backend,period,null,new Date(window.end));
  const expected=period==="all"?window.start:new Date(Date.parse(window.end)-Number.parseInt(period)*86400000).toISOString();
  assert.equal(result.window.start,expected);assert.deepEqual(queries.at(-1),result.window);
 }
 console.log("PASS full earnings history: lifetime/90-day windows, legacy compatibility, scoped import status, exact net/gross breakdown reconciliation and malformed/duplicate data refusal.");
}
main().catch(e=>{console.error(e);process.exitCode=1});
