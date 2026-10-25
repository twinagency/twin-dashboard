export type EarningsWindow={start:string;end:string};
export const EARNINGS_REASONS={no_bound_accounts:"No OnlyFans accounts are registered in this workspace.",ledger_unavailable:"Payment history has not completed synchronization for every account.",ledger_stale:"Payment history needs a fresh synchronization.",ledger_held:"Payment history needs review.",outside_coverage:"The period extends beyond verified payment history.",unsupported_currency:"A recorded currency needs review.",unsupported_status:"A recorded payment status needs review.",unverified_ledger_rows:"Some recorded payments still need native ledger verification."} as const;
export type RecordedEarnings={grossCents:number;netCents:number|null;pendingGrossCents:number;pendingNetCents:number|null;paymentCount:number;lastSuccessfulSyncAt:string};
export type EarningsAmount = {paymentCount:number;grossCents:number;netCents:number|null};
export type EarningsHistory = {accountCount:number;completedAccountCount:number;accounts:{accountId:string;status:"complete"|"syncing"|"held"|"unavailable";importedPayments:number;lastSuccessfulSyncAt:string|null}[]};
export type EarningsStatistics = {byKind:({kind:string}&EarningsAmount)[];byAccount:({accountId:string}&EarningsAmount)[]};
export type NativeEarnings={schemaVersion:"of-earnings.v1";window:EarningsWindow;asOf:string;accountCount:number;coveredAccountCount:number;
 status:"current"|"unavailable";reasons:(keyof typeof EARNINGS_REASONS)[];currency:"USD";
 clearedGrossCents:number|null;clearedNetCents:number|null;clearedCount:number|null;pendingCount:number|null;refundedCount:number|null;
 recentLedgerAt:string|null;fullLedgerAt:string|null;recorded?:RecordedEarnings|null;history?:EarningsHistory;statistics?:EarningsStatistics|null};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).sort().join(",") === [...keys].sort().join(",");
export const earningsStamp=(v:unknown):v is string=>typeof v==="string"&&/Z$/.test(v)&&Number.isFinite(Date.parse(v));
export const validEarningsWindow=(v:unknown):v is EarningsWindow=>object(v)&&exact(v,["start","end"])&&earningsStamp(v.start)&&earningsStamp(v.end)&&Date.parse(v.end)>Date.parse(v.start)&&Date.parse(v.start)>=0&&Date.parse(v.end)-Date.parse(v.start)<=60000*86400000;
export function parseNativeEarnings(v:unknown,window:EarningsWindow):NativeEarnings|null{
 if(!object(v)||!exact(v,["schemaVersion","window","asOf","accountCount","coveredAccountCount","status","reasons","currency","clearedGrossCents","clearedNetCents","clearedCount","pendingCount","refundedCount","recentLedgerAt","fullLedgerAt",...(Object.hasOwn(v,"recorded")?["recorded"]:[]),...(Object.hasOwn(v,"history")?["history"]:[]),...(Object.hasOwn(v,"statistics")?["statistics"]:[])])||v.schemaVersion!=="of-earnings.v1"||!validEarningsWindow(v.window)||v.window.start!==window.start||v.window.end!==window.end||!earningsStamp(v.asOf)||v.currency!=="USD"||!["current","unavailable"].includes(v.status as string))return null;
 const integer=(x:unknown,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(x)&&(x as number)>=min&&(x as number)<=max;
 if(!integer(v.accountCount,0,1000)||!integer(v.coveredAccountCount,0,v.accountCount as number)||!Array.isArray(v.reasons)||new Set(v.reasons).size!==v.reasons.length||v.reasons.some(r=>typeof r!=="string"||!Object.hasOwn(EARNINGS_REASONS,r)))return null;
 const amounts=[v.clearedGrossCents,v.clearedNetCents],counts=[v.clearedCount,v.pendingCount,v.refundedCount];
 if(amounts.some(x=>x!==null&&!integer(x,-Number.MAX_SAFE_INTEGER))||counts.some(x=>x!==null&&!integer(x))||[v.recentLedgerAt,v.fullLedgerAt].some(x=>x!==null&&!earningsStamp(x)))return null;
 if(v.status==="unavailable"?v.reasons.length===0||[...amounts,...counts].some(x=>x!==null):v.reasons.length!==0||v.accountCount===0||v.coveredAccountCount!==v.accountCount||v.recentLedgerAt===null||v.fullLedgerAt===null||v.clearedGrossCents===null||counts.some(x=>x===null))return null;
 if(v.recorded!==undefined&&v.recorded!==null){
  const r=v.recorded;
  if(!object(r)||!exact(r,["grossCents","netCents","pendingGrossCents","pendingNetCents","paymentCount","lastSuccessfulSyncAt"])||!integer(r.grossCents)||!integer(r.pendingGrossCents)||!integer(r.paymentCount)||![r.netCents,r.pendingNetCents].every(x=>x===null||integer(x,-Number.MAX_SAFE_INTEGER))||!earningsStamp(r.lastSuccessfulSyncAt)||r.lastSuccessfulSyncAt!==v.recentLedgerAt||(r.pendingGrossCents as number)>(r.grossCents as number)||v.accountCount===0||v.reasons.some(r=>r!=="ledger_stale"&&r!=="ledger_held"))return null;
 }
 if(v.history!==undefined){
  const h=v.history;
  if(!object(h)||!exact(h,["accountCount","completedAccountCount","accounts"])||h.accountCount!==v.accountCount||!integer(h.completedAccountCount,0,v.accountCount as number)||!Array.isArray(h.accounts)||h.accounts.length!==v.accountCount)return null;
  const ids=new Set<string>();let completed=0;
  for(const a of h.accounts){
   if(!object(a)||!exact(a,["accountId","status","importedPayments","lastSuccessfulSyncAt"])||typeof a.accountId!=="string"||!/^[A-Za-z0-9._:-]{1,64}$/.test(a.accountId)||ids.has(a.accountId)||!["complete","syncing","held","unavailable"].includes(a.status as string)||!integer(a.importedPayments,0,1000000000)||(a.lastSuccessfulSyncAt!==null&&!earningsStamp(a.lastSuccessfulSyncAt))||(a.status==="complete"&&a.lastSuccessfulSyncAt===null))return null;
   ids.add(a.accountId);if(a.status==="complete")completed++;
  }
  if(completed!==h.completedAccountCount)return null;
 }
 if(v.statistics!==undefined&&v.statistics!==null){
  const stats=v.statistics;
  if(!object(stats)||!exact(stats,["byKind","byAccount"])||!object(v.recorded))return null;
  for(const [name,key,max] of [["byKind","kind",20],["byAccount","accountId",1000]] as const){
   const rows=stats[name];if(!Array.isArray(rows)||rows.length>max)return null;
   const ids=new Set<string>();let gross=0,payments=0,net:number|null=0;
   for(const r of rows){
    if(!object(r)||!exact(r,[key,"paymentCount","grossCents","netCents"])||typeof r[key]!=="string"||!/^[A-Za-z0-9._:-]{1,64}$/.test(r[key] as string)||ids.has(r[key] as string)||!integer(r.paymentCount)||!integer(r.grossCents)||(r.netCents!==null&&!integer(r.netCents,-Number.MAX_SAFE_INTEGER)))return null;
    ids.add(r[key] as string);gross+=r.grossCents as number;payments+=r.paymentCount as number;net=net===null||r.netCents===null?null:net+(r.netCents as number);
   }
   if(gross!==v.recorded.grossCents||payments!==v.recorded.paymentCount||net!==v.recorded.netCents)return null;
  }
 }
 return v as NativeEarnings;
}
