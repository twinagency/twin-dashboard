import { parseNativeEarnings,validEarningsWindow,earningsStamp,type NativeEarnings,type EarningsWindow } from "./onlyfans/earnings";
export const COMBINED_PERIODS=["1W","1M","3M"] as const;
export type CombinedPeriod=typeof COMBINED_PERIODS[number];
export type CombinedEarnings={schemaVersion:"combined-earnings.v1";period:CombinedPeriod;window:EarningsWindow;
 telegram:{status:"current"|"unavailable";netStars:number|null;sales:number|null;usdPayoutEstimate:number|null;usdPerStar:number;asOf:string|null;stale:boolean};
 onlyfans:NativeEarnings|null;onlyfansError:string|null};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).sort().join(",") === [...keys].sort().join(",");
export function parseCombinedEarnings(v:unknown,period:CombinedPeriod):CombinedEarnings|null{
 if(!object(v)||!exact(v,["schemaVersion","period","window","telegram","onlyfans","onlyfansError"])||v.schemaVersion!=="combined-earnings.v1"||v.period!==period||!validEarningsWindow(v.window)||!object(v.telegram))return null;
 const t=v.telegram;
 if(!exact(t,["status","netStars","sales","usdPayoutEstimate","usdPerStar","asOf","stale"])||!["current","unavailable"].includes(t.status as string)||typeof t.stale!=="boolean"||typeof t.usdPerStar!=="number"||!Number.isFinite(t.usdPerStar)||t.usdPerStar<=0||t.usdPerStar>1||!(t.asOf===null||earningsStamp(t.asOf)))return null;
 if(t.status==="current"? !Number.isSafeInteger(t.netStars)||!Number.isSafeInteger(t.sales)||(t.sales as number)<0||typeof t.usdPayoutEstimate!=="number"||!Number.isFinite(t.usdPayoutEstimate)||t.asOf===null : [t.netStars,t.sales,t.usdPayoutEstimate,t.asOf].some(x=>x!==null))return null;
 if(v.onlyfans===null?typeof v.onlyfansError!=="string"||!v.onlyfansError||v.onlyfansError.length>200:v.onlyfansError!==null||!parseNativeEarnings(v.onlyfans,v.window))return null;
 return v as CombinedEarnings;
}
