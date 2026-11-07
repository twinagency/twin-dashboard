import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { appendEnginePage, engineEnvironmentIsReal, engineEnvironmentLabel, engineNextStepText, engineRequestPurchase, isUnresolvedRequest,
  parseEngineStatus, type EngineRequestView } from "../../lib/onlyfans/engine-status";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));
const parse = (value: unknown) => parseEngineStatus(value, "of-a", "of-a:42");
const base: EngineRequestView = { requestId: "0a1b2c3d-1111-4222-8333-444455556661", sourceMessageId: "1", status: "open", owner: "engine", nextStep: "none", actionOutcome: null, actionType: null };

test("simulation, live and fansapi are the only accepted environments, and each is labelled", () => {
  for (const [file, label, real] of [["simulation", "Simulation", false], ["live", "Live", true], ["fansapi", "Live (FansAPI)", true]] as const) {
    const view = parse(fixture(`engine-status-${file}`));
    assert.equal(view?.state, "current");
    if (view?.state !== "current") continue;
    assert.equal(view.environment, file);
    assert.equal(engineEnvironmentLabel(view.environment), label);
    assert.equal(engineEnvironmentIsReal(view.environment), real);
  }
  for (const environment of ["production", "Live", "", "fans_api", null, undefined, 1])
    assert.equal(parse({ ...fixture("engine-status-live"), environment }), null, `rejects ${String(environment)}`);
});

test("a real-shaped backend page keeps its cursor, order and purchase facts", () => {
  const view = parse(fixture("engine-status-live"));
  assert.equal(view?.state, "current");
  if (view?.state !== "current") return;
  assert.equal(view.truncated, true);
  assert.match(view.nextCursor ?? "", /^[A-Za-z0-9_=-]+$/);
  assert.deepEqual(view.requests.map(request => request.status), ["waiting_provider", "waiting_provider", "completed"]);
  assert.equal(view.requests[0].actionOutcome, "unknown");
  assert.equal(view.requests[2].partsTotal, 1);
  const last = parse(fixture("engine-status-live-page2"));
  assert.equal(last?.state === "current" && last.nextCursor, null);
});

test("cursor, page size and duplicates are validated", () => {
  const view = fixture("engine-status-live");
  assert.equal(parse({ ...view, nextCursor: "has spaces" }), null);
  assert.equal(parse({ ...view, nextCursor: "x".repeat(513) }), null);
  assert.equal(parse({ ...view, nextCursor: 5 }), null);
  assert.equal((parse({ ...view, nextCursor: undefined }) as { nextCursor: unknown }).nextCursor, null);
  assert.equal(parse({ ...view, requests: [view.requests[0], view.requests[0]] }), null);
  const many = Array.from({ length: 101 }, (_, i) => ({ ...view.requests[0], requestId: `0a1b2c3d-1111-4222-8333-${String(i).padStart(12, "0")}` }));
  assert.equal(parse({ ...view, requests: many }), null);
  assert.equal(parse({ ...view, requests: many.slice(0, 100) })?.state, "current");
  assert.equal(parseEngineStatus(view, "of-b", "of-a:42"), null);
});

test("pages append without repeating or reordering rows", () => {
  const a = { ...base, requestId: "0a1b2c3d-1111-4222-8333-444455556661" }, b = { ...base, requestId: "0a1b2c3d-1111-4222-8333-444455556662" }, c = { ...base, requestId: "0a1b2c3d-1111-4222-8333-444455556663" };
  assert.deepEqual(appendEnginePage([a, b], [b, c]).map(r => r.requestId), [a.requestId, b.requestId, c.requestId]);
  assert.deepEqual(appendEnginePage([], [c]), [c]);
});

test("unresolved matches the backend's finished set", () => {
  for (const status of ["open", "waiting_fan", "waiting_provider", "handover_pending", "handover_accepted"]) assert.equal(isUnresolvedRequest({ status }), true);
  for (const status of ["completed", "declined", "cancelled"]) assert.equal(isUnresolvedRequest({ status }), false);
});

test("purchase evidence is derived from request state and never overstated", () => {
  const offer = { ...base, actionType: "offer" as const, actionOutcome: "accepted" };
  assert.equal(engineRequestPurchase({ ...offer, status: "waiting_fan", nextStep: "await_purchase_or_question" })?.state, "offered");
  assert.equal(engineRequestPurchase({ ...offer, status: "waiting_provider", nextStep: "verify_access" })?.state, "purchased");
  assert.equal(engineRequestPurchase({ ...offer, status: "completed" })?.state, "unlocked");
  assert.equal(engineRequestPurchase({ ...offer, status: "open", nextStep: "review_refund_or_chargeback" })?.state, "refunded");
  assert.equal(engineRequestPurchase({ ...offer, status: "open", nextStep: "review_access_revocation" })?.state, "held_for_review");
  assert.equal(engineRequestPurchase({ ...base, actionType: "reply", status: "completed" }), null);
  assert.equal(engineRequestPurchase({ ...offer, status: "open", nextStep: "send_next_part" }), null);
  const explicit = parse({ ...fixture("engine-status-live"), requests: [{ ...fixture("engine-status-live").requests[0], purchase: { state: "unlocked", amountCents: 1500, providerTransactionId: "tx-9" } }] });
  assert.equal(explicit?.state === "current" && engineRequestPurchase(explicit.requests[0])?.state, "unlocked");
  for (const purchase of [{ state: "paid" }, { state: "unlocked", amountCents: -1 }, { state: "unlocked", providerTransactionId: "a b" }, "unlocked"])
    assert.equal(parse({ ...fixture("engine-status-live"), requests: [{ ...fixture("engine-status-live").requests[0], purchase }] }), null);
});

test("next steps read as plain language and unknown steps are not hidden", () => {
  assert.equal(engineNextStepText("verify_access"), "Wait for access confirmation");
  assert.equal(engineNextStepText("some_new_step"), "some new step");
});
