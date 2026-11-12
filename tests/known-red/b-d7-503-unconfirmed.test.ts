// KNOWN RED (rule b dashboard part; docs/RISKS.md decision D7 / DROP finding Q2): a backend 503 after a write does not
// prove the write was not applied, so it must read "unconfirmed" (refresh first), never "refused" (which invites a second
// action on something that may already have happened). Plan C already does this (plan-c-backend.ts:21); the engine
// operator (engine-operator.ts:36) and catalogue decision (engine-catalogue-backend.ts:16) still call 503 "refused".
// Note for the fix: tests/contracts/facade.test.mjs:47 pins the control path's 503 as "refused"; changing it needs TEST-CHANGE.
// Team's Claude owns the fix. Not wired into npm scripts; init.sh reports it.
import assert from "node:assert/strict";
import test from "node:test";
import { createEngineOperatorBackend } from "../../lib/onlyfans/engine-operator";
import { createEngineCatalogueBackend } from "../../lib/onlyfans/engine-catalogue-backend";
import { createPlanCBackend } from "../../lib/onlyfans/plan-c-backend";
import { newCommandKey } from "../../lib/onlyfans/plan-c";

const unavailable = (async () => new Response(null, { status: 503 })) as typeof fetch;

test("control: a Plan C write answered 503 is unconfirmed", async () => {
  const result = await createPlanCBackend({ baseUrl: "https://backend.invalid", token: "synthetic-token", fetchImpl: unavailable })
    .conversation("of-a", { conversationId: "of-a:1", action: "stop", expectedRevision: 1, commandKey: newCommandKey(), actor: "op-session:synthetic" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.outcome, "unconfirmed");
});

test("D7: an engine operator write answered 503 is unconfirmed, not refused", async () => {
  const result = await createEngineOperatorBackend({ baseUrl: "https://backend.invalid", token: "synthetic-token", fetchImpl: unavailable })({
    accountId: "of-a", conversationId: "of-a:42", requestId: "0a1b2c3d-1111-4222-8333-444455556661", action: "complete", expectedRevision: 5,
    commandKey: "a".repeat(64), actor: "operator:synthetic", note: "checked", environment: "live" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.outcome, "unconfirmed");
});

test("D7: a catalogue decision answered 503 is unconfirmed, not refused", async () => {
  const result = await createEngineCatalogueBackend({ baseUrl: "https://backend.invalid", token: "synthetic-token", fetchImpl: unavailable })("of-a", "123",
    { action: "approve", expectedRevision: 1, expectedFingerprint: "b".repeat(64), confirmedPriceCents: 1200, commandKey: "c".repeat(64), actor: "operator:synthetic" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.outcome, "unconfirmed");
});
