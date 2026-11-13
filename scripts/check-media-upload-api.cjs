// Behavioural regression: a resolved {ok:false} must not become API success.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync('app/api/admin/v1/media/route.ts', 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const calls = [];
let upload = async () => ({ok:true});
const module_ = {exports:{}};
vm.runInNewContext(code, {exports:module_.exports, module:module_, FormData, File, Error, String,
  require(name) {
    if (name === 'next/server') return {NextResponse:{json:(body,init)=>({...body,status:init&&init.status})}};
    if (name.endsWith('/api-route')) return {withAdmin:fn=>fn,ok:x=>x,jsonError:(error,status)=>({error,status}),logAdminWrite:()=>{}};
    if (name.endsWith('/api-read')) return {resolveClone:async()=>({id:'test-clone'})};
    if (name.endsWith('/actions')) return {uploadPhoto:async(...args)=>{calls.push(args);return upload(...args)},uploadVideo:async(...args)=>{calls.push(args);return upload(...args)}};
    throw new Error(name);
  }
});
async function request(type='photo') {
  const fd=new FormData();fd.set('clone','test-clone');fd.set('type',type);fd.set('star_value','350');
  for(const name of ['good.jpg','bad.jpg']) fd.append('file',new File(['image'],name,{type:'image/jpeg'}));
  return module_.exports.POST({formData:async()=>fd});
}
(async()=>{
  for(const type of ['photo','video']) {
    upload=async(_,fd)=>fd.get('file').name==='bad.jpg'?{ok:false,error:'save unconfirmed'}:{ok:true};
    const r=await request(type);assert.deepEqual(Array.from(r.uploaded),['good.jpg']);assert.equal(r.failed[0].file,'bad.jpg');assert.match(r.note,/Could not confirm saving/);assert.doesNotMatch(r.note,/were NOT stored/);
    upload=async()=>{throw new Error('storage unavailable')};
    const failed=await request(type);assert.equal(failed.uploaded.length,0);assert.equal(failed.failed.length,2);assert.equal(failed.ok,false);assert.equal(failed.status,422);
  }
  upload=async()=>({ok:true});const saved=await request();assert.equal(saved.uploaded.length,2);assert.match(saved.note,/analysis status/);assert.doesNotMatch(saved.note,/captioned/);
  console.log('Upload API success/failure propagation: 5 scenarios passed');
})().catch(e=>{console.error(e);process.exitCode=1});
