/** Real React composer mounts and chat switches, in an offline DOM. No network. */
import assert from "node:assert/strict";
import React, { act } from "react";
import { createRequire } from "node:module";
const { JSDOM } = createRequire(import.meta.url)("jsdom");
import { accounts, conversationDetails } from "../lib/onlyfans-preview/fixtures";
import { clearDrafts, draftKey, readDraft, writeDraft } from "../lib/onlyfans/inbox-drafts";

async function main() {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/onlyfans/inbox" });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, React, IS_REACT_ACT_ENVIRONMENT: true });
  const require = createRequire(import.meta.url); require.extensions[".css"] = module => { module.exports = {}; };
  const { createRoot } = await import("react-dom/client");
  const { default: InboxView } = await import("../components/onlyfans-preview/InboxView");
  const account = { ...accounts[0], health: "connected" as const, capabilities: Object.fromEntries(Object.keys(accounts[0].capabilities).map(key => [key, "available"])) as typeof accounts[0]["capabilities"] };
  const base = Object.values(conversationDetails)[0];
  const detail = (id: string) => ({ ...base, accountId: account.accountId, conversationId: id, summary: { ...base.summary, accountId: account.accountId, conversationId: id, automationMode: "human_controlled" as const, takeoverState: "effective" as const, delivery: "sent" as const }, deliveryIncident: null });
  const a = detail("chat-a"), b = detail("chat-b");
  const root = createRoot(document.getElementById("root")!);
  const render = async (value: typeof a) => act(async () => { root.render(<InboxView draftPrincipal="agency-a:staff-a" accountsState={{status:"ready",data:[account]}} activeAccount={account} activeAccountId={account.accountId} onSelectAccount={() => {}} conversations={{status:"ready",data:{items:[a.summary,b.summary],nextCursor:null}}} selectedConversationId={value.conversationId} onSelectConversation={() => {}} detailState={{status:"ready",data:value}} viewer={{kind:"operator",label:"Chatter",canManage:false,canChat:true,scopedAccountIds:[]}} onCommand={() => {}} commandResult={null} nextCursor={null} loadingMore={false} onLoadMore={() => {}} showPreviewChrome />); });
  const input = () => document.querySelector<HTMLTextAreaElement>("[data-of-composer]")!;
  const type = async (text: string) => act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value")!.set!.call(input(), text); input().dispatchEvent(new dom.window.Event("input", {bubbles:true})); });
  clearDrafts(); await render(a); assert.equal(input().disabled,false); await type("draft for A");
  assert.equal(readDraft(draftKey("agency-a:staff-a",account.accountId,"chat-a")).body,"draft for A");
  await act(async () => { writeDraft(draftKey("agency-a:staff-a",account.accountId,"chat-a"),{catalogItemId:"27"}); });
  await render(b); assert.equal(input().value,""); await type("draft for B");
  await render(a); assert.equal(input().value,"draft for A"); assert.equal(readDraft(draftKey("agency-a:staff-a",account.accountId,"chat-a")).catalogItemId,"27");
  await render(b); assert.equal(input().value,"draft for B");
  await act(async () => { clearDrafts(); }); assert.equal(input().value,"");
  await act(async () => root.unmount()); dom.window.close();
  console.log("PASS real React composer: chatter can compose, typed A/B drafts and selected content survive remounts, explicit clear removes private drafts.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
