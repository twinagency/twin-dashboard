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

  // Exercise the actual /users server branch. Fixture links must exit before
  // clone scope/database queries, and cannot expose histories to other audiences.
  const inboxImports: Record<string, unknown> = {};
  const inboxSource = ts.createSourceFile("app/users/page.tsx",readFileSync("app/users/page.tsx","utf8"),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  for (const statement of inboxSource.statements) if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
    inboxImports[statement.moduleSpecifier.text] = { __esModule:true, default:() => null };
  }
  Object.assign(inboxImports, {
    "next/headers": { cookies:async()=>({}) },
    "next/navigation": { redirect:(path:string)=>{throw new Error(`redirect:${path}`);} },
    "@/lib/internal-admin": { hasInternalAdminAccess:async()=>admin },
    "@/lib/view-as": { activeViewAs:async()=>viewAs },
    "@/lib/clone-scope": { getCloneScope:async()=>{throw new Error("existing-live-route");} },
    "@/lib/supabase": { supabaseAdmin:{from:()=>{throw new Error("Unexpected real data access");}} },
    "@/components/fans/data": { creators,fans },
    "@/components/users/FanConversationWindow": { __esModule:true, default:()=>null },
  });
  const inboxPage = compile("app/users/page.tsx",inboxImports).default;
  const inbox = (params:Record<string,string | undefined> = {}) => inboxPage({searchParams:Promise.resolve(params)});
  admin=false;await assert.rejects(inbox({relationship:"briana-ben"}),/redirect:\/twin/);
  admin=true;
  for (const targetType of ["agency","creator"]) {viewAs={targetType};await assert.rejects(inbox({relationship:"briana-ben"}),/redirect:\/revenue/);}
  viewAs=null;
  for (const params of [{relationship:"unknown"},{relationship:""},{relationship:"briana-ben",creator:"kyla"}]) await assert.rejects(inbox(params),/redirect:\/fans/);
  const inboxElement=await inbox({relationship:"briana-ben",creator:"briana",platform:"telegram",source:"ben-print-2"});
  assert.equal(inboxElement.props.initialFanId,"briana-ben");
  assert.equal(inboxElement.props.initialSourceId,"ben-print-2");
  await assert.rejects(inbox(),/existing-live-route/,"The ordinary inbox still follows its original real-user path");

  const mark = fans.find(f => f.id === "kyla-mark")!;
  assert.equal(model.totalsFor(mark, "telegram").stars, 16250);
  assert.equal(model.totalsFor(mark, "telegram").purchases.length, 3);
  assert.equal(model.totalsFor(mark, "all").usd, 411);
  assert.deepEqual(model.visibleFans(fans,"riley","Mark").map(f=>f.id),["riley-mark"]);
  assert.deepEqual(model.restoreState("invalid",fans),model.emptyState());
  assert.deepEqual(model.restoreState(JSON.stringify({version:1,messages:{"kyla-mark":[{id:"bad",direction:"out",platform:"instagram",text:"wrong channel",at:"bad"}]}}),fans).messages["kyla-mark"],[]);

  // Rich relationship contract: coherent timelines, traceable facts, no cross-fan sources.
  const briannaFans = fans.filter(f => f.creatorId === "briana");
  assert.equal(briannaFans.length, 2);
  for (const fan of briannaFans) {
    assert.ok(fan.messages.length >= 64, `${fan.name}: extensive conversation history`);
    assert.equal(new Set(fan.messages.map(m => m.text)).size, fan.messages.length);
    assert.equal(new Set(fan.memories.map(m => m.category)).size, 6);
    assert.ok(fan.memories.length >= 20);
    assert.ok(fan.purchases.length >= 8);
    assert.ok(fan.history!.length >= 8);
    assert.equal(fan.notes!.length, 4);
    assert.ok(new Date(fan.messages.at(-1)!.at).getTime() - new Date(fan.firstSeen).getTime() > 45 * 86400000);
    const ids = [...fan.messages, ...fan.memories, ...fan.purchases, ...fan.history!, ...fan.notes!].map(x => x.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const m of fan.messages) {
      const account = fan.accounts.find(a => a.platform === m.platform)!;
      assert.ok(account, `${m.id}: account exists`);
      assert.ok(m.at >= account.linkedAt && account.linkedAt >= fan.firstSeen, `${m.id}: account chronology`);
      assert.ok(m.at <= "2026-10-09T09:00:00Z", `${m.id}: no future transcript`);
    }
    for (const item of [...fan.memories, ...fan.purchases, ...fan.history!]) {
      const source = fan.messages.find(m => m.id === item.sourceMessageId);
      assert.ok(source, `${item.id}: source belongs to this relationship`);
      assert.equal(source.platform, "source" in item ? item.source : item.platform);
      assert.equal(source.at, "updatedAt" in item ? item.updatedAt : item.at);
      if ("amount" in item) {
        assert.ok(source.text.includes(item.title), `${item.id}: purchase title grounded in conversation`);
        assert.ok(source.text.includes(item.amount.toLocaleString("en-US")), `${item.id}: amount agrees with transcript`);
        assert.equal(item.currency, item.platform === "telegram" ? "Stars" : "USD");
      }
    }
    for (const account of fan.accounts) {
      assert.ok(fan.messages.filter(m => m.platform === account.platform).length >= 8);
      assert.ok(fan.suggestedReplies?.[account.platform]);
    }
  }
  const ben = briannaFans.find(f => f.name === "Ben")!;
  const oliver = briannaFans.find(f => f.name === "Oliver")!;
  assert.equal(ben.accounts.length, 4);
  assert.equal(oliver.accounts.length, 1);
  assert.equal(model.totalsFor(ben,"all").usd,471);
  assert.equal(model.totalsFor(ben,"all").stars,5400);
  assert.equal(model.totalsFor(oliver,"all").usd,268);
  assert.ok(ben.messages.some(m=>m.platform==="telegram" && m.text.includes("Tea Tree Bay print is finally ordered")));
  assert.ok(ben.messages.some(m=>m.platform==="fansly" && m.text.includes("Noosa film came back")));
  assert.ok(oliver.memories.some(m=>m.label==="Fanvue only" && m.value.includes("not connected")));

  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "https://twin.invalid/fans" });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
  const fetchBefore = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Fan interactions must not use a network client"); };
  const { createRoot } = require("react-dom/client");
  const css = new Proxy({}, { get: (_, key) => String(key) });
  let navigation = "";
  const Workspace = compile("components/fans/FanWorkspace.tsx", { "next/navigation": { useRouter: () => ({ push: (href:string) => { navigation = href; } }) }, "./model":model, "./types":types, "./FanWorkspace.module.css":{ __esModule:true, default:css } }).default;
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
  assert.match(profile(),/Fan of Brianna Redd/);
  assert.match(profile(),/US\$471.00/);
  assert.match(profile(),/5,400 Stars/);
  assert.equal(document.querySelectorAll(".notes>div").length,4);
  assert.equal(document.querySelectorAll(".lucide-sparkles").length,0);
  assert.equal(document.querySelector('#fan-tab-conversation'),null);
  assert.equal(document.querySelector('textarea[aria-label^="Reply on"]'),null);
  await buttonText("Open conversation", ".headerActions");
  assert.equal(navigation, "/users?relationship=briana-ben&creator=briana&platform=telegram");
  await click('#fan-tab-memory');
  assert.equal(document.querySelectorAll(".memoryGroup").length,6);
  assert.equal(document.querySelectorAll(".memoryEntryValue").length,24);
  await input('[aria-label="Memory category"]',"Open follow-ups");
  assert.equal(document.querySelectorAll(".memoryEntryValue").length,4);
  await input('[aria-label="Search relationship memory"]',"print");
  assert.equal(document.querySelectorAll(".memoryEntryValue").length,1);
  await click('[aria-label="View source for A3 print arrival"]');
  assert.equal(navigation, "/users?relationship=briana-ben&creator=briana&platform=telegram&source=ben-print-2");
  assert.equal(document.querySelector('.tg-thread'),null);
  await click('#fan-tab-history');
  assert.equal(document.querySelectorAll('.historyEvent').length,10);
  await click('[aria-label="Profile platform filter"] button:first-child');
  assert.equal(document.querySelectorAll('.historyEvent').length,10);
  await click('[aria-label="View conversation for Fourth account connected"]');
  assert.equal(navigation, "/users?relationship=briana-ben&creator=briana&platform=fanvue&source=ben-fanvue-0");
  await click('#fan-tab-purchases');
  await click('[aria-label="View Coastal afternoon purchase on Fanvue"]');
  assert.match(find('[role="dialog"]').textContent||"",/US\$54.00/);
  await buttonText("Open conversation",'[role="dialog"]');
  assert.equal(navigation, "/users?relationship=briana-ben&creator=briana&platform=fanvue&source=ben-coastal-0");
  await click('[aria-label="Oliver, Brianna Redd"]');
  assert.match(profile(),/US\$268.00/);
  assert.doesNotMatch(profile(),/Noosa|restaurant launch|5,400/);
  assert.equal((find('[aria-label="Profile platform filter"] button:nth-child(3)') as HTMLButtonElement).disabled,true);
  await click('#fan-tab-memory');
  assert.equal(document.querySelectorAll('.memoryEntryValue').length,20);
  await click('[aria-label="View source for Print book due 12 October"]');
  assert.equal(navigation, "/users?relationship=briana-oliver&creator=briana&platform=fanvue&source=oliver-album-0");
  await click('#fan-tab-memory');await click('[aria-label="Edit Home and occupation"]');
  await input('#fan-editor',"Bristol sound engineer, reviewed");await buttonText("Save memory");
  await click('[aria-label="Ben, Brianna Redd"]');await click('#fan-tab-memory');
  assert.doesNotMatch(profile(),/Bristol sound engineer, reviewed/);
  await click('[aria-label="Oliver, Brianna Redd"]');await click('#fan-tab-memory');
  assert.match(profile(),/Bristol sound engineer, reviewed/);
  await input('#fan-creator',"kyla");
  assert.match(profile(),/Fan of Kyla Yesenosky/);
  assert.match(profile(),/US\$411.00/);
  await click('[aria-label="Profile platform filter"] button:nth-child(3)');
  assert.match(profile(),/16,250 Stars/);assert.doesNotMatch(find(".metrics").textContent||"",/US\$/);
  await click('#fan-tab-purchases');
  assert.equal(document.querySelectorAll(".purchaseRow").length,3);
  await click('.purchaseRow');assert.match(find('[role="dialog"]').textContent||"",/Kyla Yesenosky/);await click('[aria-label="Close dialog"]');
  await buttonText("Open conversation", ".headerActions");
  assert.equal(navigation, "/users?relationship=kyla-mark&creator=kyla&platform=telegram");
  await buttonText("Add note");await input('#fan-editor',"Kyla relationship note");await buttonText("Save note");
  await click('#fan-tab-memory');await click('[aria-label="Edit Location"]');await input('#fan-editor',"Arizona, reviewed");await buttonText("Save memory");assert.match(profile(),/Arizona, reviewed/);
  await input('#fan-creator',"riley");await click('[aria-label="Mark, Riley Mae Lewis"]');assert.doesNotMatch(profile(),/Kyla relationship note|Arizona, reviewed|16,250/);
  await buttonText("Open conversation", ".headerActions");
  assert.equal(navigation, "/users?relationship=riley-mark&creator=riley&platform=telegram");
  await input('#fan-creator',"kyla");assert.match(profile(),/Kyla relationship note|Arizona, reviewed/);
  await input('[aria-label="Search fans"]',"does-not-exist");assert.match(profile(),/No matching fans/);await click('[aria-label="Clear fan search"]');
  await click('[aria-label="James, Kyla Yesenosky"]');assert.equal((find('[aria-label="Profile platform filter"] button:nth-child(2)') as HTMLButtonElement).disabled,true);
  await input('#fan-creator',"all");assert.equal(document.querySelectorAll(".fanRow").length,8);
  await input('[aria-label="Filter fan list by platform"]',"fanvue");assert.equal(document.querySelectorAll(".fanRow").length,4);
  await input('#fan-creator',"kyla");await click('#fan-tab-memory');
  await act(async()=>{root.unmount();});
  root=createRoot(document.getElementById("root")!);await act(async()=>{root.render(<Workspace creators={creators} fans={fans}/>);});
  assert.match(profile(),/Arizona, reviewed/);
  await click('[aria-label="Reset workspace"]');await buttonText("Reset workspace",'[role="dialog"]');assert.match(profile(),/Fan of Brianna Redd/);await input("#fan-creator","kyla");assert.doesNotMatch(profile(),/Arizona, reviewed|Kyla relationship note/);
  await act(async()=>{root.unmount();});
  // Render the actual existing thread and the inbox's isolated relationship view.
  const ChatThread = compile("components/users/ChatThread.tsx", { "@/lib/live-bus": {
    onLive: () => { throw new Error("Illustrative relationships must not subscribe to live events"); },
    isTyping: () => { throw new Error("Illustrative relationships must not use live typing"); },
  }}).default;
  const Conversation = compile("components/users/FanConversationWindow.tsx", {
    "next/link": { __esModule:true, default: ({children,...props}:React.ComponentProps<"a">) => <a {...props}>{children}</a> },
    "./ChatThread": { __esModule:true, default:ChatThread }, "../fans/model":model, "../fans/types":types,
    "./FanConversationWindow.module.css": { __esModule:true, default:css },
  }).default;
  window.history.replaceState(null,"",navigation);
  root=createRoot(document.getElementById("root")!);
  await act(async()=>{root.render(<Conversation creators={creators} fans={fans} initialFanId="briana-ben" initialPlatform="telegram" initialSourceId="ben-print-2"/>);});
  assert.equal(find('[data-source-message="true"]').getAttribute('data-message-id'),"ben-print-2");
  assert.match(find('.tg-thread').textContent||"",/Tea Tree Bay print is finally ordered/);
  assert.equal(find('[aria-label="Conversation platform"] button[aria-pressed="true"]').textContent?.trim(),"Telegram");
  assert.equal(find('.chatHeader a').getAttribute('href'),"/fans?creator=briana&fan=briana-ben&platform=all&view=summary");
  await buttonText("Suggest reply");assert.match((find('textarea') as HTMLTextAreaElement).value,/client review/);
  await input('textarea[aria-label="Reply on Telegram"]',"Telegram draft only");
  await click('[aria-label="Conversation platform"] button:first-child');
  assert.equal((find('textarea[aria-label="Reply on OnlyFans"]') as HTMLTextAreaElement).value,"");
  await input('textarea[aria-label="Reply on OnlyFans"]',"OnlyFans local reply");await buttonText("Send");
  assert.match(find('.tg-thread').textContent||"",/OnlyFans local reply/);
  assert.equal(window.location.pathname,"/users");
  assert.equal(new URLSearchParams(window.location.search).get("platform"),"onlyfans");
  await click('[aria-label="Conversation platform"] button:nth-child(2)');
  assert.equal((find('textarea[aria-label="Reply on Telegram"]') as HTMLTextAreaElement).value,"Telegram draft only");
  assert.doesNotMatch(find('.tg-thread').textContent||"",/OnlyFans local reply/);
  await buttonText("Take over");assert.equal((find('[aria-label="Conversation handling"]') as HTMLSelectElement).value,"Human");
  await click('[aria-label="Open Oliver conversation with Brianna Redd"]');
  assert.equal((find('[aria-label="Conversation platform"] button:nth-child(2)') as HTMLButtonElement).disabled,true);
  assert.ok(find('textarea[aria-label="Reply on Fanvue"]'));
  assert.doesNotMatch(find('.chat').textContent||"",/ben_coast|OnlyFans local reply|5,400|5400/);
  await buttonText("Suggest reply");assert.match((find('textarea') as HTMLTextAreaElement).value,/river reflection/);
  await input('#conversation-creator',"riley");await click('[aria-label="Open Mark conversation with Riley Mae Lewis"]');
  assert.equal((find('textarea[aria-label="Reply on Telegram"]') as HTMLTextAreaElement).value,"");
  await input('#conversation-creator',"briana");
  assert.equal((find('textarea[aria-label="Reply on Telegram"]') as HTMLTextAreaElement).value,"Telegram draft only");
  assert.equal((find('[aria-label="Conversation handling"]') as HTMLSelectElement).value,"Human");
  await input('[aria-label="Search conversation"]',"not-found-in-conversation");assert.match(find('.chat').textContent||"",/No messages match/);
  await input('[aria-label="Search conversation"]',"");
  await act(async()=>root.unmount());
  root=createRoot(document.getElementById("root")!);
  await act(async()=>root.render(<Conversation creators={creators} fans={fans} initialFanId="briana-ben" initialPlatform="onlyfans" initialSourceId="oliver-album-0"/>));
  assert.equal(document.querySelector('[data-source-message="true"]'),null,"Another fan's message cannot be a source");
  assert.match(find('.tg-thread').textContent||"",/OnlyFans local reply/);
  assert.equal(new URLSearchParams(window.location.search).get("source"),null);
  await act(async()=>root.unmount());
  globalThis.fetch=fetchBefore;dom.window.close();
  console.log("Fan workspace passed: admin/view-as gate; creator and fan isolation; separate profiles and inbox; sourced navigation; linked platforms; purchases; notes; memory; local-only inbox messages, drafts and handling; persistence and reset.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
