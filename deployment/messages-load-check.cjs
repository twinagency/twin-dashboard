// Read-only navigation timing inside the existing dashboard. No messages,
// session tokens, credentials or fan identifiers are logged.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
(async () => {
  if (process.env.EXPECTED_DASHBOARD_SHA) assert.equal(process.env.GIT_SHA, process.env.EXPECTED_DASHBOARD_SHA, 'Running dashboard commit');
  const headers={apikey:process.env.SUPABASE_SERVICE_KEY,Authorization:`Bearer ${process.env.SUPABASE_SERVICE_KEY}`};
  const creatorsResponse=await fetch(process.env.SUPABASE_URL+'/rest/v1/clones?select=id,name,slug,engine&order=name&limit=1000',{headers,signal:AbortSignal.timeout(15000)});
  assert(creatorsResponse.ok,'Creator roster available');
  const creators=await creatorsResponse.json();
  const selected=creators.find(c=>c.name==='Briana Redd')||creators[0];assert(selected,'Existing creator available');
  const diagnostics=[];
  const timedRead=async(label,url,options={})=>{
    const start=Date.now();
    try{const r=await fetch(url,{...options,signal:AbortSignal.timeout(10000)});const text=await r.text();diagnostics.push({read:label,ms:Date.now()-start,status:r.status,bytes:Buffer.byteLength(text)});return r.ok?JSON.parse(text||"null"):null}
    catch{diagnostics.push({read:label,ms:Date.now()-start,status:"unavailable"});return null}
  };
  const monitor=process.env.BOT_V2_URL||'http://172.31.6.134:4300';
  const selectedFans=await timedRead('selected-users',process.env.SUPABASE_URL+'/rest/v1/users?'+new URLSearchParams({select:'id,telegram_id',clone_id:'eq.'+selected.id,order:'last_message_received.desc.nullslast',limit:'100'}),{headers});
  if(selected.engine==='v2'){
    await timedRead('selected-monitor-fans',monitor+'/api/fans?'+new URLSearchParams({girl:selected.slug}));
    if(selectedFans?.[0])await timedRead('selected-monitor-history',monitor+'/api/chat-history?'+new URLSearchParams({girl:selected.slug,chatId:String(selectedFans[0].telegram_id)}));
  }
  if(selectedFans?.length){
    await Promise.all([
      timedRead('routing',process.env.SUPABASE_URL+'/rest/v1/system_logs?'+new URLSearchParams({select:'clone_id,telegram_id,detail',source:'eq.routing',clone_id:'eq.'+selected.id,telegram_id:'in.('+selectedFans.map(f=>f.telegram_id).join(',')+')',order:'ts.desc',limit:'2000'}),{headers}),
      timedRead('unlocks',process.env.SUPABASE_URL+'/rest/v1/star_transactions?'+new URLSearchParams({select:'id,user_id,amount_stars',kind:'eq.media',user_id:'in.('+selectedFans.map(f=>f.id).join(',')+')',order:'id',limit:'1000'}),{headers})
    ]);
  }
  console.log(JSON.stringify({runningCommit:process.env.GIT_SHA,selectedEngine:selected.engine,diagnostics,readOnly:true}));
  const expires=String(Date.now()+5*60000);
  const signature=crypto.createHmac('sha256',process.env.DASHBOARD_SESSION_SECRET||process.env.DASHBOARD_PASSWORD).update(expires).digest('base64url');
  const session=`allie_admin_session=${expires}.${signature}`;
  const timings=[];
  for(const [scope,id] of [['selected',selected.id],['all',null]]) {
    const start=Date.now();
    const response=await fetch('http://127.0.0.1:3001/users',{headers:{cookie:session+(id?`; clone_scope=${id}`:'')},redirect:'manual',signal:AbortSignal.timeout(90000)});
    const headersMs=Date.now()-start;
    assert.equal(response.status,200,scope+' Messages response');
    const html=await response.text();
    assert(html.includes('Fixture Fan')===false,'No synthetic fan page');
    assert(/Conversations|Messages|Fans/.test(html),'Messages workspace rendered');
    assert(!html.includes('NEXT_HTTP_ERROR_FALLBACK'),'No streamed route error');
    timings.push({scope,headersMs,completeMs:Date.now()-start,bytes:Buffer.byteLength(html)});
  }
  console.log(JSON.stringify({runningCommit:process.env.GIT_SHA,messages:timings,method:'server HTTP through real page data; excludes phone network and browser rendering',readOnly:true}));
})().catch(error=>{console.error(error.message);process.exitCode=1});
