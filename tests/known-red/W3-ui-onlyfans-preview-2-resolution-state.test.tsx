// KNOWN RED (W3 ui-onlyfans-preview-2 P1, data-risk): ActionColumn (InboxView.tsx:543-544, mounted :1001 with no key) keeps the
// chosen `decision` and the typed provider message id across conversation and account switches. One click then resolves attempt B
// with the evidence typed for attempt A. Team's Claude owns the fix (key ActionColumn by account:conversation:attempt).
// Offline: jsdom, fetch stubbed, synthetic ids shaped like engine ids (`${accountId}:fan-N`, plan-c.ts:120-121) except the one
// cross-account collision variant, which needs the same conversationId on two accounts.
import { inNextApp, mount, rerender, stubFetch, json, typeInto, click } from "../helpers/w3-preview2-dom";
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { detailFor, inbox, incident, liveAccount } from "../helpers/w3-preview2-fixtures";

const A = liveAccount("acct-a"), B = liveAccount("acct-b");
const held = { delivery: "unknown" as const };
const convA = `${A.accountId}:fan-1`, convA2 = `${A.accountId}:fan-2`;
const dA = detailFor(A.accountId, convA, { incident: incident("attempt-a1"), summary: held });
const view = (account = A, detail = dA) => inNextApp(inbox({ account, detail, allAccounts: [A, B] }));
const idInput = () => document.querySelector<HTMLInputElement>('input[aria-label="Provider message ID"]');
const resolve = () => document.querySelector<HTMLButtonElement>('[data-of-action="resolve_delivery_evidence"]');

beforeEach(() => { stubFetch(() => json({ ok: false }, 404)); });

const decision = () => document.querySelector('[data-of-decision="delivered"]');
/** Type the provider message id for attempt A. Resolve also needs a decision today, so pick one when the control offers it. */
async function typeEvidenceForA(detail = dA) {
  await mount(view(A, detail));
  await typeInto(idInput(), "123456789");
  const choice = decision();
  if (choice) await click(choice);
}

test("control: incident A renders the evidence form, and typed id + decision enable Resolve", async () => {
  await typeEvidenceForA();
  assert.match(document.querySelector("[data-of-incident]")?.textContent ?? "", /attempt-a1/);
  assert.equal(idInput()?.value, "123456789");
  assert.equal(resolve()?.disabled, false, "Resolve is enabled for attempt A once the id and decision are given");
});

test("P1: switching to another conversation (incident b1) clears the typed id and disables Resolve", async () => {
  await typeEvidenceForA();
  await rerender(view(A, detailFor(A.accountId, convA2, { incident: incident("attempt-b1"), summary: held })));
  assert.match(document.querySelector("[data-of-incident]")?.textContent ?? "", /attempt-b1/, "conversation B's incident is on screen");
  assert.deepEqual({ typedId: idInput()?.value, resolveDisabled: resolve()?.disabled }, { typedId: "", resolveDisabled: true },
    "attempt A's provider message id and decision must not carry over to attempt B (Resolve one click away)");
});

test("P1: same conversationId on another account (incident b1) clears the typed id and disables Resolve", async () => {
  await typeEvidenceForA(detailFor(A.accountId, "conv-1", { incident: incident("attempt-a1"), summary: held }));
  await rerender(view(B, detailFor(B.accountId, "conv-1", { incident: incident("attempt-b1"), summary: held })));
  assert.match(document.querySelector("[data-of-incident]")?.textContent ?? "", /attempt-b1/, "account B's incident is on screen");
  assert.deepEqual({ typedId: idInput()?.value, resolveDisabled: resolve()?.disabled }, { typedId: "", resolveDisabled: true },
    "account A's provider message id and decision must not carry over to account B (Resolve one click away)");
});
