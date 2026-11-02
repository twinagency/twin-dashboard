import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {chromium} from 'playwright';
import Card from './RecentHistoryStatus';
import {parseRecentHistory} from './recent-history';
const ready:any={schemaVersion:'of-recent-history.v1',startedAt:'2026-11-02T03:00:00Z',cutoffAt:'2026-10-03T03:00:00Z',initialHistory:{state:'recent_history_ready',discoveryComplete:true,conversationsDiscovered:2,conversationsReady:2,conversationsAwaitingWork:0,messagesSavedInWindow:12,fansWithStoredWindowMessages:2,providerErrors:{},discoveryError:null,providerRequests:8,failedReadAttempts:0,unfinishedReadAttempts:0,providerOrdering:'id_desc_exhaustive_date_filter',elapsedSeconds:42},memoryProcessing:{state:'ready',incomingMessagesInWindow:7,messagesProcessed:7,messagesAwaitingProcessing:0,errors:0,budgetHold:null},olderHistory:{activatedFanJobs:1,completedFanJobs:0,pendingFanJobs:1},lifetimeHistory:{complete:false,conversationsComplete:0},memoryModelAccounting:{providerReportedUsd:'0.004',tokenEstimateUsd:'0',activeReservationUsd:'0.01',unresolvedReservationUsd:'0.02'},percentComplete:null,lifetimeTotalMessages:null};
async function main(){
 const browser=await chromium.launch({headless:true});const results=[];
 try{for(const width of [375,1280])for(const held of [false,true]){
  const v=structuredClone(ready);if(held){v.initialHistory.state='incomplete';v.initialHistory.conversationsReady=1;v.initialHistory.conversationsAwaitingWork=1;v.initialHistory.providerErrors={provider_read_failed:1};v.memoryProcessing.state='incomplete';v.memoryProcessing.budgetHold='profile-budget-exhausted';}
  const parsed=parseRecentHistory(v);if(!parsed)throw Error('fixture refused');
  const html=renderToStaticMarkup(<Card value={parsed}/>);
  if(html.includes('Lifetime history: Complete'))throw Error('false lifetime completion');
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.setContent('<html><head><style>body{font-family:Arial,sans-serif;margin:24px;color:#555}.text-xs{font-size:12px}.font-semibold{font-weight:600}.space-y-1>*+*{margin-top:4px}section{max-width:650px}p{line-height:1.5}</style></head><body>'+html+'</body></html>');
  const text=await page.locator('body').innerText();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
  if(overflow)throw Error('horizontal overflow '+width);
  for(const label of ['Lifetime history: Incomplete','Active reservations:','Unresolved reservations:','Older history:'])if(!text.includes(label))throw Error('missing '+label);
  if(held && !text.includes('profile-budget-exhausted'))throw Error('missing budget hold');
  await page.screenshot({path:`ui-${width}-${held?'held':'ready'}.png`,fullPage:true});
  results.push({width,state:held?'held':'recent_ready_lifetime_incomplete',horizontalOverflow:false,labelsVerified:true});await page.close();
 }}finally{await browser.close()}
 console.log(JSON.stringify({checks:results,scope:'Actual RecentHistoryStatus React component in Chromium with standalone layout CSS, not a full deployed Next.js build.'}));
}
main().catch(e=>{console.error(e);process.exitCode=1});
