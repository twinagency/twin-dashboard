const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks) {
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${js}\n})`, { Buffer, Response, Date, Map, Set, URL })(name => { if (!(name in mocks)) throw new Error(`Unexpected dependency ${name}`); return mocks[name]; }, module, module.exports);
  return module.exports;
}
const config = load('lib/flirt-overview-photos.ts', {});
const ids = Object.keys(config.flirtOverviewPhotos);
const emptyId = 'e0464c19-d5b7-4154-ba46-a60a2ed2a8a3';
let allowed = new Set([...ids, emptyId]);
const requireCloneAccess = async id => { if (!allowed.has(id)) throw new Error('Denied'); };
const clones = [...ids,emptyId].map(id => ({id,name:id,intake:{}}));
const photos = ids.flatMap(clone_id => { const c=config.flirtOverviewPhotos[clone_id]; return [c.hero,c.avatar,...c.library].filter(Boolean).map(p => ({id:p.id,clone_id,storage_path:`${clone_id}/photos/${p.id}.jpg`,star_value:120})); });
let downloads = 0;
const supabaseAdmin = { from(table) { let rows=table==='clones'?clones:photos; const query={select(){return query;},eq(key,value){rows=rows.filter(r=>r[key]===value);return query;},in(key,values){rows=rows.filter(r=>values.includes(r[key]));return query;},maybeSingle:async()=>({data:rows[0]||null,error:null}),then(resolve,reject){return Promise.resolve({data:rows,error:null}).then(resolve,reject);}};return query; }, storage:{from(){return {download:async()=>{downloads++;return {data:new Blob(['private source']),error:null};},createSignedUrl:async()=>({data:null})};}} };
const model=load('lib/creator-overview.ts',{'./supabase':{supabaseAdmin},'./dashboard-access':{requireCloneAccess},'./colors':{profileImagePathForClone:()=>null},'./flirt-overview-photos':config});
const crops=[];
const sharp=()=>({rotate(){return this;},extract(crop){crops.push(crop);return this;},resize(){return this;},webp(){return this;},async toBuffer(){return Buffer.from('reviewed crop');}});
const route=load('app/api/creator-overview/photo/route.ts',{'sharp':sharp,'@/lib/dashboard-reader':{dashboardReader:handler=>async req=>{try{return await handler(req)}catch{return new Response('Denied',{status:403});}}},'@/lib/dashboard-access':{requireCloneAccess},'@/lib/supabase':{supabaseAdmin},'@/lib/flirt-overview-photos':config});
const request=(id,slot)=>route.GET({nextUrl:new URL(`https://example.test/api/creator-overview/photo?clone=${id}&slot=${slot}`)});
(async()=>{
 for(const id of ids){const p=await model.getCreatorOverview(id);assert.equal(p.id,id);assert.ok(p.hero);assert.equal(p.library.length,3);const slots=[p.hero,p.avatar,...p.library].filter(Boolean);assert.equal(new Set(slots.map(x=>x.id)).size,slots.length);for(const slot of slots)assert.ok(photos.some(row=>row.id===slot.id&&row.clone_id===id));}
 const empty=await model.getCreatorOverview(emptyId);assert.equal(empty.hero,null);assert.equal(empty.avatar,null);assert.equal(empty.library.length,0);
 const id=ids[0];let response=await request(id,'hero');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(crops[0],config.flirtOverviewPhotos[id].hero.crop);assert.equal(downloads,1);
 assert.equal((await request(id,'hero')).status,200);assert.equal(downloads,1);
 allowed.delete(id);assert.equal((await request(id,'hero')).status,403);await assert.rejects(()=>model.getCreatorOverview(id));assert.equal(downloads,1);allowed.add(id);
 assert.equal((await request(id,'../../other-photo')).status,404);assert.equal((await request(emptyId,'hero')).status,404);
 const row=photos.find(p=>p.id===config.flirtOverviewPhotos[id].hero.id);const own=row.storage_path;row.storage_path=`${ids[1]}/photos/other.jpg`;assert.equal((await request(id,'hero')).status,404);row.storage_path=own;
 console.log('PASS: all six creator presentations, unique owned photos, empty states, approved crops and access checks before cached responses');
})().catch(e=>{console.error(e);process.exitCode=1});
