/* Real owner membership route/page with isolated Auth/DB adapters. No live accounts or emails. */
const assert=require("node:assert/strict"),{build}=require("esbuild"),{mkdtempSync,rmSync}=require("node:fs"),{join}=require("node:path");
const {NextRequest}=require("next/server"),React=require("react"),{renderToStaticMarkup}=require("react-dom/server");
const A="bc670215-110b-4ea0-8f5c-af3dfe21d253",B="aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",U="bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",V="cccccccc-cccc-4ccc-cccc-cccccccccccc";
async function main(){
 const root=process.cwd(),dir=mkdtempSync(join(root,"agency-team-check-"));
 const f=globalThis.__agencyTeamTest={allowed:true,queries:[],created:[],deleted:[],insertError:false,authError:false,
   members:[{agency_id:A,user_id:U,email:"member@example.invalid",active:true,can_manage:false},{agency_id:B,user_id:V,email:"foreign@example.invalid",active:true,can_manage:false}]};
 f.db={auth:{admin:{async createUser(args){f.created.push(args);return f.authError?{data:{user:null},error:{}}:{data:{user:{id:V}},error:null}},async deleteUser(id){f.deleted.push(id);return{error:null}}}},
 from(table){
  const q={table,filters:[],action:"select",values:null};f.queries.push(q);
  const result=()=>{if(table==="partner_agencies")return{data:[{id:A,name:"Fixture agency",slug:"moxy"}].filter(row=>q.filters.every(([k,v])=>k==="active"?v===true:row[k]===v)),error:null};
   const rows=f.members.filter(row=>q.filters.every(([k,v])=>row[k]===v));
   if(q.action==="update")rows.forEach(row=>Object.assign(row,q.values));
   if(q.action==="insert"){if(f.insertError)return{data:null,error:{}};f.members.push(q.values);return{data:null,error:null}}
   return{data:rows,error:null}};
  const b={select(){return b},eq(k,v){q.filters.push([k,v]);return b},order(){return b},limit(){return b},
   update(values){q.action="update";q.values=values;return b},insert(values){q.action="insert";q.values=values;return b},
   async maybeSingle(){const r=result();return{...r,data:r.data?.[0]??null}},then(resolve,reject){return Promise.resolve(result()).then(resolve,reject)}};
  return b;
 }};
 const stubs={
  "@/lib/internal-admin":"export async function hasInternalAdminAccess(){return globalThis.__agencyTeamTest.allowed}",
  "@/lib/supabase-service":"export function serviceClient(){return globalThis.__agencyTeamTest.db}",
  "next/navigation":"export function redirect(){throw new Error('denied-before-query')}",
  "@/components/NavigationLink":"import React from 'react';export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}",
  "next/link":"import React from 'react';export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}",
 };
 try{
  await build({stdin:{contents:"export * as route from './app/agency-admin/provision/route';export {default as Page} from './app/agency-admin/page';export * from './lib/agency-member-management';",resolveDir:root,loader:"ts"},outfile:join(dir,"test.cjs"),bundle:true,platform:"node",format:"cjs",jsx:"automatic",alias:{"@":root},external:["next/server","react","react/jsx-runtime"],plugins:[{name:"private-adapters",setup(b){b.onResolve({filter:/.*/},a=>Object.hasOwn(stubs,a.path)?{path:a.path,namespace:"stub"}:undefined);b.onLoad({filter:/.*/,namespace:"stub"},a=>({contents:stubs[a.path],loader:"tsx",resolveDir:root}))}}]});
  const m=require(join(dir,"test.cjs"));
  const form=values=>{const fd=new FormData();for(const [k,v]of Object.entries(values))fd.set(k,String(v));return fd};
  const body={agency:A,email:"member@example.invalid",user_id:U,expected_active:"true",expected_can_manage:"false",access:"manage",operation:"set-access"};
  const request=(values,headers={})=>new NextRequest("https://dashboard.tgaiclone.xyz/agency-admin/provision",{method:"POST",headers:{origin:"https://dashboard.tgaiclone.xyz","sec-fetch-site":"same-origin",...headers},body:form(values)});
  const send=(values,headers)=>m.route.POST(request(values,headers));
  f.allowed=false;const before=f.queries.length;assert.equal((await send(body)).status,401);await assert.rejects(()=>m.Page({searchParams:Promise.resolve({})}),/denied-before-query/);assert.equal(f.queries.length,before);
  f.allowed=true;assert.equal((await send(body,{origin:"https://foreign.invalid"})).status,403);assert.equal((await send(body,{"sec-fetch-site":"cross-site"})).status,403);
  const duplicate=form(body);duplicate.append("agency",B);assert.equal(m.parseAgencyMemberCommand(duplicate),null);
  for(const extra of [{actor:"forged"},{access:"admin"},{user_id:"bad"},{expected_active:"maybe"},{operation:"restore"}])assert.equal(m.parseAgencyMemberCommand(form({...body,...extra})),null);
  let response=await send(body);assert.equal(response.status,303);assert.match(response.headers.get("location"),/result=updated/);assert.equal(f.members[0].can_manage,true);assert.equal(f.members[1].can_manage,false);
  const update=f.queries.find(q=>q.action==="update");assert.deepEqual(update.filters,[["agency_id",A],["email","member@example.invalid"],["user_id",U],["active",true],["can_manage",false]]);
  response=await send(body);assert.match(response.headers.get("location"),/result=conflict/,"Stale role change must not overwrite newer membership");
  response=await send({...body,email:"foreign@example.invalid",user_id:V});assert.match(response.headers.get("location"),/result=conflict/);assert.equal(f.members[1].can_manage,false);
  response=await send({...body,operation:"revoke",expected_can_manage:"true"});assert.match(response.headers.get("location"),/result=revoked/);assert.equal(f.members[0].active,false);
  response=await send({...body,operation:"restore",expected_active:"false",expected_can_manage:"true",access:"read"});assert.match(response.headers.get("location"),/result=updated/);assert.equal(f.members[0].active,true);assert.equal(f.members[0].can_manage,false);
  const create={agency:A,email:"new@example.invalid",password:"synthetic-password-123",access:"read",operation:"create"};
  response=await send(create);assert.match(response.headers.get("location"),/result=created/);assert.equal(f.members.at(-1).can_manage,false);assert.deepEqual(f.created.at(-1),{email:create.email,password:create.password,email_confirm:true});
  f.insertError=true;response=await send({...create,email:"failed@example.invalid"});assert.match(response.headers.get("location"),/result=error/);assert.deepEqual(f.deleted,[V]);f.insertError=false;
  f.authError=true;const count=f.queries.filter(q=>q.action==="insert").length;await send({...create,email:"existing@example.invalid"});assert.equal(f.queries.filter(q=>q.action==="insert").length,count);f.authError=false;
  const html=renderToStaticMarkup(await m.Page({searchParams:Promise.resolve({agency:A})}));
  assert.match(html,/Fixture agency team/);assert.match(html,/member@example.invalid/);assert(!html.includes("foreign@example.invalid"));assert.match(html,/Creator access is shared across the agency/);assert.match(html,/Restore access|Revoke access/);
  const {JSDOM}=require("jsdom"),dom=new JSDOM(html);
  const memberForm=[...dom.window.document.querySelectorAll("[data-agency-member-form]")].find(form=>form.querySelector('[name="email"]').value==="member@example.invalid");
  const renderedForm=new dom.window.FormData(memberForm);
  renderedForm.set("operation","revoke");
  const submitted=new FormData();for(const [key,value]of renderedForm)submitted.set(key,value);
  assert.equal(m.parseAgencyMemberCommand(submitted).operation,"revoke","The rendered revoke form must accept its access selector");
  assert(!html.includes("synthetic-password"));assert.equal(f.created.length,3,"Rendering team page must not create accounts");
  console.log("PASS owner team access: existing authority, CSRF, read-only default, explicit role changes, stale updates, agency/user scoping, revocation/restoration, provisioning cleanup and scoped page");
 }finally{delete globalThis.__agencyTeamTest;rmSync(dir,{recursive:true,force:true})}
}
main().catch(error=>{console.error(error);process.exitCode=1});

