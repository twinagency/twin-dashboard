export type EarningsWindow={start:string;end:string};
export const EARNINGS_REASONS={no_bound_accounts:"No OnlyFans accounts are registered in this workspace.",ledger_unavailable:"Payment history has not completed synchronization for every account.",ledger_stale:"Payment history needs a fresh synchronization.",ledger_held:"Payment history needs review.",outside_coverage:"The period extends beyond verified payment history.",unsupported_currency:"A recorded currency needs review.",unsupported_status:"A recorded payment status needs review.",unverified_ledger_rows:"Some recorded payments still need native ledger verification."} as const;
export type NativeEarnings={schemaVersion:"of-earnings.v1";window:EarningsWindow;asOf:string;accountCount:number;coveredAccountCount:number;
 status:"current"|"unavailable";reasons:(keyof typeof EARNINGS_REASONS)[];currency:"USD";
 clearedGrossCents:number|null;clearedNetCents:number|null;clearedCount:number|null;pendingCount:number|null;refundedCount:number|null;
 recentLedgerAt:string|null;fullLedgerAt:string|null};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).sort().join(",") === [...keys].sort().join(",");
export const earningsStamp=(v:unknown):v is string=>typeof v==="string"&&/Z$/.test(v)&&Number.isFinite(Date.parse(v));
export const validEarningsWindow=(v:unknown):v is EarningsWindow=>object(v)&&exact(v,["start","end"])&&earningsStamp(v.start)&&earningsStamp(v.end)&&Date.parse(v.end)>Date.parse(v.start)&&Date.parse(v.end)-Date.parse(v.start)<=91*86400000;
export function parseNativeEarnings(v:unknown,window:EarningsWindow):NativeEarnings|null{
 if(!object(v)||!exact(v,["schemaVersion","window","asOf","accountCount","coveredAccountCount","status","reasons","currency","clearedGrossCents","clearedNetCents","clearedCount","pendingCount","refundedCount","recentLedgerAt","fullLedgerAt"])||v.schemaVersion!=="of-earnings.v1"||!validEarningsWindow(v.window)||v.window.start!==window.start||v.window.end!==window.end||!earningsStamp(v.asOf)||v.currency!=="USD"||!["current","unavailable"].includes(v.status as string))return null;
 const integer=(x:unknown,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(x)&&(x as number)>=min&&(x as number)<=max;
 if(!integer(v.accountCount,0,1000)||!integer(v.coveredAccountCount,0,v.accountCount as number)||!Array.isArray(v.reasons)||new Set(v.reasons).size!==v.reasons.length||v.reasons.some(r=>typeof r!=="string"||!Object.hasOwn(EARNINGS_REASONS,r)))return null;
 const amounts=[v.clearedGrossCents,v.clearedNetCents],counts=[v.clearedCount,v.pendingCount,v.refundedCount];
 if(amounts.some(x=>x!==null&&!integer(x,-Number.MAX_SAFE_INTEGER))||counts.some(x=>x!==null&&!integer(x))||[v.recentLedgerAt,v.fullLedgerAt].some(x=>x!==null&&!earningsStamp(x)))return null;
 if(v.status==="unavailable"?v.reasons.length===0||[...amounts,...counts].some(x=>x!==null):v.reasons.length!==0||v.accountCount===0||v.coveredAccountCount!==v.accountCount||v.recentLedgerAt===null||v.fullLedgerAt===null||v.clearedGrossCents===null||counts.some(x=>x===null))return null;
 return v as NativeEarnings;
}
