import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { gunzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { seedDemo, scopeCreators, scopedSales, payoutRows, parseFanImport, asCsv, summaryForOverview } from '../lib/agency-demo/model';
async function main(){
 const state=seedDemo();
 assert.equal(state.creators.length,3);assert.equal(state.fans.length,6);assert.equal(state.sales.length,72);
 for(const sale of state.sales){assert.equal(state.fans.find(f=>f.id===sale.fanId)?.creatorId,sale.creatorId);assert(state.members.find(m=>m.id===sale.staffId)?.creatorIds.includes(sale.creatorId));}
 for(const fan of state.fans){const detail=state.conversations[fan.conversationId];assert.equal(detail.accountId,fan.accountId);assert.equal(detail.summary.fan.fanId,fan.id);assert.equal(detail.summary.fan.displayName,fan.name);assert(detail.messages.every(m=>m.conversationId===detail.conversationId));}
 const ids=scopeCreators(state,'owner','all').map(c=>c.id);assert.equal(ids.length,3);assert.deepEqual(scopeCreators(state,'viewer','all').map(c=>c.id),state.members.find(m=>m.id==='sam')!.creatorIds);assert.equal(scopeCreators(state,'viewer',state.creators[1].id).length,0);
 const restricted=structuredClone(state);restricted.members.find(m=>m.id==='alex')!.creatorIds=[ids[1]];assert.deepEqual(scopeCreators(restricted,'manager','all').map(c=>c.id),[ids[1]]);restricted.members.find(m=>m.id==='sam')!.active=false;assert.equal(scopeCreators(restricted,'viewer','all').length,0);
 const rows=payoutRows(state,scopedSales(state,ids,90));for(const r of rows)assert.equal(r.creator+r.staff+r.agency,r.net);
 const refundOnly=payoutRows(state,[{id:'refund',creatorId:ids[0],fanId:state.fans[0].id,staffId:'alex',amount:-2500,at:new Date().toISOString(),kind:'Refund'}])[0];assert.equal(refundOnly.net,-2500);assert.equal(refundOnly.creator,-1500);assert(refundOnly.staff<0);assert.equal(refundOnly.creator+refundOnly.staff+refundOnly.agency,-2500);
 const overview=summaryForOverview(state,ids,90);assert.equal(overview.totals.stars,rows.reduce((n,r)=>n+r.net,0));assert.equal(overview.series.reduce((n,r)=>n+ids.reduce((s,id)=>s+Number(r[id]||0),0),0),overview.totals.stars);assert.equal(overview.rankings!.fans.length,6);assert(overview.rankings!.content.length>0);
 const none=summaryForOverview(state,[ids[0]],90,{start:'2000-01-01',end:'2000-01-03'});assert.equal(none.totals.stars,0);assert.equal(none.series.length,3);assert.equal(none.rankings!.fans.length,0);
 assert.deepEqual(parseFanImport('name,creator,tags\n"Avery, Jr",'+state.creators[0].name+',VIP|Weekend updates',state)[0],{name:'Avery, Jr',creatorId:ids[0],tags:['VIP','Weekend updates']});
 assert.throws(()=>parseFanImport('name,creator,tags\nDaniel,'+state.creators[0].name+',VIP',state),/Duplicate/);assert.throws(()=>parseFanImport('name,creator,tags\nNew,Missing,VIP',state),/creator/);assert.throws(()=>parseFanImport('name,creator,tags\n"unclosed',state),/quoted/);
 assert.equal(asCsv([['=1+2','a"b','normal']]),'"\'=1+2","a""b","normal"');
 const auth={admin:false,token:'',identity:null as null|{id:string},fail:false,calls:0};
 const bundled=await build({entryPoints:['lib/agency-demo/access.ts'],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'auth-fixtures',setup(b){b.onResolve({filter:/.*/},args=>['next/headers','@/lib/internal-admin','@/lib/agency-identity','@/lib/agency-policy'].includes(args.path)?{path:args.path,namespace:'auth-fixtures'}:undefined);b.onLoad({filter:/.*/,namespace:'auth-fixtures'},args=>({contents:args.path==='next/headers'?`export async function cookies(){return {get:()=>({value:globalThis.auth.token})}}`:args.path.endsWith('internal-admin')?`export async function hasInternalAdminAccess(){return globalThis.auth.admin}`:args.path.endsWith('agency-policy')?`export const AGENCY_COOKIE='agency'`:`export async function agencyIdentity(token){globalThis.auth.calls++;if(globalThis.auth.fail)throw Error('offline');return globalThis.auth.identity}` }));}}]});
 const context={auth,module:{exports:{}}};vm.runInNewContext(bundled.outputFiles[0].text,context);const open=(context.module.exports as {canOpenAgencyDemo:()=>Promise<boolean>}).canOpenAgencyDemo;
 assert.equal(await open(),false);assert.equal(auth.calls,0);auth.admin=true;assert.equal(await open(),true);auth.admin=false;auth.token='synthetic';assert.equal(await open(),false);auth.identity={id:'verified'};assert.equal(await open(),true);auth.fail=true;assert.equal(await open(),false);
 const html=fs.readFileSync('test-results/crm-demo/index.html','utf8'),compiled=JSON.parse(fs.readFileSync('lib/agency-demo/compiled.json','utf8'));
 assert.equal(gunzipSync(Buffer.from(compiled.html,'base64')).toString(),html);assert(html.includes("connect-src 'none'"));assert(html.includes("form-action 'none'"));assert(!/<script[^>]+src=/.test(html));assert(!/<link[^>]+href=/.test(html));
 console.log('CRM demo: seed relations, scoped roles, refunds and splits, overview totals, CSV parsing/export, independent access checks and offline bundle passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
