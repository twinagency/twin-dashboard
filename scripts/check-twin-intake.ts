import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";
import { creatorDashboardIdentity } from "../lib/creator-dashboard-identity";
import { creatorIntakeOptional } from "../lib/creator-intake-policy";
import { creatorQuestionnairePage } from "../lib/creator-questionnaire-draft";
import { CREATOR_SESSION_COOKIE, signCreatorSession } from "../lib/creator-session";
const account="11111111-1111-4111-8111-111111111111",user="22222222-2222-4222-8222-222222222222";
Object.assign(process.env,{NODE_ENV:"production",SUPABASE_URL:"https://twin-intake-test.supabase.co",SUPABASE_SERVICE_KEY:"offline",CREATOR_SESSION_SECRET:"offline-twin-intake-secret"});
let source="twin",active=true,assignment:any=null;
const previous=globalThis.fetch;
globalThis.fetch=async(input:any,init:any)=>{
 const req=new Request(input,init),url=new URL(req.url);
 assert.equal(url.hostname,"twin-intake-test.supabase.co");
 let body:any;
 if(url.pathname==="/rest/v1/creator_accounts") body={id:account,auth_user_id:user,display_name:"Test creator",account_status:active?"applicant":"paused",source};
 else if(url.pathname==="/rest/v1/creator_applications")body={status:"draft",submitted_at:null};
 else if(url.pathname==="/rest/v1/creator_agency_assignments")body=assignment;
 else if(url.pathname==="/rest/v1/creator_clone_links")body=null;
 else throw Error("Unexpected request "+url.pathname);
 return new Response(JSON.stringify(body),{headers:{"content-type":"application/json"}});
};
async function main(){
 try{
 const token=await signCreatorSession(account,user);
 const req=(path:string)=>new NextRequest("https://dashboard.tgaiclone.xyz"+path,{headers:{cookie:CREATOR_SESSION_COOKIE+"="+token,host:"dashboard.tgaiclone.xyz"}});
 const twin=await creatorDashboardIdentity(token);
 assert.ok(twin);assert.equal(twin.name,"Twin");assert.equal(twin.agencyId,null);assert.equal(twin.onboarded,true);
 assert.equal(twin.applicationSubmitted,false);assert.deepEqual(twin.cloneIds,[]);
 assert.equal(creatorQuestionnairePage(undefined,creatorIntakeOptional(twin)).slug,"quick-about");
 assert.equal((await middleware(req("/creator"))).headers.get("location"),null);
 assert.equal((await middleware(req("/creator/onboarding"))).headers.get("location"),null);
 assert.equal((await middleware(req("/agency-admin"))).status,403);
 assert.equal((await middleware(req("/api/dashboard?clone=33333333-3333-4333-8333-333333333333"))).status,403);
 source="agency_invite";assert.equal(await creatorDashboardIdentity(token),null);
 source="twin";assignment={agency_id:"33333333-3333-4333-8333-333333333333",partner_agencies:{name:"Twin",active:true}};
 const other=await creatorDashboardIdentity(token);assert.ok(other);assert.equal(other.onboarded,false);
 assert.equal(creatorIntakeOptional(other),false);
 assignment={agency_id:"bc670215-110b-4ea0-8f5c-af3dfe21d253",partner_agencies:{name:"Moxy",active:true}};
 const moxy=await creatorDashboardIdentity(token);assert.ok(moxy);assert.equal(moxy.onboarded,true);assert.equal(creatorIntakeOptional(moxy),true);
 active=false;assert.equal(await creatorDashboardIdentity(token),null);
 assert.equal(creatorIntakeOptional({name:"Twin"}),false);
 console.log("Twin intake: verified direct signup, optional dashboard entry, unchanged draft/consent, Moxy parity and agency/admin isolation passed");
 }finally{globalThis.fetch=previous;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
