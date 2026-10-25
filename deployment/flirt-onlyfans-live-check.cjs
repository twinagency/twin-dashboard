const assert=require("node:assert/strict");
(async()=>{
 const base=process.env.CHECK_BASE||"http://127.0.0.1:3001";
 const origin=process.env.DASHBOARD_PUBLIC_ORIGIN;
 const unauth=await fetch(base+"/api/onlyfans/accounts",{redirect:"manual"});
 assert([301,302,303,307,308,401,403].includes(unauth.status),"unauthenticated API refused");
 const login=await fetch(base+"/admin-auth",{method:"POST",redirect:"manual",headers:{Origin:origin,"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({password:process.env.DASHBOARD_PASSWORD,next:"/onlyfans/accounts"})});
 const cookie=login.headers.getSetCookie().find(v=>v.startsWith("allie_admin_session="))?.split(";")[0];
 assert(cookie,"existing Flirt owner login");
 const headers={Cookie:cookie};
 async function get(path,json=true){const r=await fetch(base+path,{headers,redirect:"manual",signal:AbortSignal.timeout(60000)});assert.equal(r.status,200,path+" status "+r.status);return json?await r.json():await r.text();}
 const data=await get("/api/onlyfans/accounts");
 assert(Array.isArray(data.accounts),"live account envelope");
 const ids=data.accounts.map(a=>a.accountId).sort();
 assert.deepEqual(ids,["of-176774528","of-99421145"].sort(),"both existing Twin accounts");
 const checks=[];
 for(const account of data.accounts){
  const id=account.accountId;
  const scoped=await get("/api/onlyfans/accounts?account="+id);
  assert.equal(scoped.scope.accountId,id);assert(scoped.accounts.some(a=>a.accountId===id),"selected account remains in authorized roster");
  const chats=await get("/api/onlyfans/accounts/"+id+"/conversations");
  assert.equal(chats.accountId,id);
  for(const section of ["content","sales","settings"]){const v=await get("/api/onlyfans/accounts/"+id+"/workspace/"+section);assert(v,"workspace response");}
  await get("/api/onlyfans-launch/abc/accounts/"+id+"/access");
  checks.push({accountId:id,name:account.creatorName||account.label||account.handle,conversationRead:true,contentSalesSettings:true});
 }
 for(const page of ["/onlyfans/overview","/onlyfans/accounts","/onlyfans/inbox","/onlyfans/content","/onlyfans/sales","/onlyfans/settings","/onlyfans/campaigns","/onlyfans/operations","/onlyfans/launch"]){
  const html=await get(page,false);
  assert(!html.includes("NEXT_HTTP_ERROR_FALLBACK;500")&&!html.includes('data-next-error-message'),page+" no render error");
 }
 const bad=await fetch(base+"/api/onlyfans/accounts/of-999999999999/conversations",{headers,redirect:"manual"});
 assert([403,404].includes(bad.status),"unknown account refused: "+bad.status);
 const tg=await get("/revenue",false);assert(tg.includes("OnlyFans"),"existing sidebar exposes OnlyFans");
 console.log(JSON.stringify({ok:true,accounts:checks,pages:9,unknownAccountRefused:true,unauthenticatedRefused:true,telegramNavigation:true}));
})().catch(e=>{console.error(e.message);process.exit(1)});
