/** Plan C screen: real React in an offline DOM, talking through the real client and proxy handlers to the typed mock backend. No network. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { after, before } from "node:test";
import React, { act } from "react";
const { JSDOM } = createRequire(import.meta.url)("jsdom");

const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/onlyfans/plan-c" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, MouseEvent: dom.window.MouseEvent, React, IS_REACT_ACT_ENVIRONMENT: true });
let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof createRoot>;
before(async () => { ({ createRoot } = await import("react-dom/client")); });
after(async () => { await act(async () => root?.unmount()); dom.window.close(); });
const q = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector);
const all = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)];
const text = () => document.body.textContent ?? "";
const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
const click = async (element: Element | null) => { assert.ok(element, "element to click exists"); await act(async () => { element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 25)); }); };
const type = async (element: Element | null, value: string) => act(async () => {
  assert.ok(element);
  Object.getOwnPropertyDescriptor(element.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype, "value")!.set!.call(element, value);
  element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
});

import { MOCK_ACCOUNT, createPlanCMock, seedDraft, seedOffer, type RawUnresolved } from "../contracts/plan-c-mock-backend";
import { createPlanCProxy } from "../contracts/plan-c-proxy";

const unresolved: RawUnresolved = { id: "unk-1", kind: "unknown_send", owner: "engine", nextStep: "reconcile_with_provider", summary: "A send left the worker and no provider answer was recorded.",
  conversationId: `${MOCK_ACCOUNT}:900000000009`, revision: 4, createdAt: new Date().toISOString() };
async function render(element: React.ReactElement) {
  if (root) await act(async () => root.unmount()); // a live console keeps a timer; never leave one running between tests
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => { root.render(element); });
  await settle();
}
async function mount(options: Parameters<typeof createPlanCMock>[0] = {}, props: { canAct?: boolean; authorizationMode?: "supervised" | "autonomous" } = {}) {
  const mock = createPlanCMock(options), proxy = createPlanCProxy(mock);
  const { default: PlanCConsole } = await import("../../components/onlyfans-preview/PlanCConsole");
  await render(<PlanCConsole accountId={MOCK_ACCOUNT} canAct={props.canAct ?? true} authorizationMode={props.authorizationMode} fetchImpl={proxy.fetch} />);
  return { mock, proxy };
}
const draftEl = (index = 0) => all("[data-plan-c-draft]")[index];
const within = (el: HTMLElement, selector: string) => el.querySelector<HTMLElement>(selector);
const buttonByText = (el: ParentNode, label: RegExp) => [...el.querySelectorAll<HTMLButtonElement>("button")].find(b => label.test(b.textContent ?? "")) ?? null;

test("a draft shows the exact ordered text, action, media count, price, version, expiry, evidence and recent conversation", async () => {
  const offer = seedOffer({ evidence: "One earlier send to this fan has no provider answer." });
  await mount({ drafts: [offer] });
  const card = draftEl();
  assert.deepEqual(all("[data-plan-c-part-text]").map(el => el.textContent), ["Got something for you.", "Plan C fixture photo"]);
  assert.match(text(), /Part 1 of 2/); assert.match(text(), /Part 2 of 2/);
  assert.equal(within(card, "[data-plan-c-action-badge]")?.textContent, "offer");
  assert.match(within(card, "[data-plan-c-offer]")?.textContent ?? "", /1 media/); assert.match(within(card, "[data-plan-c-offer]")?.textContent ?? "", /USD 3\.00/);
  assert.match(within(card, "[data-plan-c-meta]")?.textContent ?? "", /Version 1/); assert.match(within(card, "[data-plan-c-meta]")?.textContent ?? "", /expires in (44|45) min/);
  assert.match(within(card, "[data-plan-c-meta]")?.textContent ?? "", new RegExp(offer.draftHash.slice(0, 12)));
  assert.match(within(card, "[data-plan-c-evidence]")?.textContent ?? "", /no provider answer/);
  assert.equal(all("[data-plan-c-message]").length, 2); assert.match(text(), /hi are you there/);
});

test("provider acceptance is displayed without implying a read or purchase", async () => {
  await mount({ receipts: [{ intentId: "00000000-0000-4000-8000-000000000001", fanId: "101", messageId: "7001",
                            acceptedAt: "2026-11-07T10:00:00Z", action: "reply", projected: true }] });
  const receipt = q("[data-plan-c-receipt]");
  assert.ok(receipt); assert.match(receipt.textContent ?? "", /Fan 101.*Reply.*Provider message 7001/);
  assert.match(text(), /does not confirm a read, purchase or settlement/);
  assert.match(receipt.textContent ?? "", /Recorded in the conversation/);
});

test("opening the page and waiting sends nothing: zero commands, and no approve-all control exists", async () => {
  const { mock, proxy } = await mount({ drafts: [seedDraft(), seedDraft({ fanId: "900000000002" })], unresolved: [unresolved] });
  await settle(); await settle();
  assert.equal(mock.posts().length, 0); assert.equal(proxy.posts().length, 0);
  assert.equal(all("[data-plan-c-approve]").length, 2, "one approve button per draft");
  assert.ok(!/approve all|select all|approve selected/i.test(text()));
  assert.equal(all('input[type="checkbox"]').length, 0, "nothing to tick for a bulk action");
  assert.ok(all("[data-plan-c-draft]").every(el => el.getAttribute("data-plan-c-status") === "awaiting"), "nothing was approved by itself");
});

test("approving one draft sends exactly one command for that version and leaves the other draft alone", async () => {
  const { mock } = await mount({ drafts: [seedDraft(), seedDraft({ fanId: "900000000002" })] });
  const first = mock.state.drafts[0], second = mock.state.drafts[1];
  await click(within(draftEl(0), "[data-plan-c-approve]"));
  assert.equal(mock.posts().length, 1);
  assert.match(mock.posts()[0].path, new RegExp(`/drafts/${first.requestId}/1/approve$`));
  assert.equal(mock.posts()[0].body?.expectedVersion, 1);
  assert.equal(first.status, "approved"); assert.equal(second.status, "awaiting");
  assert.match(text(), /Approved version 1/);
  assert.equal(draftEl(0).getAttribute("data-plan-c-status"), "approved");
  assert.equal(within(draftEl(0), "[data-plan-c-approve]")?.hasAttribute("disabled"), true, "an approved draft cannot be approved again");
  assert.equal(within(draftEl(1), "[data-plan-c-approve]")?.hasAttribute("disabled"), false);
});

test("confirmation waits until the refreshed lists arrive", async () => {
  const mock = createPlanCMock({ drafts: [seedDraft()] }), proxy = createPlanCProxy(mock);
  const { default: PlanCConsole } = await import("../../components/onlyfans-preview/PlanCConsole");
  let blockReads = false, release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const delayed = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (blockReads && (init?.method ?? "GET") === "GET") await barrier;
    return proxy.fetch(input, init);
  }) as typeof fetch;
  await render(<PlanCConsole accountId={MOCK_ACCOUNT} canAct fetchImpl={delayed} />);
  blockReads = true;
  try {
    await click(within(draftEl(), "[data-plan-c-approve]"));
    assert.equal(mock.state.drafts[0].status, "approved");
    assert.equal(q("[data-plan-c-confirmation]"), null, "do not claim the lists reloaded while reads are pending");
  } finally { release(); }
  await settle();
  assert.match(q("[data-plan-c-confirmation]")?.textContent ?? "", /Lists reloaded/);
  assert.equal(draftEl().getAttribute("data-plan-c-status"), "approved");
});

test("a double click on Approve sends one command", async () => {
  const { mock } = await mount({ drafts: [seedDraft()] });
  const button = within(draftEl(), "[data-plan-c-approve]")!;
  await act(async () => { button.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); button.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 40)); });
  assert.equal(mock.posts().length, 1);
});

test("an expired draft cannot be approved from the screen", async () => {
  const { mock } = await mount({ drafts: [seedDraft({ expiresAt: new Date(Date.now() - 1000).toISOString() })] });
  assert.ok(within(draftEl(), "[data-plan-c-expired]"));
  assert.equal(within(draftEl(), "[data-plan-c-approve]")?.hasAttribute("disabled"), true);
  assert.equal(mock.posts().length, 0);
});

test("a 409 reloads and re-shows the changed draft, says why, and approves nothing", async () => {
  const { mock } = await mount({ drafts: [seedDraft()] });
  // The backend produces version 2 (a new input arrived) while the operator was reading version 1.
  mock.state.drafts[0].draftVersion = 2; mock.state.drafts[0].parts[0].body = "A different first part";
  await click(within(draftEl(), "[data-plan-c-approve]"));
  assert.equal(mock.posts().length, 1);
  assert.match(q("[data-plan-c-notice]")?.textContent ?? "", /changed/); assert.equal(q("[data-plan-c-notice]")?.getAttribute("role"), "alert");
  assert.equal(mock.state.drafts[0].status, "awaiting", "not approved");
  assert.equal(draftEl().getAttribute("data-plan-c-version"), "2", "the current draft is shown");
  assert.equal(all("[data-plan-c-part-text]")[0].textContent, "A different first part");
  assert.equal(mock.posts().length, 1, "no automatic retry against the new version");
  await click(within(draftEl(), "[data-plan-c-approve]"));
  assert.equal(mock.posts().length, 2, "approving version 2 takes a fresh, deliberate click");
  assert.equal(mock.posts()[1].body?.expectedVersion, 2);
  assert.equal(mock.state.drafts[0].status, "approved");
});

test("reject needs a reason, then sends it with the version", async () => {
  const { mock } = await mount({ drafts: [seedDraft()] });
  await click(within(draftEl(), "[data-plan-c-reject]"));
  const confirm = within(draftEl(), "[data-plan-c-reject-confirm]")!;
  assert.equal(confirm.hasAttribute("disabled"), true, "no reason, no reject");
  await click(confirm); assert.equal(mock.posts().length, 0);
  await type(q('input[aria-label="Reason for rejecting"]'), "  tone is off for this fan ");
  await click(within(draftEl(), "[data-plan-c-reject-confirm]"));
  assert.equal(mock.posts().length, 1);
  assert.equal(mock.posts()[0].body?.reason, "tone is off for this fan"); assert.equal(mock.posts()[0].body?.expectedVersion, 1);
  assert.equal(mock.state.drafts[0].status, "rejected"); assert.equal(all("[data-plan-c-draft]").length, 0);
  assert.match(text(), /Rejected version 1/); assert.ok(q("[data-plan-c-no-drafts]"));
});

test("edit sends the new part texts, invalidates the approval, and returns a new version that needs a fresh approval", async () => {
  const { mock } = await mount({ drafts: [seedDraft()] });
  await click(within(draftEl(), "[data-plan-c-approve]"));
  assert.equal(draftEl().getAttribute("data-plan-c-status"), "approved");
  await click(within(draftEl(), "[data-plan-c-edit]"));
  const save = () => within(draftEl(), "[data-plan-c-edit-confirm]")!;
  assert.equal(save().hasAttribute("disabled"), true, "nothing changed yet");
  await type(q('textarea[aria-label="Part 1 text"]'), "Hey, I saw your message — hi");
  assert.equal(save().hasAttribute("disabled"), true, "em dash blocked"); assert.match(text(), /em or en dashes/);
  await type(q('textarea[aria-label="Part 1 text"]'), "Hey, I saw your message, hi");
  await click(save());
  assert.equal(mock.posts().length, 2);
  assert.deepEqual(mock.posts()[1].body?.parts, ["Hey, I saw your message, hi", "What are you after tonight?"]);
  assert.equal(draftEl().getAttribute("data-plan-c-version"), "2"); assert.equal(draftEl().getAttribute("data-plan-c-status"), "awaiting");
  assert.equal(within(draftEl(), "[data-plan-c-approved-by]"), null, "the earlier approval did not carry over");
  assert.equal(all("[data-plan-c-part-text]")[0].textContent, "Hey, I saw your message, hi");
});

test("stop, take over and hand back each need a confirming click, and a take over never hands back by itself", async () => {
  const id = `${MOCK_ACCOUNT}:900000000001`;
  const { mock } = await mount({ drafts: [seedDraft()] });
  const conv = () => q(`[data-plan-c-conversation="${id}"]`)!;
  await click(within(conv(), '[data-plan-c-conversation-action="takeover"]'));
  assert.equal(mock.posts().length, 0, "the first click only asks for confirmation");
  assert.match(text(), /Pending drafts for this fan are invalidated/);
  await click(within(conv(), '[data-plan-c-conversation-confirm="takeover"]'));
  assert.equal(mock.posts().length, 1); assert.match(mock.posts()[0].path, /\/takeover$/); assert.equal(mock.posts()[0].body?.expectedRevision, 7);
  assert.equal(mock.state.drafts[0].status, "invalidated"); assert.equal(all("[data-plan-c-draft]").length, 0);
  // The draft is gone, but the conversation stays controllable so the operator can hand back deliberately.
  assert.ok(conv(), "the conversation is still listed after taking over");
  await settle(); assert.equal(mock.posts().length, 1, "no automatic hand back");
  await click(within(conv(), '[data-plan-c-conversation-action="handback"]'));
  assert.equal(mock.posts().length, 1, "hand back also waits for its confirmation");
  assert.match(text(), /never sends an old draft/);
  await click(within(conv(), '[data-plan-c-conversation-confirm="handback"]'));
  assert.equal(mock.posts().length, 2); assert.match(mock.posts()[1].path, /\/handback$/); assert.equal(mock.posts()[1].body?.expectedRevision, 8);
  assert.equal(mock.state.conversations[id].owner, "engine");
  assert.equal(all("[data-plan-c-draft]").length, 0, "no draft was revived");
  assert.equal(q(`[data-plan-c-conversation="${id}"]`), null, "nothing left to control");
});

test("a conversation action can be cancelled without sending anything", async () => {
  const { mock } = await mount({ drafts: [seedDraft()] });
  await click(within(q("[data-plan-c-conversation]")!, '[data-plan-c-conversation-action="stop"]'));
  await click(buttonByText(q("[data-plan-c-conversation]")!, /^Cancel$/));
  assert.equal(mock.posts().length, 0);
  assert.ok(q('[data-plan-c-conversation-action="stop"]'));
});

test("unresolved work shows owner and next step, and reconcile needs an evidence reference", async () => {
  const { mock } = await mount({ unresolved: [unresolved] });
  const row = q("[data-plan-c-unresolved]")!;
  assert.match(within(row, "[data-plan-c-owner]")?.textContent ?? "", /Owner: engine\. Next step: reconcile with provider/); assert.match(row.textContent ?? "", /Unknown send/);
  const button = within(row, "[data-plan-c-reconcile]")!;
  assert.equal(button.hasAttribute("disabled"), true, "no evidence, no reconcile");
  await click(button); assert.equal(mock.posts().length, 0);
  await type(within(row, 'input[aria-label="Evidence reference"]'), "abc"); assert.equal(within(row, "[data-plan-c-reconcile]")?.hasAttribute("disabled"), true, "too short to be evidence");
  await type(within(row, 'input[aria-label="Evidence reference"]'), "provider message 55501 shows no delivery");
  await click(within(row, "[data-plan-c-reconcile]"));
  assert.equal(mock.posts().length, 1);
  assert.equal(mock.posts()[0].body?.evidenceRef, "operator:fansapi:provider message 55501 shows no delivery");
  assert.equal(all("[data-plan-c-unresolved]").length, 1, "an audit note never clears the unknown send");
  assert.match(text(), /Evidence recorded; this send remains unresolved/);
  assert.match(text(), /the issue remains/);
});

test("an unlock review note does not invent financial settlement", async () => {
  await mount({ unresolved: [{ ...unresolved, id: "unlock-1", kind: "unreconciled_access", nextStep: "review_unlinked_financial_evidence",
                                summary: "Provider reported an unlock. Settlement is not linked." }] });
  const row = q("[data-plan-c-unresolved]")!;
  await type(within(row, 'input[aria-label="Evidence reference"]'), "checked the provider unlock observation");
  await click(within(row, "[data-plan-c-reconcile]"));
  assert.equal(all("[data-plan-c-unresolved]").length, 1);
  assert.match(text(), /Settlement is not linked/);
  assert.match(text(), /Evidence review recorded/);
});

test("human-held and handed-over work does not offer an unsupported reconciliation action", async () => {
  await mount({ unresolved: [{ ...unresolved, id: "human-1", kind: "human_hold", owner: "human", nextStep: "awaiting_handback" },
                            { ...unresolved, id: "handover-1", kind: "handover_request", owner: "human", nextStep: "accept_handover" }] });
  assert.equal(all("[data-plan-c-unresolved]").length, 2);
  assert.equal(all("[data-plan-c-reconcile]").length, 0);
  assert.match(text(), /Review this item using its next step/);
});

test("an unconfirmed outcome is shown as unconfirmed; if it did commit, the reload shows it approved and there is nothing to retry", async () => {
  const { mock, proxy } = await mount({ drafts: [seedDraft()] });
  mock.faults.dropReplyAfterCommit = true;
  await click(within(draftEl(), "[data-plan-c-approve]"));
  assert.match(q("[data-plan-c-notice]")?.textContent ?? "", /unconfirmed/);
  assert.equal(draftEl().getAttribute("data-plan-c-status"), "approved");
  assert.equal(within(draftEl(), "[data-plan-c-approve]")?.hasAttribute("disabled"), true);
  assert.equal(proxy.posts().length, 1); assert.equal(mock.state.commits.filter(c => c.action === "approve").length, 1);
});

test("an unconfirmed outcome that did not commit can be retried, and the retry reuses the same key", async () => {
  const { mock, proxy } = await mount({ drafts: [seedDraft()] });
  mock.faults.dropBeforeCommit = true;
  await click(within(draftEl(), "[data-plan-c-approve]"));
  assert.match(q("[data-plan-c-notice]")?.textContent ?? "", /unconfirmed/);
  assert.equal(draftEl().getAttribute("data-plan-c-status"), "awaiting");
  await click(within(draftEl(), "[data-plan-c-approve]"));
  const keys = proxy.posts().map(p => (p.body as { commandKey: string }).commandKey);
  assert.equal(keys.length, 2); assert.equal(keys[0], keys[1]);
  assert.equal(mock.state.commits.filter(c => c.action === "approve").length, 1);
  assert.equal(draftEl().getAttribute("data-plan-c-status"), "approved");
});

test("a backend that cannot be read shows an error with Retry and offers no controls", async () => {
  const mock = createPlanCMock({ drafts: [seedDraft()] }); mock.faults.status = 503;
  const proxy = createPlanCProxy(mock);
  const { default: PlanCConsole } = await import("../../components/onlyfans-preview/PlanCConsole");
  await render(<PlanCConsole accountId={MOCK_ACCOUNT} canAct fetchImpl={proxy.fetch} />);
  assert.match(q("[data-plan-c-drafts-error]")?.textContent ?? "", /unavailable/); assert.match(q("[data-plan-c-unresolved-error]")?.textContent ?? "", /unavailable/);
  assert.equal(all("[data-plan-c-approve]").length, 0);
  assert.equal(all("[data-plan-c-draft]").length, 0, "an unreadable list is not shown as an empty queue");
  assert.ok(!q("[data-plan-c-no-drafts]"));
  mock.faults.status = null;
  await click(buttonByText(q("[data-plan-c-drafts-error]")!, /Retry/));
  assert.equal(all("[data-plan-c-draft]").length, 1);
});

test("a read-only viewer sees the drafts but every control is disabled", async () => {
  const { mock } = await mount({ drafts: [seedDraft()], unresolved: [unresolved] }, { canAct: false });
  assert.equal(all("[data-plan-c-draft]").length, 1);
  for (const selector of ["[data-plan-c-approve]", "[data-plan-c-edit]", "[data-plan-c-reject]", "[data-plan-c-conversation-action]", "[data-plan-c-reconcile]"])
    for (const el of all(selector)) assert.equal(el.hasAttribute("disabled"), true, selector);
  assert.equal(mock.posts().length, 0);
});

test("a conversation whose revision the backend did not report cannot be changed", async () => {
  const draft = seedDraft(); (draft.conversation as { revision?: number }).revision = undefined;
  await mount({ drafts: [draft] });
  assert.match(text(), /did not report this conversation's revision/);
  assert.equal(all("[data-plan-c-conversation-action]").length, 0);
});


test("autonomous mode shows policy authorization and no per-message approve button", async () => {
  const { mock, proxy } = await mount({ drafts: [seedDraft()] }, { authorizationMode: "autonomous" });
  assert.equal(all("[data-plan-c-approve]").length, 0);
  assert.match(text(), /automatic pilot authorization/i);
  assert.match(text(), /awaiting policy checks/i);
  assert.equal(mock.posts().length, 0);
  assert.equal(proxy.posts().length, 0);
});
