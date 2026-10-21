const assert=require('node:assert/strict'),{build}=require('esbuild'),{mkdtempSync,rmSync}=require('node:fs'),{join}=require('node:path'),{NextRequest,NextResponse}=require('next/server');
const C='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',S='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',X='cccccccc-cccc-4ccc-8ccc-cccccccccccc',J='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
async function main(){
 const dir=mkdtempSync(join(process.cwd(),'shared-media-check-')),originalFetch=globalThis.fetch,originalUrl=process.env.SUPABASE_URL;
 process.env.SUPABASE_URL='https://storage.example.invalid';
 const f=globalThis.__sharedMediaTest={denied:false,readOnly:false,wrongBinding:false,actor:'agency-user:fixture',rows:[],jobs:[],created:0,chunks:0,finished:0,queries:0,sourceReads:0,loseCreate:true,loseChunk:true,corrupt:false,privateGrant:true};
 const bytes=Buffer.alloc(8*1024*1024+7,13);
 f.auth=async options=>f.denied||options.write&&f.readOnly?new NextResponse('Forbidden',{status:403}):{actor:f.actor,auth:f.privateGrant?{agencyGrant:{creatorIds:[C]}}:{},fetch:globalThis.fetch,backend:{async listAccounts(){return{ok:true,data:[{accountId:'of-fixture',binding:{creatorId:f.wrongBinding?X:C},health:'connected',capabilities:{manageContent:'available'}}]}}}};
 f.db={storage:{from(){return{async createSignedUrl(path){return{data:{signedUrl:'https://storage.example.invalid/storage/v1/object/sign/media/'+path},error:null}}}}},from(table){
  f.queries++;const filters=[],q={};let patch,insert;
  const result=()=>{let rows=table==='photos'?[{id:S,clone_id:C,storage_path:C+'/photos/saved.jpg'}]:table==='shared_media_transfers'?f.rows:[];
   if(insert){if(f.rows.some(row=>row.source_id===insert.source_id&&row.account_id===insert.account_id))return{error:{code:'23505'},data:null};const row={...insert,job_id:null,media_id:null,status:'prepared',processing:false,received_bytes:0,error_code:null};f.rows.push(row);return{data:[row],error:null};}
   rows=rows.filter(row=>filters.every(([k,v])=>row[k]===v));if(patch)rows.forEach(row=>Object.assign(row,patch));return{data:rows.map(row=>({...row})),error:null};};
  Object.assign(q,{select(){return q},eq(k,v){filters.push([k,v]);return q},order(){return q},limit(){return q},insert(v){insert=v;return q},update(v){patch=v;return q},async maybeSingle(){const r=result();return{...r,data:r.data?.[0]??null}},then(a,b){return Promise.resolve(result()).then(a,b)}});return q;
 }};
 f.backend={async uploads(){return{ok:true,data:{enabled:true,jobs:structuredClone(f.jobs)}}},async create(account,body){
  if(!f.jobs.length){f.created++;f.jobs.push({jobId:J,kind:'upload',status:'receiving',files:body.files.map(file=>({...file,receivedBytes:0,prefixDigest:null,status:'receiving',mediaId:null,processing:false,error:null})),lastError:null,cleanupRequired:false,requestedAt:new Date().toISOString(),updatedAt:new Date().toISOString()});f.createKey=body.commandKey;}
  else assert.equal(body.commandKey,f.createKey,'Retry retains the command identity');
  if(f.loseCreate){f.loseCreate=false;return{ok:false,status:502}}return{ok:true,upload:structuredClone(f.jobs[0])};
 },async chunk(account,job,file,offset,digest,chunk){f.chunks++;const entry=f.jobs[0].files[0];assert.equal(file,entry.fileId);assert.equal(digest,require('node:crypto').createHash('sha256').update(chunk).digest('hex'));entry.receivedBytes=Math.max(entry.receivedBytes,offset+chunk.length);entry.prefixDigest=require('node:crypto').createHash('sha256').update(f.rows[0].chunk_sha256.slice(0,Math.ceil(entry.receivedBytes/(8*1024*1024))).join('')).digest('hex');if(f.loseChunk){f.loseChunk=false;return{ok:false,status:502}}return{ok:true,receivedBytes:entry.receivedBytes}},async action(account,job,action,identity){assert.equal(action,'finish');assert.equal(f.jobs[0].files[0].receivedBytes,bytes.length);f.finished++;f.jobs[0].status='complete';Object.assign(f.jobs[0].files[0],{status:'done',mediaId:'12345'});return{ok:true,upload:structuredClone(f.jobs[0])}}};
 globalThis.fetch=async(url,init)=>{f.sourceReads++;assert.match(String(url),/^https:\/\/storage\.example\.invalid\/storage\/v1\//);assert.equal(init.redirect,'error');const range=init.headers?.Range;if(!range)return new Response(bytes,{headers:{'content-length':String(bytes.length),'content-type':'image/jpeg'}});const[,start,end]=range.match(/bytes=(\d+)-(\d+)/).map(Number);const data=Buffer.from(bytes.subarray(start,end+1));if(f.corrupt)data[0]^=1;return new Response(data,{status:206,headers:{'content-length':String(data.length),'content-range':`bytes ${start}-${end}/${bytes.length}`}})};
 const stubs={
  '@/lib/onlyfans/route':'export const PRIVATE_HEADERS={"Cache-Control":"private, no-store"};export const requestId=v=>/^[A-Za-z0-9._:-]{1,64}$/.test(v)?v:null;export async function requireOnlyFansRead(o){return globalThis.__sharedMediaTest.auth(o)}',
  '@/lib/supabase-service':'export const serviceClient=()=>globalThis.__sharedMediaTest.db',
  '@/lib/onlyfans/vault-media-backend':'export const configuredVaultMediaBackend=()=>globalThis.__sharedMediaTest.backend',
  '@/lib/onlyfans/vault-backend':'export const configuredVaultBackend=()=>({async get(){return{ok:true,data:{connectionRevision:4}}}})',
 };
 try{
  await build({stdin:{contents:"export * from './app/api/onlyfans-content/accounts/[accountId]/shared-media/route';export * from './lib/shared-media';",resolveDir:process.cwd(),loader:'ts'},outfile:join(dir,'test.cjs'),bundle:true,platform:'node',format:'cjs',alias:{'@':process.cwd()},external:['next/server'],plugins:[{name:'isolated',setup(b){b.onResolve({filter:/.*/},a=>stubs[a.path]?{path:a.path,namespace:'stub'}:undefined);b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'ts'}))}}]});
  const m=require(join(dir,'test.cjs')),context={params:Promise.resolve({accountId:'of-fixture'})};
  const req=(method='POST',body={kind:'photo',sourceId:S},origin='https://dashboard.tgaiclone.xyz')=>new NextRequest(`https://dashboard.tgaiclone.xyz/api/onlyfans-content/accounts/of-fixture/shared-media?creator=${C}`,{method,headers:{origin,'sec-fetch-site':'same-origin','content-type':'application/json'},...(method==='POST'?{body:JSON.stringify(body)}:{})});
  const send=(body,origin)=>m.POST(req('POST',body,origin),context);
  f.denied=true;assert.equal((await send()).status,403);assert.equal(f.queries,0);f.denied=false;
  f.readOnly=true;assert.equal((await send()).status,403);assert.equal(f.created,0);f.readOnly=false;
  f.wrongBinding=true;assert.equal((await send()).status,403);assert.equal(f.queries,0);f.wrongBinding=false;
  assert.equal((await send(undefined,'https://attacker.invalid')).status,403);
  assert.equal((await send({kind:'photo',sourceId:X})).status,404);assert.equal(f.sourceReads,0);
  assert.equal((await send({kind:'photo',sourceId:S,url:'https://attacker.invalid'})).status,400);
  assert.equal((await send()).status,502,'Lost create reply remains unconfirmed');assert.equal(f.rows.length,1);assert.equal(f.created,1);
  assert.equal((await send()).status,502,'Lost chunk reply remains resumable');assert.equal(f.created,1);assert.equal(f.jobs[0].files[0].receivedBytes,8*1024*1024);
  const firstReceipt=f.rows[0].id;f.corrupt=true;assert.equal((await send()).status,503);assert.equal(f.chunks,1,'Changed source bytes are never forwarded');f.corrupt=false;
  let response=await send();assert.equal(response.status,200);assert.equal((await response.json()).transfer.receivedBytes,bytes.length);
  response=await send();const complete=await response.json();assert.equal(complete.transfer.status,'complete');assert.equal(complete.transfer.mediaId,'12345');assert.equal(f.finished,1);
  await send();assert.equal(f.created,1);assert.equal(f.finished,1);assert.equal(f.rows[0].id,firstReceipt,'Repeated user clicks never create a duplicate upload');
  const before=[f.created,f.chunks,f.finished];const read=await m.GET(req('GET'),context);assert.equal(read.headers.get('cache-control'),'private, no-store');const publicData=await read.text();for(const secret of ['storage_path','source_sha256','chunk_sha256','op-session','agency-user'])assert(!publicData.includes(secret));assert.deepEqual([f.created,f.chunks,f.finished],before,'GET does not advance provider uploads');
  f.actor='agency-user:other';assert.equal((await send()).status,409,'Another staff actor cannot borrow this upload identity');
  assert.equal(m.sharedFileName(S,'video','video/quicktime'),S+'.mov');
  assert.equal(m.sharedFileName(S,'photo','image/png'),S+'.png');
  assert.throws(()=>m.sharedFileName(S,'photo','text/html'));
  const broken=structuredClone(f.jobs[0]);broken.files[0].mediaId=null;assert.equal(m.sharedUploadProgress(f.rows[0],broken).status,'failed');
  broken.files[0].prefixDigest='0'.repeat(64);assert.throws(()=>m.sharedUploadProgress(f.rows[0],broken),/upload_prefix_mismatch/);
  assert(!m.sharedStoragePath(C+'/../foreign',C));assert(!m.sharedStoragePath(X+'/photo.jpg',C));
  await assert.rejects(()=>m.boundedMediaBytes(new Response('too large'),2));
  console.log('PASS shared media: verified creator/account binding, owner-scoped source, CSRF, readonly denial, persisted receipt, lost replies, chunk integrity, resume, duplicate prevention and side-effect-free private reads. No live provider calls.');
 }finally{globalThis.fetch=originalFetch;if(originalUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=originalUrl;delete globalThis.__sharedMediaTest;rmSync(dir,{recursive:true,force:true})}
}
main().catch(error=>{console.error(error);process.exitCode=1});
