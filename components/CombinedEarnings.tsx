"use client";
import { useCallback,useEffect,useRef,useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Info,inputCls } from "@/components/clone/fields";
import { parseCombinedEarnings,type CombinedEarnings as Data,type CombinedPeriod } from "@/lib/combined-earnings";
import { EARNINGS_REASONS,providerSum,wholeDollars } from "@/lib/onlyfans/earnings";
import { formatRecordedMoney } from "@/lib/onlyfans/workspace";
const money=(v:number|null)=>v===null?"Unavailable":formatRecordedMoney(v,"USD");
const when=(s:string)=>new Intl.DateTimeFormat("en-AU",{dateStyle:"medium",timeStyle:"short",timeZone:"Australia/Sydney"}).format(new Date(s));
export default function CombinedEarnings({embedded=false}:{embedded?:boolean}){
 const [period,setPeriod]=useState<CombinedPeriod>("1M"),[data,setData]=useState<Data|null>(null),[busy,setBusy]=useState(true),[notice,setNotice]=useState("Loading recorded earnings…");
 const generation=useRef(0),active=useRef(false);
 const read=useCallback(async()=>{
  const version=++generation.current;setBusy(true);setData(null);setNotice("Loading recorded earnings…");
  try{
   const response=await fetch("/api/combined-earnings?period="+period,{cache:"no-store",credentials:"same-origin",redirect:"error",signal:AbortSignal.timeout(120000)});
   const next=response.ok?parseCombinedEarnings(await response.json(),period):null;
   if(!active.current||version!==generation.current)return;
   if(!next){setNotice([401,403].includes(response.status)?"An internal operator session is required to read combined earnings.":"Combined earnings could not be read. Refresh to try again.");return;}
   setData(next);setNotice("");
  }catch{if(active.current&&version===generation.current)setNotice("Combined earnings could not be read. Refresh to try again.");}
  finally{if(active.current&&version===generation.current)setBusy(false);}
 },[period]);
 useEffect(()=>{active.current=true;void read();return()=>{active.current=false;generation.current++;};},[read]);
 const native=data?.onlyfans,telegram=data?.telegram;
 const recorded=native?.recorded;
 const provider=!recorded&&native?.status!=="current"?providerSum(native,data?({"1W":"7d","1M":"30d","3M":"90d"} as const)[data.period]:null,null):null;
 return <div className={`${embedded ? "" : "dashboard-page "}min-w-0 space-y-5 pb-8`} data-combined-earnings>
  <div><h2 className="text-2xl font-semibold">{embedded ? "Earnings across channels" : "All channels"}</h2><p className="mt-1 text-sm text-muted">Recorded earnings across Telegram and the connected OnlyFans workspace.</p></div>
  <div className="flex flex-wrap items-end gap-3"><label className="text-xs text-muted">Reporting period<select data-combined-period className={`${inputCls} mt-1`} value={period} onChange={e=>setPeriod(e.target.value as CombinedPeriod)}><option value="1W">7 days</option><option value="1M">30 days</option><option value="3M">90 days</option></select></label><button className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-accent disabled:opacity-50" disabled={busy} onClick={()=>void read()}>Refresh earnings</button></div>
  {notice?<p role="status" className="text-sm text-muted">{notice}</p>:null}
  {data?<>
   <p className="text-xs text-muted">{when(data.window.start)} to {when(data.window.end)} · Australia/Sydney reporting time</p>
   <div className="grid min-w-0 gap-4 lg:grid-cols-2">
    <Card className="min-w-0 p-5" data-combined-telegram><h2 className="font-semibold">Telegram</h2><div className="mt-4 flex items-center gap-1 text-xs text-muted">Net recorded proceeds<Info text="Uses Twin’s existing Star ledger and shared revenue cache, including recorded refunds and adjustments. This is the accessible Twin fleet."/></div><p className="mt-1 text-2xl font-semibold">{telegram?.status==="current"?`${telegram.netStars!.toLocaleString()} Stars`:"Unavailable"}</p>
     {telegram?.status==="current"?<><p className="mt-2 text-sm">Configured payout estimate: USD {telegram.usdPayoutEstimate!.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</p><p className="mt-1 text-xs text-muted">USD {telegram.usdPerStar} per Star · {telegram.sales} incoming payments</p><p className="mt-2 text-xs text-muted">Read {when(telegram.asOf!)}{telegram.stale?" · Refresh pending":""}</p></>:<p className="mt-2 text-xs text-muted">Telegram’s revenue source is unavailable.</p>}
     <Link href="/dashboard?workspace=telegram" className="mt-4 inline-block text-sm font-semibold text-accent">Review Telegram revenue →</Link>
    </Card>
    <Card className="min-w-0 p-5" data-combined-onlyfans aria-disabled={native?.accountCount === 0 || undefined}><h2 className="font-semibold">OnlyFans</h2><div className="mt-4 flex items-center gap-1 text-xs text-muted">Recorded gross earnings<Info text="Recorded cleared and pending payments in the selected period. Refunds, chargebacks and pending reversals are excluded. Pending payments are earnings that are not yet available to withdraw. Gross is before platform fees."/></div><p className="mt-1 text-2xl font-semibold">{recorded?money(recorded.grossCents):native?.status==="current"?money(native.clearedGrossCents):provider?wholeDollars(provider.grossCents):"Unavailable"}</p>
     {provider?<><p className="mt-2 text-sm">Net: {wholeDollars(provider.netCents)}</p><p className="mt-1 text-xs text-muted">OnlyFans-reported, as of {when(provider.fetchedAt)}{provider.accounts<provider.wanted?` · ${provider.accounts} of ${provider.wanted} accounts`:""}</p></>:null}
     {recorded?<><p className="mt-2 text-sm">Recorded net: {money(recorded.netCents)}</p><p className="mt-1 text-sm">Pending: {money(recorded.pendingGrossCents)} gross · {money(recorded.pendingNetCents)} net</p><p className="mt-1 text-xs text-muted">{recorded.paymentCount} recorded payments · Includes pending earnings</p>{native?.status!=="current"?<p className="mt-2 text-xs text-muted" role="status">Sync delayed. Showing recorded payments; newer activity may be missing. Last successful sync {when(recorded.lastSuccessfulSyncAt)}.</p>:null}</>:null}
     {native?.status==="current"?<><p className="mt-2 text-sm">Cleared net: {money(native.clearedNetCents)}</p><p className="mt-1 text-xs text-muted">{native.clearedCount} cleared · {native.pendingCount} pending/reversal pending · {native.refundedCount} refunded or charged back</p></>:<p className="mt-2 text-xs text-muted">{native?native.reasons.map(r=>EARNINGS_REASONS[r]).join(" "):data.onlyfansError}</p>}
     {native?<p className="mt-2 text-xs text-muted">{native.coveredAccountCount}/{native.accountCount} accounts have current coverage{native.recentLedgerAt?` · Recent history checked ${when(native.recentLedgerAt)}`:""}{native.fullLedgerAt?` · Full bounded history checked ${when(native.fullLedgerAt)}`:""}</p>:null}
     <Link href="/onlyfans/sales" className="mt-4 inline-block text-sm font-semibold text-accent">Review recorded OnlyFans sales →</Link>
    </Card>
   </div><p className="text-xs text-muted">Channel rows keep their original units and accounting basis. The Telegram USD amount uses Twin’s configured payout conversion; OnlyFans recorded earnings include cleared and pending payments. Net is shown only when recorded for every included payment. Pending payments are not available to withdraw.</p>
  </>:null}
 </div>;
}
