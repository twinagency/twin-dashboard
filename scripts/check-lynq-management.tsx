import { configureFlirtOfflineEnv } from "./flirt-offline-env";
import { JESS_KATE_PORTAL } from "../lib/partner-portals";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";
import { withDashboardAccess } from "../lib/dashboard-access";
import { agencyCanManage, LYNQ_MANAGEMENT_AGENCY_ID, agencyManagementRequestAllowed } from "../lib/agency-management-policy";
import { assignedStoragePath, guardDashboardAction, requireManagedClone } from "../lib/agency-management";
import { dashboardFetch } from "../lib/agency-fetch";
import Access, {AdminOnly,ManagerOnly,MutationForm,ReadOnlyFields} from "../components/DashboardAccessProvider";

const a="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",b="bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",other="cccccccc-cccc-cccc-cccc-cccccccccccc";
const user="11111111-1111-1111-1111-111111111111",photo="22222222-2222-2222-2222-222222222222",bundle="33333333-3333-3333-3333-333333333333",item="44444444-4444-4444-4444-444444444444";
const manager={id:process.env.TEST_JESS_KATE ? JESS_KATE_PORTAL.id : LYNQ_MANAGEMENT_AGENCY_ID,name:process.env.TEST_JESS_KATE ? JESS_KATE_PORTAL.name : "LYNQ",cloneIds:[a,b]};
const reader={id:"another-agency",name:"LYNQ",cloneIds:[a]};
const base="https://abcdefghijklmnopqrst.supabase.co/rest/v1/",origin="https://dashboard.flirt.example";
async function main(){
  Object.assign(process.env,{NODE_ENV:"production",SUPABASE_URL:"https://abcdefghijklmnopqrst.supabase.co",SUPABASE_SERVICE_KEY:"sb_secret_synthetic_test_only"});
  configureFlirtOfflineEnv();
  assert.equal(agencyCanManage(manager),true);
  assert.equal(agencyCanManage(reader),false,"Branding alone does not grant management");
  assert.equal(agencyCanManage(null),false);
  const previous=globalThis.fetch;const calls:{url:URL;method:string;body:any}[]=[];
  let revoked=false,paused=true,paid=false;
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input)),method=(init?.method??"GET").toUpperCase();
    const body=typeof init?.body==="string"?JSON.parse(init.body):null;calls.push({url,method,body});
    let out:unknown=[];
    if(url.pathname==="/auth/v1/user")out={id:"verified-user"};
    else if(url.pathname==="/rest/v1/agency_memberships")out=revoked?null:{agency_id:manager.id};
    else if(url.pathname==="/rest/v1/partner_agencies")out={id:manager.id,name:manager.name};
    else if(url.pathname==="/rest/v1/agency_creators")out=manager.cloneIds.map(clone_id=>({clone_id}));
    else if(method!=="GET"&&method!=="HEAD")out=[];
    else if(url.pathname==="/rest/v1/users")out=url.searchParams.get("id")===`eq.${user}`?{id:user,clone_id:a,telegram_id:123,paused}:null;
    else if(url.pathname==="/rest/v1/photo_bundle_items")out={id:item,bundle_id:bundle,storage_path:`${a}/photos/bundle.jpg`};
    else if(url.pathname==="/rest/v1/photo_bundles")out=url.searchParams.get("id")?{id:bundle,clone_id:a}:[{id:bundle}];
    else if(url.pathname==="/rest/v1/photos"||url.pathname==="/rest/v1/videos")out=url.searchParams.get("id")?.startsWith("eq.")?{id:photo,clone_id:a,storage_path:`${a}/photos/item.jpg`,is_free:!paid}:[{id:photo}];
    else if(url.pathname==="/rest/v1/clones")out=[{id:a,name:"Assigned",bot_token:"secret-never-serialize"}];
    return new Response(JSON.stringify(out),{headers:{"content-type":"application/json"}});
  };
  const writes=()=>calls.filter(c=>!['GET','HEAD'].includes(c.method));
  try{
    const headers={cookie:"twin_agency_access=verified-token",origin,"next-action":"any-known-action-id"};
    for(const path of ["/users","/flows","/media",`/clones/${a}`])assert.equal((await middleware(new NextRequest(origin+path,{method:"POST",headers}))).status,200,path);
    for(const path of ["/settings","/agency-admin","/api-access","/tracker","/clones/new",`/clones/${other}`])assert.equal((await middleware(new NextRequest(origin+path,{method:"POST",headers}))).status,403,path);
    for(const path of ["/api/business-account","/api/caption","/api/compile"])assert.equal((await middleware(new NextRequest(origin+path,{method:"POST",headers:{cookie:headers.cookie,origin}}))).status,200,path);
    assert.equal((await middleware(new NextRequest(origin+"/users",{method:"POST",headers:{...headers,origin:"https://evil.example"}}))).status,403);
    assert.equal((await middleware(new NextRequest(origin+"/api/compile",{headers:{cookie:headers.cookie}}))).status,405);
    revoked=true;assert.equal((await middleware(new NextRequest(origin+"/users",{method:"POST",headers}))).status,307,"Revoked membership never writes");revoked=false;
    assert.equal(agencyManagementRequestAllowed("/lynq/auth","POST",true),false);
    await withDashboardAccess(manager,async()=>{
      await requireManagedClone(a);await assert.rejects(requireManagedClone(other));await assert.rejects(requireManagedClone(null));
      for(const action of ["app/settings/actions.ts#saveApiKeys","app/clones/actions.ts#createCloneRow","app/clones/actions.ts#deleteClone","app/users/actions.ts#clearMinorFlag","app/users/actions.ts#deleteUser","app/api-access/actions.ts#issueKeyAction","app/tracker/actions.ts#askBot","unknown"]){
        const n=writes().length;await assert.rejects(guardDashboardAction(action,[]));assert.equal(writes().length,n,action);
      }
      await guardDashboardAction("app/clones/actions.ts#toggleClonePause",[a,true]);
      await assert.rejects(guardDashboardAction("app/clones/actions.ts#toggleClonePause",[other,true]));
      const fd=new FormData();fd.set("userId",user);
      await guardDashboardAction("app/users/actions.ts#setCredits",[fd]);
      fd.set("cloneId",b);await assert.rejects(guardDashboardAction("app/users/actions.ts#setCredits",[fd]));fd.delete("cloneId");
      await guardDashboardAction("app/users/actions.ts#manualSendText",[fd]);
      paused=false;await assert.rejects(guardDashboardAction("app/users/actions.ts#manualSendText",[fd]));paused=true;
      fd.set("photoId",photo);paid=true;await assert.rejects(guardDashboardAction("app/users/actions.ts#manualSendPhoto",[fd]));paid=false;
      await guardDashboardAction("app/users/actions.ts#manualSendPhoto",[fd]);
      await guardDashboardAction("app/media/actions.ts#deletePhoto",[a,photo,`${a}/photos/item.jpg`]);
      await assert.rejects(guardDashboardAction("app/media/actions.ts#deletePhoto",[b,photo,`${a}/photos/item.jpg`]));
      await assert.rejects(guardDashboardAction("app/media/actions.ts#deletePhoto",[a,photo,`${a}/photos/wrong.jpg`]));
      await guardDashboardAction("app/media/actions.ts#addBundleItem",[bundle,a,new FormData()]);
      await assert.rejects(guardDashboardAction("app/media/actions.ts#addBundleItem",[bundle,b,new FormData()]));
      await guardDashboardAction("app/media/actions.ts#removeBundleItem",[a,item,`${a}/photos/bundle.jpg`]);
      await assert.rejects(guardDashboardAction("app/media/actions.ts#removeBundleItem",[a,item,`${a}/photos/wrong.jpg`]));
      for(const path of [`${other}/photos/item.jpg`,`${a}/../secret`,`/${a}/photos/item.jpg`,`${a}/%2e%2e/secret`,`${a}\\photos\\item.jpg`])assert.throws(()=>assignedStoragePath(manager,path));
      for(const [table,method,payload] of [
        ['clones','PATCH',{status:'paused'}],['users','PATCH',{message_credits:25}],['photos','POST',{clone_id:a,storage_path:`${a}/photos/new.jpg`,star_value:100,nsfw:false}],
        ['videos','POST',{clone_id:a,storage_path:`${a}/videos/new.mp4`,star_value:100,nsfw:false}],['photo_bundles','POST',{clone_id:a,name:'New',star_price:100}],
        ['photo_bundle_items','POST',{bundle_id:bundle,storage_path:`${a}/photos/bundle.jpg`,sort_order:0}],
        ['manual_sends','POST',{clone_id:a,user_id:user,telegram_id:123,kind:'text',body:'Test'}],
      ] as const){
        const result=await dashboardFetch(`${base}${table}?id=eq.${a}`,{method,body:JSON.stringify(payload)});assert.equal(result.status,200,`${method} ${table}`);
        const sent=writes().at(-1)!;if(method==='PATCH')assert.ok(sent.url.searchParams.get('and')?.includes(a));
      }
      for(const [table,method,payload] of [
        ['clones','POST',{name:'Unexpected'}],['clones','DELETE',{}],['clones','PATCH',{bot_token:'injected'}],['clones','PATCH',{strict_minor_gate:false}],
        ['users','PATCH',{clone_id:other}],['users','PATCH',{minor_flagged_at:null}],['users','DELETE',{}],['star_transactions','PATCH',{amount_stars:1}],['app_settings','PATCH',{value:'bad'}],
        ['photos','POST',{clone_id:other,storage_path:`${other}/photos/item.jpg`}],['photos','PATCH',{storage_path:`${other}/photos/item.jpg`}],
        ['photo_bundle_items','POST',{bundle_id:bundle,storage_path:`${b}/photos/item.jpg`}],
        ['manual_sends','POST',{clone_id:b,user_id:user,telegram_id:123,kind:'text',body:'Wrong clone'}],
        ['manual_sends','POST',{clone_id:a,user_id:user,telegram_id:999,kind:'text',body:'Wrong person'}],
      ] as const){const n=writes().length;assert.equal((await dashboardFetch(`${base}${table}?id=eq.${a}`,{method,body:JSON.stringify(payload)})).status,403,`${method} ${table}`);assert.equal(writes().length,n);}
      assert.equal((await dashboardFetch(base+`photos?id=eq.${photo}&on_conflict=id`,{method:'POST',body:JSON.stringify({clone_id:a})})).status,403);
      assert.equal((await dashboardFetch(base+`clones?id=eq.${a}`,{method:'PATCH',headers:{'content-profile':'private'},body:'{}'})).status,403);
      assert.equal((await dashboardFetch(base+`clones?id=eq.${a}`,{method:'PATCH',headers:{prefer:'resolution=merge-duplicates'},body:'{}'})).status,403);
      const listed=await dashboardFetch(base+'clones?select=*');assert.equal((await listed.json())[0].bot_token,null);
      await dashboardFetch(base+`photo_bundle_items?bundle_id=eq.${bundle}`);assert.ok(calls.at(-1)?.url.searchParams.get('and')?.includes(bundle));
      for(const method of ['POST','GET'])assert.equal((await dashboardFetch(`https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/media/${a}/photos/new.jpg`,{method})).status,200);
      assert.equal((await dashboardFetch('https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/media',{method:'DELETE',body:JSON.stringify({prefixes:[`${a}/photos/new.jpg`]})})).status,200);
      assert.equal((await dashboardFetch('https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/media',{method:'DELETE',body:JSON.stringify({prefixes:[`${other}/photos/new.jpg`]})})).status,403);
    });
    await withDashboardAccess(reader,async()=>{
      await assert.rejects(requireManagedClone(a));await assert.rejects(guardDashboardAction('app/users/actions.ts#setCredits',[]));
      assert.equal((await dashboardFetch(base+'clones?id=eq.'+a,{method:'PATCH',body:JSON.stringify({status:'paused'})})).status,403);
    });
  }finally{globalThis.fetch=previous;}
  const controls=<><ManagerOnly><button>Save changes</button></ManagerOnly><AdminOnly><button>Delete creator</button></AdminOnly><ReadOnlyFields><input name="setting"/></ReadOnlyFields><MutationForm><button>Send message</button></MutationForm><MutationForm adminOnly><button>Clear minor gate</button></MutationForm></>;
  const live=renderToStaticMarkup(<Access agencyName={manager.name} canManage>{controls}</Access>);
  assert.match(live,/Save changes/);assert.match(live,/Send message/);assert.doesNotMatch(live,/disabled|Delete creator|Clear minor gate/);
  const view=renderToStaticMarkup(<Access agencyName="Moxy">{controls}</Access>);assert.match(view,/disabled/);assert.doesNotMatch(view,/Save changes|Send message/);
  const admin=renderToStaticMarkup(<Access>{controls}</Access>);assert.match(admin,/Delete creator/);
  let guarded=0;
  function walk(dir:string){for(const entry of readdirSync(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())walk(path);else if(path.endsWith('.ts')){
    const source=readFileSync(path,'utf8');if(!/^[\'"]use server[\'"]/.test(source))continue;
    const ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true);
    for(const st of ast.statements)if(ts.isFunctionDeclaration(st)&&st.body&&st.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)){
      assert.match(st.body.statements[0].getText(ast),/^await guardDashboardAction\(/,`First instruction must authorize ${path}#${st.name?.text}`);guarded++;
    }
  }}}walk('app');assert.ok(guarded>=70,`Guarded ${guarded} exports`);
  assert.match(readFileSync('components/TopBar.tsx','utf8'),/isAgency \? "\/agency\/logout"/);
  assert.match(readFileSync('components/MainShell.tsx','utf8'),/!isAgency/);
  assert.match(readFileSync('components/clone/ConfigSections.tsx','utf8'),/isAgency \? <div>/);
  assert.match(readFileSync('components/CompileButton.tsx','utf8'),/method: "POST"/);
  for(const page of ['fans','inbox','campaigns','platforms'])assert.match(readFileSync(`app/crm/${page}/page.tsx`,'utf8'),/agencyCanManage\(await getDashboardAccess\(\)\)/);
  console.log(`Lynq management: live controls, ${guarded} guarded actions, clone/fan/media isolation, immutable ledger/credentials, CSRF, revocation, storage, business routes and read-only-agency regression checks passed`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
