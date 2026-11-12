import "../support/admin-route-env";
/**
 * KNOWN RED (W4 api-admin-plus1 F4, docs/review/W4/api-admin-plus1.md): POST /api/admin/v1/clones/create forwards
 * every body key verbatim over the validated defaults into rowFromForm, so money values, the price brake and
 * fan-facing paywall text reach the clones insert unchecked, skipping validateCloneDefaultsForWrite
 * (lib/clone-default-policy.ts) and contradicting clones/write ("money ... not writable through this API").
 * Cases do not lean on any DB CHECK (unread): besides 0, a value a numeric column would happily store but the policy
 * bounds reject (starting_credits 200000 > max 100000), price_guard_mode "off" (a valid CHECK value, the brake
 * removed) and paywall_instruction (free text a fan reads).
 * Drives the real route; PostgREST faked at the wire (tests/support/admin-wire.ts), assertions on the insert body.
 * Control: a plain create reaches the insert with the caller's name and the price brake on.
 * Turns green on 400 for the key, or 200 with the value not written. A 500 stays red.
 * Team's Claude owns the fix. Not wired into npm scripts on purpose.
 */
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import { adminRequest, callJson, inNextRoute, installWire } from "../support/admin-wire";
import { POST } from "../../app/api/admin/v1/clones/create/route";

const wire = () => installWire({ defaults: { clones: () => ({ id: randomUUID() }) } });
const create = (extra: Record<string, unknown>) =>
  inNextRoute("/api/admin/v1/clones/create", () =>
    callJson(POST, adminRequest("/api/admin/v1/clones/create", { json: { name: "Wire Test", bot_token: "999999:" + "x".repeat(20), ...extra } })));
const inserted = (w: ReturnType<typeof wire>) => w.rest("clones", "POST").map((c) => c.body as Record<string, unknown>);

test("control: a plain create reaches the clones insert with the caller's name and the price brake on", async () => {
  const w = wire();
  try {
    const { status, body } = await create({ status: "paused" });
    assert.equal(status, 200, JSON.stringify(body));
    const rows = inserted(w);
    assert.equal(rows.length, 1, "harness reaches createCloneRow's insert");
    assert.equal(rows[0].name, "Wire Test");
    assert.notEqual(rows[0].price_guard_mode, "off", "fixture: the default keeps the price brake on");
  } finally { w.restore(); }
});

const CASES: [string, unknown][] = [
  ["credit_pack_price_stars", 0],
  ["starting_credits", 200000],
  ["price_guard_mode", "off"],
  ["paywall_instruction", "Fake paywall line a fan would read"],
];
for (const [field, value] of CASES) {
  test(`F4: ${field}=${JSON.stringify(value)} from the body is refused (400) or never reaches the insert`, async () => {
    const w = wire();
    try {
      const { status, body } = await create({ [field]: value });
      const landed = inserted(w).some((r) => r[field] === value);
      assert.ok(status === 400 || (status === 200 && !landed), `${field}=${JSON.stringify(value)}: status ${status}, written ${landed} ${JSON.stringify(body).slice(0, 200)}`);
    } finally { w.restore(); }
  });
}
