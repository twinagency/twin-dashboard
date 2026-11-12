/**
 * Characterization (W1 lane 1, "rules that hold" PC3; REVIEW.md invariant 7 D7 "Unconfirmed is not refused", RISKS D7): the Plan C
 * write path (lib/onlyfans/plan-c-backend.ts:21,38-61) is the D7 reference. Only upstream 400/401/403/404/405/409/410/413/422 prove a
 * write was not applied; any other status, an unreadable 2xx body, an ack for another commandKey or a lost connection reads
 * "unconfirmed" with reload. Not duplicated from tests/contracts/plan-c.test.ts (503, 404/410 at :110, garbled ack already there).
 * Fake fetch at the wire (stopAnswered in tests/rules/plan-c-fixtures.ts). Mutation-proven
 * (tests/rules/mutations/W1-lib-onlyfans-plan-c/pc3-*).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PLAN_C_REFUSED_TEXT } from "../../lib/onlyfans/plan-c";
import { CONVERSATION, MOCK_ACCOUNT, PLAN_C_SCHEMA, stopAnswered } from "./plan-c-fixtures";

test("PC3: 429, 5xx, an unreadable 2xx, an ack for another key and a lost connection are unconfirmed with reload", async () => {
  const cases: Array<[string, () => Response | Promise<Response>]> = [
    ...[429, 500, 502, 503, 504].map(status => [`${status}`, () => Response.json({ ok: false }, { status })] as [string, () => Response]),
    ["2xx html", () => new Response("<html>ok</html>", { status: 200 })],
    ["2xx empty", () => new Response(null, { status: 204 })],
    ["2xx ack for another commandKey", () => Response.json({ schemaVersion: PLAN_C_SCHEMA, ok: true, accountId: MOCK_ACCOUNT, conversationId: CONVERSATION, action: "stop", commandKey: "b".repeat(64), recordedRevision: 8 })],
    ["connection reset", () => Promise.reject(new TypeError("connection reset"))],
  ];
  for (const [name, answer] of cases) {
    const result = await stopAnswered(answer);
    assert.equal(result.ok, false, name);
    if (!result.ok) { assert.equal(result.outcome, "unconfirmed", name); assert.equal(result.reload, true, name); }
  }
});

test("PC3: 400, 401, 403, 405, 413 and 422 are refused without reload; 409 is a conflict with reload", async () => {
  for (const status of [400, 401, 403, 405, 413, 422]) {
    const result = await stopAnswered(() => Response.json({ ok: false }, { status }));
    assert.deepEqual(result, { ok: false, outcome: "refused", reload: false, error: PLAN_C_REFUSED_TEXT }, `${status}`);
  }
  const conflict = await stopAnswered(() => Response.json({ ok: false }, { status: 409 }));
  assert.equal(conflict.ok, false); if (!conflict.ok) { assert.equal(conflict.outcome, "conflict"); assert.equal(conflict.reload, true); }
});
