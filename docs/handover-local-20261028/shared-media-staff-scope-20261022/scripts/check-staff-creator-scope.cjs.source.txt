const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { mkdtempSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { NextRequest } = require('next/server');
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', U='cccccccc-cccc-4ccc-8ccc-cccccccccccc', R='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
async function main(){
 const dir=mkdtempSync(join(process.cwd(),'staff-scope-check-'));
 const f=globalThis.__staffScope={allowed:true,queries:0,assigned:[A,B],member:{agency_id:A,user_id:U,active:true,can_manage:true,creator_scope:'all',creator_ids:[],creator_access_revision:R}};
 f.db={auth:{async getUser(){return{data:{user:{id:U,user_metadata:{creator_scope:'all'}}},error:null}}},from(table){
  f.queries++;const filters=[],q={};let patch;
  const result=()=>{let rows=table==='agency_memberships'?[f.member]:table==='partner_agencies'?[{id:A,name:'Moxy',active:true}]:table==='agency_creators'?f.assigned.map(clone_id=>({agency_id:A,clone_id})):[];
   rows=rows.filter(row=>filters.every(([k,v])=>row[k]===v));if(patch)rows.forEach(row=>Object.assign(row,patch));return{data:rows,error:null};};
  Object.assign(q,{select(){return q},eq(k,v){filters.push([k,v]);return q},update(p){patch=p;return q},async maybeSingle(){const r=result();return{...r,data:r.data[0]??null}},then(a,b){return Promise.resolve(result()).then(a,b)}});return q;
 }};
 const stubs={'@/lib/internal-admin':'export async function hasInternalAdminAccess(){return globalThis.__staffScope.allowed}', '@/lib/supabase-service':'export function serviceClient(){return globalThis.__staffScope.db}', './supabase-service':'export function serviceClient(){return globalThis.__staffScope.db}'};
 try{
  await build({stdin:{contents:"export * from './lib/staff-creator-scope';export * from './lib/agency-identity';export { POST } from './app/agency-admin/creator-access/route';",resolveDir:process.cwd(),loader:'ts'},outfile:join(dir,'test.cjs'),bundle:true,platform:'node',format:'cjs',alias:{'@':process.cwd()},external:['next/server'],plugins:[{name:'isolated',setup(b){b.onResolve({filter:/.*/},a=>stubs[a.path]?{path:a.path,namespace:'stub'}:undefined);b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'ts'}))}}]});
  const m=require(join(dir,'test.cjs'));
  assert.deepEqual((await m.agencyIdentity('synthetic')).cloneIds,[A,B]);
  f.member.creator_scope='selected';f.member.creator_ids=[A];assert.deepEqual((await m.agencyIdentity('synthetic')).cloneIds,[A]);
  assert.equal((await m.agencyIdentity('synthetic')).creatorScope,'selected');
  f.member.creator_ids=[];assert.deepEqual((await m.agencyIdentity('synthetic')).cloneIds,[],'No selection grants no creators');
  f.member.creator_ids=[A];f.assigned=[B];assert.deepEqual((await m.agencyIdentity('synthetic')).cloneIds,[],'Removed agency assignment cannot survive in a staff grant');
  f.assigned=[A,B];f.member.creator_scope='invalid';assert.equal(await m.agencyIdentity('synthetic'),null);
  f.member.creator_scope='all';f.member.creator_ids=[];f.member.active=false;assert.equal(await m.agencyIdentity('synthetic'),null);f.member.active=true;
  const form=values=>{const fd=new FormData();for(const[k,v]of Object.entries(values))for(const x of Array.isArray(v)?v:[v])fd.append(k,x);return fd};
  const command={agency:A,user_id:U,expected_revision:R,creator_scope:'selected',creator_ids:[A]};
  const send=(value=command,origin='https://dashboard.tgaiclone.xyz')=>m.POST(new NextRequest('https://dashboard.tgaiclone.xyz/agency-admin/creator-access',{method:'POST',headers:{origin,'sec-fetch-site':'same-origin'},body:form(value)}));
  f.allowed=false;const before=f.queries;assert.equal((await send()).status,401);assert.equal(f.queries,before);f.allowed=true;
  assert.equal((await send(command,'https://attacker.invalid')).status,403);
  assert.equal(m.parseStaffCreatorCommand(form({...command,actor:'forged'})),null);
  assert.equal(m.parseStaffCreatorCommand(form({...command,creator_ids:['invalid']})),null);
  assert.equal(m.parseStaffCreatorCommand(form({...command,agency:[A,B]})),null);
  assert.match((await send({...command,creator_ids:[U]})).headers.get('location'),/result=conflict/);
  assert.match((await send({...command,user_id:B})).headers.get('location'),/result=conflict/);
  assert.match((await send()).headers.get('location'),/result=updated/);
  assert.deepEqual(f.member.creator_ids,[A]);assert.notEqual(f.member.creator_access_revision,R);
  assert.match((await send({...command,creator_scope:'all'})).headers.get('location'),/result=conflict/,'Stale form cannot widen access');
  assert.deepEqual((await m.agencyIdentity('synthetic')).cloneIds,[A]);
  console.log('PASS staff creator scope: real identity intersection, no-selection denial, revocation, invalid grants, CSRF, owner-only changes, creator ownership and stale update protection.');
 }finally{delete globalThis.__staffScope;rmSync(dir,{recursive:true,force:true})}
}
main().catch(error=>{console.error(error);process.exitCode=1});
