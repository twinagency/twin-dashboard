// Isolated account and storage ownership checks; never calls production.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
let access = {id:'top',name:'Top Onlyfans Agency',cloneIds:['live']};
const calls = [], signed = [];
const tables = {
 creator_agency_assignments:[{agency_id:'top',creator_account_id:'pending'},{agency_id:'top',creator_account_id:'linked'},{agency_id:'other',creator_account_id:'outsider'}],
 creator_accounts:[{id:'pending',display_name:'Pending creator',account_status:'applicant'},{id:'linked',display_name:'Linked creator',account_status:'approved'},{id:'outsider',display_name:'Outside creator',account_status:'applicant'}],
 creator_clone_links:[{creator_account_id:'linked',clone_id:'live'}],
 creator_files:[
  {id:'wrong-path',creator_account_id:'pending',storage_path:'creators/outsider/content/leak',bucket:'onboarding-content',kind:'content',storage_transfer_status:'verified',mime_type:'image/jpeg'},
  {id:'unverified',creator_account_id:'pending',storage_path:'creators/pending/content/unverified',bucket:'onboarding-content',kind:'content',storage_transfer_status:'pending',mime_type:'image/jpeg'},
  {id:'right',creator_account_id:'pending',storage_path:'creators/pending/content/photo',bucket:'onboarding-content',kind:'content',storage_transfer_status:'verified',mime_type:'image/jpeg'},
  {id:'outside',creator_account_id:'outsider',storage_path:'creators/outsider/content/photo',bucket:'onboarding-content',kind:'content',storage_transfer_status:'verified',mime_type:'image/jpeg'},
 ],
};
const db = {
 from(table) {
  let rows = [...(tables[table] || [])];
  const filters = [];
  const query = {
   select(){return query;},
   eq(key,value){filters.push([key,value]);rows=rows.filter(row=>row[key]===value);return query;},
   in(key,values){filters.push([key,values]);rows=rows.filter(row=>values.includes(row[key]));return query;},
   order(){return query;},
   then(resolve){calls.push({table,filters});return Promise.resolve({data:rows,error:null}).then(resolve);},
  };
  return query;
 },
 storage:{from(bucket){return {async createSignedUrls(paths){signed.push({bucket,paths});return {data:paths.map(path=>({signedUrl:'https://private.test/'+path}))};}};}},
};
const js = ts.transpileModule(fs.readFileSync('lib/agency-overview.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const result = {exports:{}};
new Function('require','module','exports',js)((name)=>{
 if(name==='./dashboard-access')return {getDashboardAccess:async()=>access,withDashboardAccess:async(_access,fn)=>fn()};
 if(name==='./agency-brand')return {isTopOnlyfansAgency:name=>name==='Top Onlyfans Agency',usesAgencyOverview:name=>['Top Onlyfans Agency','Moxy'].includes(name)};
 if(name==='./supabase-service')return {serviceClient:()=>db};
 if(name==='./supabase')return {supabaseAdmin:db};
 throw Error(name);
},result,result.exports);
(async()=>{
 const creators=await result.exports.getAgencyOnboardingCreators();
 assert.deepEqual(creators.map(c=>c.id),['pending']);
 assert.equal(creators[0].onboarding,true);
 assert.equal(creators[0].photoId,'right');
 assert.equal(creators[0].telegramConnected,false);
 assert.equal(creators[0].fans,0);
 assert.deepEqual(signed,[{bucket:'onboarding-content',paths:['creators/pending/content/photo']}]);
 assert.ok(calls[0].filters.some(([key,value])=>key==='agency_id'&&value==='top'));
 for(const call of calls.slice(1))assert.ok(call.filters.some(([key,value])=>['id','creator_account_id'].includes(key)&&Array.isArray(value)&&!value.includes('outsider')));
 const count=calls.length;
 access={...access,name:'Moxy'};assert.deepEqual(await result.exports.getAgencyOnboardingCreators(),[]);assert.equal(calls.length,count);
 access=null;assert.deepEqual(await result.exports.getAgencyOnboardingCreators(),[]);assert.equal(calls.length,count);
 console.log('Agency overview accounts: assigned tenant only, verified private photo ownership, live deduplication, pending status, and Moxy isolation passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
