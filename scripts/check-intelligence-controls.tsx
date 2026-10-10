import PlatformMark from "../components/fans/PlatformMark";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import ts from "typescript";
import React,{act} from "react";
import * as model from "../components/clone/intelligence/model";
import * as sections from "../components/clone/intelligence/sections";

const nativeRequire=createRequire(import.meta.url);
function compile(path:string,imports:Record<string,unknown>){
 const source=readFileSync(path,"utf8");
 const javascript=ts.transpileModule(source,{fileName:path,compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const result={exports:{} as any};new Function("require","module","exports",javascript)((name:string)=>{
  if(Object.hasOwn(imports,name))return imports[name];
  if(name==="../../fans/PlatformMark")return {__esModule:true,default:PlatformMark};
  if(["react","react/jsx-runtime","lucide-react"].includes(name))return nativeRequire(name);
  throw Error(`Unexpected runtime dependency: ${name}`);
 },result,result.exports);return result.exports;
}
async function main(){
 assert.equal(model.CONTROLS.length,56);
 assert.deepEqual(sections.ADVANCED_SECTIONS.flatMap(s=>[...s.ids]).sort((a,b)=>a-b),model.CONTROLS.map(c=>c.id),"Seven sections contain every control once");
 assert.deepEqual(model.CONTROLS.map(c=>c.id),Array.from({length:56},(_,i)=>i+1));
 assert.equal(new Set(model.CONTROLS.map(c=>c.key)).size,56);
 assert.deepEqual(Object.keys(model.DOMAIN_LABELS).map(d=>model.CONTROLS.filter(c=>c.domain===d).length),[8,12,9,14,4,9]);
 assert.equal(model.canShowIntelligence("admin",model.BRIANNA_CONTROL_ID),true);
 for(const audience of ["agency","creator"])assert.equal(model.canShowIntelligence(audience,model.BRIANNA_CONTROL_ID),false);
 assert.equal(model.canShowIntelligence("admin","another-creator"),false);
 const defaults=model.defaultValues();assert.deepEqual(model.issues(defaults),[]);
 assert.deepEqual(model.restoreValues("malformed"),defaults);
 assert.deepEqual(model.restoreValues(JSON.stringify({version:99,values:defaults})),defaults);
 const twoChannelSaved={...defaults,'releases.windows':(defaults['releases.windows'] as model.Row[]).filter(r=>r.platform!=='WhatsApp'),'delivery.profiles':(defaults['delivery.profiles'] as model.Row[]).filter(r=>r.platform!=='WhatsApp')};const threeChannelSaved=model.restoreValues(JSON.stringify({version:1,values:twoChannelSaved}));assert.equal((threeChannelSaved['releases.windows'] as model.Row[]).length,3);assert.equal((threeChannelSaved['delivery.profiles'] as model.Row[]).length,3);
 const bad=model.restoreValues(JSON.stringify({version:1,values:{"fingerprint.vocabulary":9999,"concurrent.policy":"unknown","platform-context.confirmed":"false","authority.actions":[null],"sequence.steps":[{label:"Invalid action"}]}}));
 assert.equal(bad["fingerprint.vocabulary"],100);assert.equal(bad["concurrent.policy"],defaults["concurrent.policy"]);assert.equal(bad["platform-context.confirmed"],true);assert.deepEqual(bad["sequence.steps"],defaults["sequence.steps"]);
 for(const target of [0,1,37,99,100]){const next=model.allocate(defaults,"context-budget.memory",target);assert.equal(next["context-budget.memory"],target);assert.equal(Object.entries(next).filter(([k])=>k.startsWith("context-budget.")).reduce((s,[,v])=>s+Number(v),0),100);}
 assert.ok(model.issues({...defaults,"offer-frequency.shared":false}).some(p=>p.id===27));
 assert.ok(model.issues({...defaults,"partial-ownership.policy":"Apply approved ownership credit","partial-ownership.approval":false}).some(p=>p.id===22));
 assert.ok(model.issues({...defaults,"scenes.scenes":[{label:"Invalid scene",start:20,end:10}]}).some(p=>p.id===52));

 const {JSDOM}=nativeRequire("jsdom");const dom=new JSDOM("<!doctype html><div id='root'></div><form id='live'><input name='bot_token' value='fixture-only'></form>",{url:"https://dashboard.example.test"});
 const win=dom.window;for(const key of ["window","document","HTMLElement","HTMLInputElement","HTMLSelectElement","Event","MouseEvent","Node"])Object.defineProperty(globalThis,key,{value:win[key],configurable:true});
 Object.defineProperty(globalThis,"IS_REACT_ACT_ENVIRONMENT",{value:true,configurable:true});
 let networkCalls=0;Object.defineProperty(globalThis,"fetch",{value:()=>{networkCalls++;throw Error("Unexpected network request");},configurable:true});
 const {createRoot}=await import("react-dom/client");const root=createRoot(document.getElementById("root")!);
 const css=new Proxy({},{get:(_,key)=>String(key)});
 const Component=compile("components/clone/intelligence/IntelligenceControls.tsx",{"./model":model,"./sections":sections,"./IntelligenceControls.module.css":{__esModule:true,default:css}}).default;
 let tab:model.Domain="identity";
 const render=async(audience="admin",cloneId=model.BRIANNA_CONTROL_ID)=>{await act(async()=>root.render(<Component tab={tab} audience={audience} cloneId={cloneId} creatorName="Brianna Redd" onTabChange={(next:model.Domain)=>{tab=next;}}/>));};
 const button=(label:string)=>Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(b=>b.textContent?.trim()===label)!;
 const click=async(el:HTMLElement)=>{assert.ok(el,"Expected control exists");await act(async()=>el.click());};
 await render("agency");assert.equal(document.querySelector("[data-intelligence-workspace]"),null);
 await render("creator");assert.equal(document.querySelector("[data-intelligence-workspace]"),null);
 await render("admin","another-creator");assert.equal(document.querySelector("[data-intelligence-workspace]"),null);
 await render();
 const live=document.getElementById("live") as HTMLFormElement;const before=Array.from(new win.FormData(live).entries());
 for(const domain of Object.keys(model.DOMAIN_LABELS) as model.Domain[]){
  tab=domain;await render();
  assert.equal(document.querySelectorAll("[data-intelligence-control]").length,domain==="advanced"?56:0);
 }
 tab="advanced";await render();
 for(const section of sections.ADVANCED_SECTIONS){
  const nav=document.querySelector("nav[aria-label='Advanced sections']")!;
  const target=Array.from(nav.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.textContent===`${section.label}${section.ids.length}`)!;
  await click(target);
  assert.deepEqual(Array.from(document.querySelectorAll<HTMLElement>('[data-intelligence-control]')).filter(el=>!el.hidden).map(el=>Number(el.dataset.intelligenceControl)).sort((a,b)=>a-b),[...section.ids].sort((a,b)=>a-b));
  assert.equal(target.getAttribute('aria-current'),'page');
 }
 for(const heading of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-intelligence-control] > button[aria-expanded='false']")))await click(heading);
 for(const c of model.CONTROLS){const card=document.querySelector(`[data-intelligence-control='${c.id}']`)!;assert.ok(card.textContent?.includes(c.title));assert.ok(card.querySelectorAll("input,select,button[role='switch'],ol").length>0,`${c.id} has interactive controls`);}
 for(const b of document.querySelectorAll<HTMLButtonElement>("[data-intelligence-workspace] button"))assert.equal(b.type,"button");
 assert.equal(document.querySelectorAll("[data-intelligence-workspace] [name]").length,0);
 assert.ok(!document.querySelector("[data-intelligence-workspace]")!.textContent!.includes("CREATOR INTELLIGENCE"));
 assert.equal(document.querySelector(".controlNumber"),null);
 const firstSharing=document.querySelector<HTMLButtonElement>("[data-intelligence-control='9'] button[role='switch']")!;
 assert.equal(firstSharing.getAttribute("aria-checked"),"true");await click(firstSharing);assert.equal(firstSharing.getAttribute("aria-checked"),"false");
 const whatsappPair=Array.from(document.querySelectorAll<HTMLButtonElement>("[data-intelligence-control='9'] button")).find(b=>b.textContent?.trim()==='OnlyFans  WhatsApp')!;await click(whatsappPair);
 const whatsappSharing=document.querySelector<HTMLButtonElement>("button[aria-label='Relationship memories: OnlyFans to WhatsApp']")!;assert.equal(whatsappSharing.getAttribute('aria-checked'),'true');await click(whatsappSharing);assert.equal(whatsappSharing.getAttribute('aria-checked'),'false');
 await click(button("Save controls"));const stored=JSON.parse(win.localStorage.getItem(model.storageKey(model.BRIANNA_CONTROL_ID))!);assert.equal(stored.values["platform-context.sharing"][0].of_tg,false);assert.equal(stored.values["platform-context.sharing"][0].of_wa,false);
 const move=document.querySelector<HTMLButtonElement>("button[aria-label='Move Present offer up']")!;await click(move);assert.ok(document.querySelector("[data-intelligence-control='20'] ol")?.textContent?.indexOf("Present offer")!<document.querySelector("[data-intelligence-control='20'] ol")?.textContent?.indexOf("Confirm format")!);

 const addRule=button("Add rule");const prior=document.querySelectorAll("[data-intelligence-control='46'] .dataRow").length;await click(addRule);assert.equal(document.querySelectorAll("[data-intelligence-control='46'] .dataRow").length,prior+1);

 const memory=document.querySelector<HTMLInputElement>("input[aria-label='Relationship memory']")!;
 await act(async()=>{const setter=Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype,"value")!.set!;setter.call(memory,"60");memory.dispatchEvent(new win.Event("input",{bubbles:true}));memory.dispatchEvent(new win.Event("change",{bubbles:true}));});
 const allocations=Array.from(document.querySelectorAll<HTMLInputElement>("[data-intelligence-control='30'] input[type='range']")).map(i=>Number(i.value));assert.equal(allocations.reduce((a,b)=>a+b,0),100);assert.ok(allocations.includes(60));
 await click(button("Save controls"));
 await render("agency");await render();assert.equal(document.querySelector<HTMLInputElement>("input[aria-label='Relationship memory']")!.value,"60","Saved policies survive remount");
 assert.deepEqual(Array.from(new win.FormData(live).entries()),before);assert.equal(networkCalls,0,"No send, payment, model, or configuration APIs called");
 const source=readFileSync("components/CloneForm.tsx","utf8");assert.ok(source.indexOf("<IntelligenceControls")>source.indexOf("</form>"),"New controls live outside the active creator form");
 await act(async()=>root.unmount());dom.window.close();
 console.log("PASS: 56 controls, Advanced-only placement, creator/admin isolation, seven sections, switches, rules, ordering, allocation, persistence, and zero production writes.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
