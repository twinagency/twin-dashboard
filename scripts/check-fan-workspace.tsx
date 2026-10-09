import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React, { act } from "react";
import { creators, fans } from "../components/fans/data";
import * as model from "../components/fans/model";
import * as types from "../components/fans/types";

const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom");
function compile(path: string, imports: Record<string, unknown>) {
  const js = ts.transpileModule(readFileSync(path, "utf8"), { fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const result = { exports: {} as Record<string, any> };
  new Function("require", "module", "exports", js)((name: string) => {
    if (Object.hasOwn(imports, name)) return imports[name];
    if (["react", "react/jsx-runtime", "lucide-react"].includes(name)) return require(name);
    throw new Error(`Unexpected fan workspace dependency: ${name}`);
  }, result, result.exports);
  return result.exports;
}
async function main() {
  // The actual route must stop before rendering for every non-admin audience,
  // including an authenticated admin viewing another audience.
  let admin = false, viewAs: unknown = null;
  const page = compile("app/fans/page.tsx", {
    "next/headers": { cookies: async () => ({}) },
    "next/navigation": { redirect: (path: string) => { throw new Error(`redirect:${path}`); } },
    "@/lib/internal-admin": { hasInternalAdminAccess: async () => admin },
    "@/lib/view-as": { activeViewAs: async () => viewAs },
    "@/components/fans/FanWorkspace": { __esModule: true, default: () => null },
    "@/components/fans/data": { creators, fans },
  }).default;
  await assert.rejects(page(), /redirect:\/twin/);
  admin = true;
  for (const targetType of ["creator", "agency"]) { viewAs = { targetType }; await assert.rejects(page(), /redirect:\/revenue/); }
  viewAs = null; assert.ok(await page());

  const mark = fans.find(f => f.id === "kyla-mark")!;
  assert.equal(model.totalsFor(mark, "telegram").stars, 16250);
  assert.equal(model.totalsFor(mark, "telegram").purchases.length, 3);
  assert.equal(model.totalsFor(mark, "all").usd, 411);
  assert.deepEqual(model.visibleFans(fans,"riley","Mark").map(f=>f.id),["riley-mark"]);
  assert.deepEqual(model.restoreState("invalid",fans),model.emptyState());
  assert.deepEqual(model.restoreState(JSON.stringify({version:1,messages:{"kyla-mark":[{id:"bad",direction:"out",platform:"instagram",text:"wrong channel",at:"bad"}]}}),fans).messages["kyla-mark"],[]);

  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "https://twin.invalid/fans" });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
  const fetchBefore = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Fan interactions must not use a network client"); };
  const { createRoot } = require("react-dom/client");
  const css = new Proxy({}, { get: (_, key) => String(key) });
  const Workspace = compile("components/fans/FanWorkspace.tsx", { "./model":model, "./types":types, "./FanWorkspace.module.css":{ __esModule:true, default:css } }).default;
  let root = createRoot(document.getElementById("root")!);
  await act(async () => { root.render(<Workspace creators={creators} fans={fans}/>); });
  const find = (selector:string) => { const element=document.querySelector(selector); assert.ok(element,selector); return element as HTMLElement; };
  const click = async (selector:string) => act(async()=>{find(selector).click();});
  const input = async (selector:string,value:string) => act(async()=>{
    const element=find(selector) as HTMLInputElement;
    const prototype=element.tagName==="SELECT"?dom.window.HTMLSelectElement.prototype:element.tagName==="TEXTAREA"?dom.window.HTMLTextAreaElement.prototype:dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype,"value")!.set!.call(element,value);
    element.dispatchEvent(new dom.window.Event(element.tagName==="SELECT"?"change":"input",{bubbles:true}));
  });
  const buttonText = async (text:string,scope="body") => act(async()=>{const button=Array.from(document.querySelectorAll(`${scope} button`)).find(b=>b.textContent?.trim()===text) as HTMLButtonElement|undefined;assert.ok(button,`button: ${text}`);assert.equal(button.disabled,false);button.click();});
  const profile=()=>find(".profilePane").textContent||"";
  assert.match(profile(),/Fan of Kyla Yesenosky/);
  assert.match(profile(),/US\$411.00/);
  await click('[aria-label="Profile platform filter"] button:nth-child(3)');
  assert.match(profile(),/16,250 Stars/);assert.doesNotMatch(find(".metrics").textContent||"",/US\$/);
  await click('#fan-tab-purchases');
  assert.equal(document.querySelectorAll(".purchaseRow").length,3);
  await click('.purchaseRow');assert.match(find('[role="dialog"]').textContent||"",/Kyla Yesenosky/);await click('[aria-label="Close dialog"]');
  await click('#fan-tab-conversation');
  await input('textarea[aria-label="Reply on Telegram"]',"Telegram draft only");
  await click('[aria-label="Profile platform filter"] button:nth-child(2)');
  assert.equal((find('textarea[aria-label="Reply on OnlyFans"]') as HTMLTextAreaElement).value,"");
  await input('textarea[aria-label="Reply on OnlyFans"]',"OnlyFans local reply");await buttonText("Send");
  assert.match(find(".messageList").textContent||"",/OnlyFans local reply/);
  await click('[aria-label="Profile platform filter"] button:nth-child(3)');
  assert.equal((find('textarea[aria-label="Reply on Telegram"]') as HTMLTextAreaElement).value,"Telegram draft only");
  assert.doesNotMatch(find(".messageList").textContent||"",/OnlyFans local reply/);
  await buttonText("Take over");assert.equal((find('[aria-label="Conversation handling"]') as HTMLSelectElement).value,"Human");
  await buttonText("Add note");await input('#fan-editor',"Kyla relationship note");await buttonText("Save note");
  await click('#fan-tab-memory');await click('[aria-label="Edit Location"]');await input('#fan-editor',"Arizona, reviewed");await buttonText("Save memory");assert.match(profile(),/Arizona, reviewed/);
  await input('#fan-creator',"riley");await click('[aria-label="Mark, Riley Mae Lewis"]');assert.doesNotMatch(profile(),/Kyla relationship note|Arizona, reviewed|16,250/);
  await click('#fan-tab-conversation');await click('[aria-label="Profile platform filter"] button:nth-child(3)');assert.equal((find('textarea[aria-label="Reply on Telegram"]') as HTMLTextAreaElement).value,"");
  await input('#fan-creator',"kyla");assert.match(profile(),/Kyla relationship note|Arizona, reviewed/);
  await input('[aria-label="Search fans"]',"does-not-exist");assert.match(profile(),/No matching fans/);await click('[aria-label="Clear fan search"]');
  await click('[aria-label="James, Kyla Yesenosky"]');assert.equal((find('[aria-label="Profile platform filter"] button:nth-child(2)') as HTMLButtonElement).disabled,true);
  await input('#fan-creator',"all");assert.equal(document.querySelectorAll(".fanRow").length,8);
  await input('[aria-label="Filter fan list by platform"]',"fanvue");assert.equal(document.querySelectorAll(".fanRow").length,3);
  await input('#fan-creator',"kyla");await click('#fan-tab-memory');
  await act(async()=>{root.unmount();});
  root=createRoot(document.getElementById("root")!);await act(async()=>{root.render(<Workspace creators={creators} fans={fans}/>);});
  assert.match(profile(),/Arizona, reviewed/);
  await click('[aria-label="Reset workspace"]');await buttonText("Reset workspace",'[role="dialog"]');assert.doesNotMatch(profile(),/Arizona, reviewed|Kyla relationship note/);
  await act(async()=>{root.unmount();});
  globalThis.fetch=fetchBefore;dom.window.close();
  console.log("Fan workspace passed: admin/view-as gate; creator and fan isolation; all four channels; currency separation; search; purchases; notes; memory edits; handling; per-channel drafts; local-only messages; persistence and reset.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
