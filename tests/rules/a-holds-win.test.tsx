/**
 * Rule a (handover/TEAM-BRIEFING.md §7): nothing sends unless every safety check passes; stop, takeover, no-contact,
 * unknown-delivery and budget holds always win. The dashboard never gates a send itself, so its part is:
 *   1. every hold the engine reports is shown as that hold, whatever the request's status or action type;
 *   2. while held, no approve or send control is live (Plan C approve is the only send authority on the screen).
 * Offline: real React in jsdom, the typed Plan C mock behind the real client and proxy. No network.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { after, before } from "node:test";
import React, { act } from "react";
const { JSDOM } = createRequire(import.meta.url)("jsdom");

const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/onlyfans/plan-c" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, MouseEvent: dom.window.MouseEvent, React, IS_REACT_ACT_ENVIRONMENT: true });
let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof createRoot> | undefined;
before(async () => { ({ createRoot } = await import("react-dom/client")); });
after(async () => { await act(async () => root?.unmount()); dom.window.close(); });
const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
async function render(element: React.ReactElement) {
  if (root) await act(async () => root!.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => { root!.render(element); });
  await settle();
}
const all = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)];
const click = async (element: Element) => act(async () => { element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 25)); });
const SEND_CONTROL = /\b(send|approve|resend|retry|deliver)\b/i;

import { engineRequestLabel, parseEngineRequest, type EngineRequestView } from "../../lib/onlyfans/engine-status";
import { MOCK_ACCOUNT, createPlanCMock, seedDraft, seedOffer, type RawDraft, type RawUnresolved } from "../contracts/plan-c-mock-backend";
import { createPlanCProxy } from "../contracts/plan-c-proxy";

const STATUSES = ["open", "waiting_fan", "waiting_provider", "handover_pending", "handover_accepted", "completed", "declined", "cancelled"];
const HOLDS: Array<[string, Partial<EngineRequestView>, string]> = [
  ["no-contact", { nextStep: "no_contact" }, "Contact stopped at the fan’s request"],
  ["unknown delivery", { actionOutcome: "unknown" }, "Delivery outcome needs review"],
  ["earlier delivery unresolved", { nextStep: "review_delivery_dependency" }, "Reply held while an earlier delivery needs review"],
  ["conversation changed", { nextStep: "review_changed_conversation" }, "Reply needs review after the conversation changed"],
  ["access revoked", { nextStep: "review_access_revocation" }, "Access revoked; review required"],
  ["refund or chargeback", { nextStep: "review_refund_or_chargeback" }, "Refund or chargeback needs review"],
];
const request = (n: number, overrides: Partial<EngineRequestView>) => {
  const parsed = parseEngineRequest({ requestId: `12345678-1234-1234-1234-${String(n).padStart(12, "0")}`, sourceMessageId: String(100 + n),
    status: "open", owner: "engine", nextStep: "none", actionOutcome: null, actionType: "reply", revision: 3, ...overrides });
  assert.ok(parsed, `fixture ${n} must parse`);
  return parsed;
};

test("every engine hold is labelled as that hold whatever the status or action type, and no-contact outranks unknown delivery", () => {
  let n = 0;
  for (const [name, hold, label] of HOLDS) for (const status of STATUSES) for (const actionType of ["reply", "offer", null] as const) {
    const row = request(++n, { status, actionType, ...hold });
    assert.equal(engineRequestLabel(row), label, `${name} hold, status ${status}, ${actionType}: the hold must win over the request state`);
  }
  assert.equal(engineRequestLabel(request(++n, { nextStep: "no_contact", actionOutcome: "unknown", status: "completed", actionType: "offer" })), "Contact stopped at the fan’s request");
});

test("a held conversation shows each hold and offers no send, approve or retry control", async () => {
  const { EngineStatus } = await import("../../components/onlyfans-preview/EngineStatus");
  for (const mode of ["active", "paused", "human"] as const) {
    let n = 0;
    const requests = HOLDS.flatMap(([, hold]) => STATUSES.filter(status => !["completed", "declined", "cancelled"].includes(status)).map(status =>
      ({ requestId: `12345678-1234-1234-1234-${String(++n).padStart(12, "0")}`, sourceMessageId: String(n), status, owner: "engine", nextStep: "none",
        actionOutcome: null, actionType: "offer", revision: 2, ...hold })));
    const view = { schemaVersion: "of-engine.v1", state: "current", accountId: "of-a", conversationId: "of-a:42", environment: "live", mode,
      salesMode: "paused", truncated: false, nextCursor: null, requests };
    const actions: string[] = [];
    await render(<EngineStatus value={view} accountId="of-a" conversationId="of-a:42" onTakeover={() => { actions.push("takeover"); }}
      onAction={async (_id, action) => { actions.push(action); return { ok: true }; }} />);
    const rows = all("[data-engine-request]");
    assert.equal(rows.length, requests.length, `${mode}: every held request is on screen`);
    for (const [index, row] of rows.entries()) {
      const label = HOLDS.find(([, hold]) => Object.entries(hold).every(([key, value]) => (requests[index] as Record<string, unknown>)[key] === value))![2];
      assert.equal(row.querySelector("p")?.textContent, label, `${mode}: row ${index} shows its hold`);
    }
    const buttons = all("[data-of-engine-status] button");
    assert.deepEqual(buttons.filter(button => SEND_CONTROL.test(button.textContent ?? "")).map(button => button.textContent), [], `${mode}: no send control while held`);
    for (const button of buttons) if (!(button as HTMLButtonElement).disabled) await click(button);
    assert.deepEqual([...new Set(actions)].filter(action => !["takeover", "request_handover", "accept_handover", "complete", "decline"].includes(action)), [],
      `${mode}: every control on a held request is a handover or resolution, never a send`);
  }
});

/** The backend may list drafts it will not deliver. The dashboard must not offer to approve any of them. */
function listEverything(mock: ReturnType<typeof createPlanCMock>): typeof fetch {
  return (async (input, init) => {
    const response = await mock.fetch(input, init);
    if ((init?.method ?? "GET") !== "GET" || !String(input).endsWith("/drafts")) return response;
    return Response.json({ ...(await response.json()), drafts: mock.state.drafts });
  }) as typeof fetch;
}
async function mountConsole(drafts: RawDraft[], unresolved: RawUnresolved[] = [], authorizationMode: "supervised" | "autonomous" = "supervised") {
  const mock = createPlanCMock({ drafts, unresolved });
  const proxy = createPlanCProxy({ ...mock, fetch: listEverything(mock) });
  const { default: PlanCConsole } = await import("../../components/onlyfans-preview/PlanCConsole");
  await render(<PlanCConsole accountId={MOCK_ACCOUNT} canAct authorizationMode={authorizationMode} fetchImpl={proxy.fetch} />);
  return { mock, proxy };
}

