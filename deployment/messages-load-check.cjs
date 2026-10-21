// Read-only navigation timing inside the existing dashboard. No messages,
// session tokens, credentials or fan identifiers are logged.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
(async () => {
  if (process.env.EXPECTED_DASHBOARD_SHA) assert.equal(process.env.GIT_SHA, process.env.EXPECTED_DASHBOARD_SHA, 'Running dashboard commit');
  const headers={apikey:process.env.SUPABASE_SERVICE_KEY,Authorization:`Bearer ${process.env.SUPABASE_SERVICE_KEY}`};
  const creatorsResponse=await fetch(process.env.SUPABASE_URL+'/rest/v1/clones?select=id,name&order=name&limit=1000',{headers,signal:AbortSignal.timeout(15000)});
  assert(creatorsResponse.ok,'Creator roster available');
  const creators=await creatorsResponse.json();
  const selected=creators.find(c=>c.name==='Briana Redd')||creators[0];assert(selected,'Existing creator available');
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
