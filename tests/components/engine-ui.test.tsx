/** Real React components in an offline DOM. No network: every fetch is a fixture. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test, { after, before } from "node:test";
import React, { act } from "react";
const { JSDOM } = createRequire(import.meta.url)("jsdom");
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../contracts/fixtures/${name}.json`, import.meta.url), "utf8"));

const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/onlyfans/inbox" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, MouseEvent: dom.window.MouseEvent, React, IS_REACT_ACT_ENVIRONMENT: true });
createRequire(import.meta.url).extensions[".css"] = module => { module.exports = {}; };
let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof createRoot>;
before(async () => { ({ createRoot } = await import("react-dom/client")); });
const mount = async (element: React.ReactElement) => {
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => { root.render(element); });
};
after(async () => { await act(async () => root?.unmount()); dom.window.close(); });
const q = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector);
const all = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)];
const click = async (element: Element | null) => { assert.ok(element, "element to click exists"); await act(async () => { element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); }); };
const type = async (element: Element | null, value: string) => act(async () => {
  assert.ok(element);
  Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(element, value);
  element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
});
const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });

test("the panel names its environment: Simulation, Live and Live (FansAPI)", async () => {
  const { EngineStatus } = await import("../../components/onlyfans-preview/EngineStatus");
  for (const [env, label, real] of [["simulation", "Simulation", false], ["live", "Live", true], ["fansapi", "Live (FansAPI)", true]] as const) {
    await mount(<EngineStatus value={fixture(`engine-status-${env}`)} accountId="of-a" conversationId="of-a:42" />);
    assert.equal(q("[data-engine-environment]")?.textContent, label);
    assert.equal(q("[data-engine-environment]")?.getAttribute("data-engine-environment"), env);
    assert.equal(document.body.textContent?.includes("affect a real creator account"), real);
    assert.equal(document.body.textContent?.includes("Simulation"), env === "simulation");
  }
  await mount(<EngineStatus value={{ ...fixture("engine-status-live"), environment: "production" }} accountId="of-a" conversationId="of-a:42" />);
  assert.match(document.body.textContent ?? "", /Request status is unavailable/);
});

test("unresolved requests come first, with owner, next step and purchase evidence linked to purchases", async () => {
  const { EngineStatus } = await import("../../components/onlyfans-preview/EngineStatus");
  await mount(<EngineStatus value={fixture("engine-status-live")} accountId="of-a" conversationId="of-a:42" />);
  const groups = all("[data-engine-group]").map(el => el.getAttribute("data-engine-group"));
  assert.deepEqual(groups, ["unresolved", "finished"]);
  const rows = all("[data-engine-request]");
  assert.deepEqual(rows.map(row => row.getAttribute("data-engine-unresolved")), ["true", "true", "false"]);
  assert.match(rows[0].textContent ?? "", /Delivery outcome needs review/);
  assert.match(rows[0].textContent ?? "", /Owner: engine\. Next: Check the existing send before anything else\./);
  const states = all("[data-engine-purchase]").map(el => el.getAttribute("data-engine-purchase"));
  assert.deepEqual(states, ["purchased", "unlocked"]);
  assert.match(rows[1].textContent ?? "", /Purchased\. A purchase is recorded\. Access is not yet confirmed\./);
  assert.match(rows[2].textContent ?? "", /Unlocked\. Purchase recorded and access confirmed\./);
  const link = q<HTMLAnchorElement>("[data-engine-purchases-link]");
  assert.equal(link?.getAttribute("href"), "/onlyfans/launch?account=of-a&screen=purchases");
});

test("Load more appends the next page once, keeps order, and goes away at the end", async () => {
  const { EngineStatus } = await import("../../components/onlyfans-preview/EngineStatus");
  const cursors: string[] = [];
  const loader = async (cursor: string) => { cursors.push(cursor); return fixture("engine-status-live-page2"); };
  await mount(<EngineStatus value={fixture("engine-status-live")} accountId="of-a" conversationId="of-a:42" onLoadMore={loader} />);
  assert.equal(all("[data-engine-request]").length, 3);
  await click(q("[data-engine-load-more]"));
  await settle();
  assert.deepEqual(cursors, [fixture("engine-status-live").nextCursor]);
  assert.deepEqual(all("[data-engine-request]").map(row => row.getAttribute("data-engine-request")?.slice(-3)), ["661", "662", "663", "664", "665"]);
  assert.equal(q("[data-engine-load-more]"), null);
  assert.equal(all("[data-engine-group=unresolved]").length, 1);
});

test("a failed or unreadable page keeps what is on screen and says so", async () => {
  const { EngineStatus } = await import("../../components/onlyfans-preview/EngineStatus");
  for (const loader of [async () => { throw new Error("down"); }, async () => ({ schemaVersion: "of-engine.v1", state: "current", accountId: "of-b" })]) {
    await mount(<EngineStatus value={fixture("engine-status-live")} accountId="of-a" conversationId="of-a:42" onLoadMore={loader} />);
    await click(q("[data-engine-load-more]")); await settle();
    assert.equal(all("[data-engine-request]").length, 3);
    assert.match(q("[role=alert]")?.textContent ?? "", /More requests could not be loaded/);
    assert.ok(q("[data-engine-load-more]"));
  }
});

test("resolution sends the environment, so a live request never carries a synthetic label", async () => {
  const { EngineStatus } = await import("../../components/onlyfans-preview/EngineStatus");
  const calls: unknown[][] = [];
  const onAction = async (...args: unknown[]) => { calls.push(args); return { ok: true as const }; };
  const view = fixture("engine-status-live");
  view.requests = [{ ...view.requests[0], status: "handover_accepted", actionOutcome: null, nextStep: "human_review", revision: 7 }];
  view.truncated = false; view.nextCursor = null;
  await mount(<EngineStatus value={view} accountId="of-a" conversationId="of-a:42" onAction={onAction as never} />);
  const complete = all("button").find(button => button.textContent === "Mark completed") as HTMLButtonElement;
  assert.equal(complete.disabled, true);
  await type(q("input[aria-label='Review evidence']"), "Checked the provider receipt");
  await click(all("button").find(button => button.textContent === "Mark completed")!);
  assert.deepEqual(calls[0].slice(1), ["complete", 7, "Checked the provider receipt", "live"]);
});

test("a pending handover points to Take over first and uses the shared label", async () => {
  const { EngineStatus } = await import("../../components/onlyfans-preview/EngineStatus");
  const view = fixture("engine-status-live");
  view.requests = [{ ...view.requests[0], status: "handover_pending", actionOutcome: null, nextStep: "await_handover_acceptance", revision: 4 }];
  view.truncated = false; view.nextCursor = null;
  let taken = 0;
  await mount(<EngineStatus value={view} accountId="of-a" conversationId="of-a:42" onAction={(async () => ({ ok: true })) as never} onTakeover={() => { taken++; }} />);
  assert.match(document.body.textContent ?? "", /Take over the conversation first/);
  const button = q("[data-engine-takeover]");
  assert.equal(button?.textContent, "Take over");
  await click(button);
  assert.equal(taken, 1);
  await mount(<EngineStatus value={{ ...view, mode: "human" }} accountId="of-a" conversationId="of-a:42" onAction={(async () => ({ ok: true })) as never} onTakeover={() => { taken++; }} />);
  assert.equal(q("[data-engine-takeover]"), null);
  assert.doesNotMatch(document.body.textContent ?? "", /Take over the conversation first/);
});

test("the account-wide list shows owner and next step, and offers Mark reconciled only where the backend declared it", async () => {
  const { EngineUnresolvedList } = await import("../../components/onlyfans-preview/EngineUnresolved");
  const { parseEngineUnresolved } = await import("../../lib/onlyfans/engine-unresolved");
  const page = parseEngineUnresolved(fixture("engine-unresolved-live"), "of-a");
  assert.equal(page?.state, "current");
  if (page?.state !== "current") return;
  const calls: unknown[][] = [];
  await mount(<EngineUnresolvedList page={page} accountId="of-a" canAct loadingMore={false} error={null} onLoadMore={() => {}} onReconcile={async (...args) => { calls.push(args); return { ok: true }; }} />);
  assert.equal(q("[data-engine-environment]")?.textContent, "Live");
  const rows = all("[data-engine-unresolved-row]");
  assert.equal(rows.length, 3);
  assert.match(rows[0].textContent ?? "", /fan_42/); assert.match(rows[0].textContent ?? "", /Owner: engine\. Next: Check the existing send/);
  assert.equal(all("[data-engine-reconcile]").length, 1);
  assert.ok(rows[0].querySelector("[data-engine-reconcile]"));
  assert.equal(rows[1].querySelector("[data-engine-reconcile]"), null);
  assert.match(rows[1].textContent ?? "", /Purchased\./);
  assert.match(rows[2].querySelector("[data-engine-no-reconcile]")?.textContent ?? "", /Reconciling from this list is not available yet/);
  const button = rows[0].querySelector<HTMLButtonElement>("[data-engine-reconcile]")!;
  assert.equal(button.disabled, true);
  await type(rows[0].querySelector("input[aria-label='Reconciliation evidence']"), "Receipt matches the provider message");
  await click(rows[0].querySelector("[data-engine-reconcile]"));
  assert.equal(calls.length, 1);
  assert.equal((calls[0][0] as { requestId: string }).requestId, "0a1b2c3d-1111-4222-8333-444455556661");
  assert.equal(calls[0][1], "Receipt matches the provider message");
  await mount(<EngineUnresolvedList page={page} accountId="of-a" canAct={false} loadingMore={false} error={null} onLoadMore={() => {}} onReconcile={async () => ({ ok: true })} />);
  assert.equal(all("[data-engine-reconcile]").length, 0);
});

test("the account-wide panel loads a page, loads more with the cursor, and posts the reconcile command with its environment", async () => {
  const { default: Panel } = await import("../../components/onlyfans-preview/EngineUnresolved");
  const requests: { url: string; init?: RequestInit }[] = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    if (String(url).includes("/engine/unresolved")) {
      const first = !String(url).includes("cursor=");
      const body = fixture("engine-unresolved-live");
      return Response.json(first ? body : { ...body, nextCursor: null, items: [{ ...body.items[0], requestId: "0a1b2c3d-1111-4222-8333-444455556699", conversationId: "of-a:99", supportedActions: [] }] });
    }
    return Response.json({ schemaVersion: "of-engine-operator.v1", ok: true, outcome: "recorded" });
  };
  await mount(<Panel accountId="of-a" canAct fetchImpl={fetchImpl} />);
  await settle();
  assert.equal(all("[data-engine-unresolved-row]").length, 3);
  assert.match(requests[0].url, /\/api\/onlyfans\/accounts\/of-a\/engine\/unresolved\?limit=20$/);
  await click(q("[data-engine-load-more]")); await settle();
  assert.equal(all("[data-engine-unresolved-row]").length, 4);
  assert.match(requests[1].url, /cursor=/);
  assert.equal(q("[data-engine-load-more]"), null);
  await type(document.querySelector("input[aria-label='Reconciliation evidence']"), "Checked");
  await click(q("[data-engine-reconcile]")); await settle();
  const post = requests.find(request => request.init?.method === "POST")!;
  assert.match(post.url, /\/api\/onlyfans-controls\/accounts\/of-a\/conversations\/of-a%3A42\/requests\/0a1b2c3d-1111-4222-8333-444455556661$/);
  assert.deepEqual(JSON.parse(String(post.init?.body)), { action: "mark_reconciled", expectedRevision: 3, note: "Checked", environment: "live" });
});

test("the account-wide panel says when the list cannot be read instead of showing an empty account", async () => {
  const { default: Panel } = await import("../../components/onlyfans-preview/EngineUnresolved");
  await mount(<Panel accountId="of-a" canAct fetchImpl={async () => new Response(null, { status: 404 })} />);
  await settle();
  assert.match(document.body.textContent ?? "", /list of requests needing review is unavailable/);
  assert.doesNotMatch(document.body.textContent ?? "", /Nothing needs review/);
  await mount(<Panel accountId="of-a" canAct fetchImpl={async () => Response.json({ ...fixture("engine-unresolved-live"), accountId: "of-b" })} />);
  await settle();
  assert.match(document.body.textContent ?? "", /unavailable/);
});

test("only an approved catalogue item is described as can be offered", async () => {
  const { EngineCatalogueList } = await import("../../components/onlyfans-preview/EngineCatalogue");
  const { parseEngineCatalogue } = await import("../../lib/onlyfans/engine-catalogue");
  const page = parseEngineCatalogue(fixture("engine-catalogue"), "of-a")!;
  await mount(<EngineCatalogueList page={page} readOnly={false} loadingMore={false} error={null} onLoadMore={() => {}} onDecide={async () => ({ ok: true })} />);
  const rows = all("[data-engine-catalogue-item]");
  assert.deepEqual(rows.map(row => row.querySelector("[data-engine-offer-text]")?.textContent), ["Not offered yet: needs approval", "Can be offered", "Retired: will not be offered"]);
  assert.equal(all("[data-engine-offer-text]").filter(el => /Can be offered/.test(el.textContent ?? "")).length, 1);
  assert.match(rows[0].textContent ?? "", /6 files/); assert.match(rows[0].textContent ?? "", /beach, bikini/);
  assert.match(rows[0].textContent ?? "", /Proposed price USD 15\.00 NEEDS CONFIRM/);
  assert.match(rows[1].textContent ?? "", /Approved price USD 25\.00/); assert.doesNotMatch(rows[1].textContent ?? "", /NEEDS CONFIRM/);
  assert.match(rows[1].textContent ?? "", /1 file(?!s)/);
  assert.match(rows[2].textContent ?? "", /No tags/);
});

test("approve needs a valid price and an explicit confirmation, then sends exactly that price", async () => {
  const { EngineCatalogueList } = await import("../../components/onlyfans-preview/EngineCatalogue");
  const { parseEngineCatalogue } = await import("../../lib/onlyfans/engine-catalogue");
  const page = parseEngineCatalogue(fixture("engine-catalogue"), "of-a")!;
  const calls: unknown[][] = [];
  await mount(<EngineCatalogueList page={page} readOnly={false} loadingMore={false} error={null} onLoadMore={() => {}} onDecide={async (...args) => { calls.push(args); return { ok: true }; }} />);
  const row = all("[data-engine-catalogue-item]")[0];
  const approve = () => row.querySelector<HTMLButtonElement>("[data-engine-approve]")!;
  assert.equal(approve().disabled, true, "disabled until confirmed");
  await click(row.querySelector("input[type=checkbox]"));
  assert.equal(approve().disabled, false);
  await type(row.querySelector("input[aria-label='Price to approve']"), "2.50");
  assert.equal(approve().disabled, true, "editing the price withdraws the confirmation");
  assert.equal(row.querySelector<HTMLInputElement>("input[type=checkbox]")!.disabled, true, "2.50 is below the USD 3.00 floor");
  await type(row.querySelector("input[aria-label='Price to approve']"), "18.00");
  await click(row.querySelector("input[type=checkbox]"));
  await click(approve());
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][1], { action: "approve", expectedRevision: 0, expectedFingerprint: page.items[0].fingerprint, confirmedPriceCents: 1800 });
  assert.equal(all("[data-engine-catalogue-item]")[1].querySelector("[data-engine-approve]"), null);
  const retire = all("[data-engine-catalogue-item]")[1].querySelector("[data-engine-retire]");
  await click(retire);
  assert.deepEqual(calls[1][1], { action: "retire", expectedRevision: 2, expectedFingerprint: page.items[1].fingerprint });
});

test("a read-only viewer sees the catalogue but no approve or retire control", async () => {
  const { EngineCatalogueList } = await import("../../components/onlyfans-preview/EngineCatalogue");
  const { parseEngineCatalogue } = await import("../../lib/onlyfans/engine-catalogue");
  await mount(<EngineCatalogueList page={parseEngineCatalogue(fixture("engine-catalogue"), "of-a")!} readOnly loadingMore={false} error={null} onLoadMore={() => {}} onDecide={async () => ({ ok: true })} />);
  assert.equal(all("[data-engine-approve],[data-engine-retire]").length, 0);
  assert.equal(all("[data-engine-catalogue-item]").length, 3);
});

test("the catalogue panel reads through the dashboard route, pages, and posts the decision to the manager route", async () => {
  const { default: Catalogue } = await import("../../components/onlyfans-preview/EngineCatalogue");
  const requests: { url: string; init?: RequestInit }[] = [];
  const body = fixture("engine-catalogue");
  const fetchImpl: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    if (init?.method === "POST") return Response.json({ schemaVersion: "of-engine-catalogue.v1", ok: true, outcome: "recorded" });
    const second = String(url).includes("cursor=");
    return Response.json(second ? { ...body, nextCursor: null, items: [{ ...body.items[0], itemId: "14", label: "Later item", revision: 0 }] } : { ...body, nextCursor: "abc" });
  };
  await mount(<Catalogue accountId="of-a" readOnly={false} fetchImpl={fetchImpl} />);
  await settle();
  assert.equal(all("[data-engine-catalogue-item]").length, 3);
  assert.match(requests[0].url, /\/api\/onlyfans\/accounts\/of-a\/engine\/catalogue\?limit=20$/);
  await click(q("[data-engine-load-more]")); await settle();
  assert.equal(all("[data-engine-catalogue-item]").length, 4);
  assert.match(requests[1].url, /cursor=abc/);
  await click(all("[data-engine-catalogue-item]")[1].querySelector("[data-engine-retire]")); await settle();
  const post = requests.find(request => request.init?.method === "POST")!;
  assert.match(post.url, /\/api\/onlyfans-content\/accounts\/of-a\/engine-catalogue\/12$/);
  assert.equal(JSON.parse(String(post.init?.body)).action, "retire");
});

test("the catalogue panel says when it is unavailable and offers a retry", async () => {
  const { default: Catalogue } = await import("../../components/onlyfans-preview/EngineCatalogue");
  await mount(<Catalogue accountId="of-a" readOnly={false} fetchImpl={async () => new Response(null, { status: 404 })} />);
  await settle();
  assert.match(document.body.textContent ?? "", /engine catalogue is unavailable/);
  assert.ok(all("button").some(button => button.textContent === "Retry"));
  assert.equal(all("[data-engine-approve]").length, 0);
});

test("in the inbox the engine labels and order apply, and the older wording stays when there is no engine", async () => {
  const { default: InboxView } = await import("../../components/onlyfans-preview/InboxView");
  const { accounts, conversationDetails } = await import("../../lib/onlyfans-preview/fixtures");
  const account = { ...accounts[0], health: "connected" as const, capabilities: Object.fromEntries(Object.keys(accounts[0].capabilities).map(key => [key, "available"])) as typeof accounts[0]["capabilities"] };
  const base = Object.values(conversationDetails)[0];
  const detail = (engineStatus: unknown) => ({ ...base, accountId: account.accountId, conversationId: `${account.accountId}:42`, engineStatus,
    summary: { ...base.summary, accountId: account.accountId, conversationId: `${account.accountId}:42`, automationMode: "human_controlled" as const, takeoverState: "effective" as const, delivery: "sent" as const }, deliveryIncident: null });
  const render = (value: ReturnType<typeof detail>, loadMore?: (cursor: string) => Promise<unknown>) => mount(<InboxView draftPrincipal="agency-a:staff-a" accountsState={{ status: "ready", data: [account] }} activeAccount={account} activeAccountId={account.accountId}
    onSelectAccount={() => {}} conversations={{ status: "ready", data: { items: [value.summary], nextCursor: null } }} selectedConversationId={value.conversationId} onSelectConversation={() => {}}
    detailState={{ status: "ready", data: value }} viewer={{ kind: "operator", label: "Chatter", canManage: false, canChat: true, scopedAccountIds: [] }} onCommand={() => {}} commandResult={null}
    nextCursor={null} loadingMore={false} onLoadMore={() => {}} showPreviewChrome onEngineLoadMore={loadMore} />);
  const engine = { ...fixture("engine-status-live"), accountId: account.accountId, conversationId: `${account.accountId}:42` };
  await render(detail(engine), async () => ({}));
  const labels = all("[data-of-actions] [data-of-action]").map(el => `${el.getAttribute("data-of-action")}=${el.textContent}`);
  assert.ok(labels.includes("release_takeover=Hand back to engine"), labels.join("|"));
  assert.equal(all("[data-of-actions] [data-of-action]").some(el => /Hand back to AI/.test(el.textContent ?? "")), false);
  assert.ok(q("[data-engine-load-more]"), "the inbox passes the loader through to the panel");
  assert.equal(q("[data-engine-environment]")?.textContent, "Live");
  await render(detail(undefined));
  assert.ok(all("[data-of-actions] [data-of-action]").some(el => el.textContent === "Hand back to AI"));
});
