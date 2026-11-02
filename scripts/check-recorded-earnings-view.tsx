import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createRequire} from 'node:module';
import {AppRouterContext, type AppRouterInstance} from 'next/dist/shared/lib/app-router-context.shared-runtime';
async function main(){
 (globalThis as unknown as {React:typeof React}).React=React;
 const require=createRequire(import.meta.url);require.extensions['.css']=module=>{module.exports={};};
 const {default:OverviewView}=await import('../components/onlyfans-preview/OverviewView');
 const {computeFigures}=await import('../lib/onlyfans/overview');
 // EarningsAutoRefresh reads the real Next router during render. Effects do
 // not run in static markup; provide its application context, retaining the
 // complete earnings component and every financial assertion below.
 const router:AppRouterInstance={back(){},forward(){},refresh(){},push(){},replace(){},prefetch(){}};
 const render=(view:React.ReactNode)=>renderToStaticMarkup(<AppRouterContext.Provider value={router}>{view}</AppRouterContext.Provider>);
 const stamp='2026-10-23T00:00:00.000Z';
 const earnings={schemaVersion:'of-earnings.v1' as const,window:{start:'2026-10-16T00:00:00.000Z',end:stamp},asOf:stamp,accountCount:1,coveredAccountCount:0,status:'unavailable' as const,reasons:['ledger_held' as const],currency:'USD' as const,clearedGrossCents:null,clearedNetCents:null,clearedCount:null,pendingCount:null,refundedCount:null,recentLedgerAt:stamp,fullLedgerAt:stamp,recorded:{grossCents:3599,netCents:2879,pendingGrossCents:3599,pendingNetCents:2879,paymentCount:3,lastSuccessfulSyncAt:stamp}};
 const selection={kind:'all' as const,accountCount:0};
 type ViewData=Parameters<typeof OverviewView>[0]['data'];
 const withFigures=(d:Omit<ViewData,'selection'|'figures'>):ViewData=>({...d,selection,figures:computeFigures(d.earnings,null,selection)});
 const data=withFigures({accounts:[],accountsError:null,earnings,earningsError:null,activityAccount:null,sales:null,salesError:null,period:'7d' as const,window:earnings.window});
 const html=render(<OverviewView data={data}/>);
 assert.match(html,/Recorded net earnings/);assert.match(html,/USD 28\.79/);assert.match(html,/USD 35\.99/);assert.match(html,/Sync delayed/);assert.match(html,/Pending earnings are not available to withdraw/);
 const unknown=render(<OverviewView data={withFigures({...data,earnings:{...earnings,recorded:{...earnings.recorded,netCents:null,pendingNetCents:null}}})}/>);
 assert.match(unknown,/Recorded net earnings.*?Unavailable/);assert.doesNotMatch(unknown,/USD 0\.00/);
 console.log('Recorded earnings view: pending payments visible, sync warning explicit, unknown net stays unavailable');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