test("Plan C: a held, stopped, superseded, rejected, approved or expired draft has no live approve, and clicking it sends nothing", async () => {
  const held = ["approved", "rejected", "invalidated", "held", "stopped", "superseded", "cancelled"].map((status, index) =>
    seedOffer({ fanId: `90000000010${index}`, status: status as RawDraft["status"] }));
  const expired = seedDraft({ fanId: "900000000199", expiresAt: new Date(Date.now() - 60_000).toISOString() });
  const control = seedDraft({ fanId: "900000000200" });
  const { mock } = await mountConsole([...held, expired, control]);
  const cards = all("[data-plan-c-draft]");
  assert.equal(cards.length, held.length + 2, "every listed draft is shown");
  for (const card of cards) {
    const approve = card.querySelector<HTMLButtonElement>("[data-plan-c-approve]");
    assert.ok(approve, "supervised mode shows the approve control");
    const live = card.getAttribute("data-plan-c-draft") === `${control.requestId}:1`;
    assert.equal(approve.disabled, !live, `${card.getAttribute("data-plan-c-status")} draft: approve must be ${live ? "live" : "disabled"}`);
    if (!live) await click(approve);
  }
  assert.equal(mock.posts().length, 0, "no command left the dashboard for a held draft");
});

test("Plan C: autonomous mode has no approve control, and an unknown send offers only evidence recording that keeps the hold", async () => {
  const unknown: RawUnresolved = { id: "unk-a", kind: "unknown_send", owner: "engine", nextStep: "reconcile_with_provider", summary: "No provider answer.",
    conversationId: `${MOCK_ACCOUNT}:900000000009`, revision: 4, createdAt: new Date().toISOString() };
  await mountConsole([seedDraft()], [unknown], "autonomous");
  assert.equal(all("[data-plan-c-approve]").length, 0);
  const row = document.querySelector<HTMLElement>("[data-plan-c-unresolved='unk-a']");
  assert.ok(row);
  assert.deepEqual([...row.querySelectorAll("button")].map(button => button.textContent), ["Record evidence"]);
  assert.match(row.textContent ?? "", /does not resolve the send or release its hold/);
});
