// KNOWN RED (B1, docs/RISKS.md): a completed offer with NO purchase evidence (operator "Mark completed"
// with a note) is shown as "Purchase and access confirmed" / unlocked. Team's Claude owns the fix.
// Not wired into npm scripts on purpose; init.sh runs it and reports the state.
import assert from "node:assert/strict";
import test from "node:test";
import { engineRequestLabel, engineRequestPurchase, parseEngineStatus } from "../../lib/onlyfans/engine-status.ts";

const base = { sourceMessageId: "1", status: "completed", owner: "engine", nextStep: "none", actionOutcome: "completed" };
const view = (request) => ({ schemaVersion: "of-engine.v1", state: "current", accountId: "of-a", conversationId: "of-a:42",
  environment: "simulation", mode: "active", salesMode: "paused", truncated: false, requests: [request] });
const parse = (request) => parseEngineStatus(view(request), "of-a", "of-a:42")?.requests[0];

test("control: completed reply parses and reads 'Reply completed'", () => {
  const r = parse({ ...base, requestId: "12345678-1234-1234-1234-123456789abd", actionType: "reply" });
  assert.ok(r, "fixture must parse");
  assert.equal(engineRequestLabel(r), "Reply completed");
});

test("B1: completed offer without purchase evidence is not shown as purchased/unlocked", () => {
  const r = parse({ ...base, requestId: "12345678-1234-1234-1234-123456789abc", actionType: "offer" });
  assert.ok(r, "fixture must parse");
  assert.equal(r.purchase, undefined);
  assert.notEqual(engineRequestLabel(r), "Purchase and access confirmed");
  assert.notEqual(engineRequestPurchase(r)?.state, "unlocked");
});
