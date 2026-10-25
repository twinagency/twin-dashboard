// Exercise the real server composition and client adapter with isolated I/O.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.cwd();
const out = mkdtempSync(resolve(root, '.scope-check-'));
globalThis.scopeCheck = { writes: [], routes: [], fail: false, earnings: false, admin: true };
const stubs = {
  'next/navigation': 'export const useRouter=()=>({push:path=>globalThis.scopeCheck.routes.push(path)});export function redirect(path){throw Error("redirect:"+path)}',
  '@/app/actions/clone-scope': 'export async function setCloneScope(id){if(globalThis.scopeCheck.fail)throw Error("Denied");globalThis.scopeCheck.writes.push(id)}',
  '@/lib/clone-scope': 'export function getCloneScope(){if(globalThis.scopeCheck.earnings)return "creator-b";throw Error("Combined page must ignore the remembered creator")}',
  '@/lib/dashboard-access': 'export async function getDashboardAccess(){return globalThis.scopeCheck.access ?? null}',
  '@/lib/internal-admin': 'export async function hasInternalAdminAccess(){return globalThis.scopeCheck.admin}',
  '@/lib/agency-brand': 'export const isMoxy=name=>name==="Moxy";export const usesAgencyOverview=isMoxy;',
  '@/lib/agency-overview': 'export const getAgencyOverview=async()=>[];',
  '@/lib/channel-workspace/roster': 'export async function loadChannelRoster(channel){if(channel!=="all")throw Error("Wrong channel");return {marker:"canonical-roster"}}',
  '@/lib/query-cache': 'export async function getFleetClones(){return [{id:"creator-a",name:"Creator A"},{id:"creator-b",name:"Creator B"}]}',
};
try {
  await build({
    stdin: { contents: 'export {default as RevenuePage} from "./app/revenue/page";export {default as AllChannelsDashboard} from "./components/AllChannelsDashboard";export {default as LiveDashboardOverview} from "./components/dashboard/LiveDashboardOverview";', resolveDir: root, loader:'tsx' },
    outfile: resolve(out,'test.mjs'), bundle:true, platform:'node', format:'esm', packages:'external', jsx:'automatic',
    plugins:[{name:'isolate-io',setup(b){
      b.onResolve({filter:/.*/},args=>{
        if(args.path.startsWith('react')) return {path:args.path,external:true};
        if(args.path.endsWith('app/revenue/page') || args.path.endsWith('AllChannelsDashboard') || args.path.endsWith('dashboard/LiveDashboardOverview')) return {path:resolve(args.resolveDir,args.path) + '.tsx'};
        return {path:args.path,namespace:'stub'};
      });
      b.onLoad({filter:/.*/,namespace:'stub'},({path})=>({loader:'js',contents:stubs[path] ?? (path.endsWith('LiveOverview') ? 'export const LiveOverviewHero=()=>null,LiveOverviewActivity=()=>null,LiveOverviewRankings=()=>null;' : path.endsWith('.css') ? 'export default {};' : 'export default function Stub(){return null}')}));
    }}],
  });
  const {AllChannelsDashboard,LiveDashboardOverview,RevenuePage}=await import(pathToFileURL(resolve(out,'test.mjs')).href);
  const page=await AllChannelsDashboard();
  const overview=[page.props.children].flat().find(child=>child?.props?.combined === true);
  assert.equal(overview.props.cloneId,null,'Combined report must not inherit a creator cookie');
  assert.equal(overview.props.combined,true);
  globalThis.scopeCheck.earnings=true;
  const earnings=await RevenuePage({});
  assert.equal(earnings.props['data-detailed-earnings'],true,'Earnings is a distinct detailed report');
  assert.equal(earnings.props.children[1].props.embedded,true,'Combined channel earnings remain reachable in Earnings');
  assert.equal(earnings.props.children[3].props.cloneId,'creator-b','Detailed reporting follows the selected creator');
  globalThis.scopeCheck.admin=false;
  await assert.rejects(RevenuePage({}),/redirect:\/twin/,'Detailed earnings keeps the internal operator guard');
  globalThis.scopeCheck.admin=true;
  globalThis.scopeCheck.earnings=false;
  const report=LiveDashboardOverview(overview.props);
  assert.equal(report.props.cloneId,null,'API reader receives fleet scope');
  assert.equal(report.props.sharedOverview.combinedRevenue,true,'All channels includes OnlyFans net earnings');
  await report.props.sharedOverview.onSelectCreator('creator-b');
  assert.deepEqual(globalThis.scopeCheck.writes,['creator-b']);
  assert.deepEqual(globalThis.scopeCheck.routes,['/dashboard?workspace=telegram']);
  globalThis.scopeCheck.fail=true;
  await assert.rejects(report.props.sharedOverview.onSelectCreator('creator-a'),/Denied/);
  assert.equal(globalThis.scopeCheck.routes.length,1,'Failed scope write must not navigate');
  globalThis.scopeCheck.fail=false;
  const selected=LiveDashboardOverview({cloneId:'creator-b',clones:overview.props.clones});
  assert.equal(selected.props.cloneId,'creator-b');
  assert.equal(selected.props.sharedOverview.combinedRevenue,false,'Telegram keeps its own revenue total');
  await selected.props.sharedOverview.onSelectCreator(null);
  assert.equal(globalThis.scopeCheck.writes.at(-1),null,'Return to all clears creator scope');
  assert.equal(globalThis.scopeCheck.routes.length,1,'Scoped workspace retains its route');
  globalThis.scopeCheck.access={name:'Moxy'};
  globalThis.scopeCheck.earnings=true;
  const moxy=await RevenuePage({});
  assert.equal(moxy.props.cloneId,null,'Moxy overall report ignores the remembered Telegram creator');
  assert.equal(moxy.props.combinedRevenue,true);
  const moxyTelegram=await RevenuePage({searchParams:Promise.resolve({workspace:'telegram'})});
  assert.equal(moxyTelegram.props.cloneId,'creator-b');
  assert.equal(moxyTelegram.props.combinedRevenue,false);
  console.log('Combined scope, OnlyFans revenue inclusion, profile navigation, denied selection, Moxy/Telegram scope and distinct guarded earnings passed');
} finally {
  rmSync(out,{recursive:true,force:true});
  delete globalThis.scopeCheck;
}
