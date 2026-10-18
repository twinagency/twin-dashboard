import { NextRequest,NextResponse } from "next/server";
import { requireOnlyFansRead,PRIVATE_HEADERS } from "@/lib/onlyfans/route";
import { getRevenueRollup } from "@/lib/revenue-cache";
import { resolvePresetRevenueWindow } from "@/lib/revenue-window";
import { STAR_USD,starsToMoney } from "@/lib/money";
import { COMBINED_PERIODS,type CombinedPeriod,type CombinedEarnings } from "@/lib/combined-earnings";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export async function GET(request:NextRequest){
 const context=await requireOnlyFansRead();if(context instanceof NextResponse)return context;
 const selected=request.nextUrl.searchParams.get("period")??"1M";
 if(!(COMBINED_PERIODS as readonly string[]).includes(selected)||[...request.nextUrl.searchParams.keys()].some(k=>k!=="period"||request.nextUrl.searchParams.getAll(k).length!==1))return NextResponse.json({ok:false,error:"Choose a supported reporting period."},{status:400,headers:PRIVATE_HEADERS});
 const period=selected as CombinedPeriod;
 let range=resolvePresetRevenueWindow(period,Date.now())!;
 let telegram:CombinedEarnings["telegram"]={status:"unavailable",netStars:null,sales:null,usdPayoutEstimate:null,usdPerStar:STAR_USD,asOf:null,stale:false};
 try{
  // The existing cache remains the sole Twin rollup/single-flight owner.
  const rollup=await getRevenueRollup(period,null,undefined,{awaitFresh:true});
  const window=rollup.reportWindow,totals=rollup.dashboard.totals;
  if(!window||!Number.isFinite(window.startMs)||!Number.isFinite(window.endMs)||window.endMs<=window.startMs||!Number.isSafeInteger(totals.stars)||!Number.isSafeInteger(totals.sales)||totals.sales<0||!Number.isFinite(rollup.cachedAt))throw new Error("Revenue metadata unavailable");
  range=window;telegram={status:"current",netStars:totals.stars,sales:totals.sales,usdPayoutEstimate:starsToMoney(totals.stars,"USD"),usdPerStar:STAR_USD,asOf:new Date(rollup.cachedAt).toISOString(),stale:rollup.stale};
 }catch{/* A failed primary revenue read stays unavailable, not zero. */}
 const window={start:new Date(range.startMs).toISOString(),end:new Date(range.endMs).toISOString()};
 let onlyfans:CombinedEarnings["onlyfans"]=null,onlyfansError:string|null="OnlyFans earnings are not configured or could not be read.";
 if(context.backend?.getEarnings){const result=await context.backend.getEarnings(window);if(result.ok){onlyfans=result.data;onlyfansError=null;}}
 const body:CombinedEarnings={schemaVersion:"combined-earnings.v1",period,window,telegram,onlyfans,onlyfansError};
 return NextResponse.json(body,{headers:PRIVATE_HEADERS});
}
