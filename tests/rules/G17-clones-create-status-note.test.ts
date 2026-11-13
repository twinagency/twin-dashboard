import "../support/admin-route-env";
// Regression guard (G17): was KNOWN RED tests/known-red/W4-api-admin-plus1-clones-create-status-note.test.ts, fixed in this PR (app/api/admin/v1/clones/create/route.ts). Original header below.
/**
 * KNOWN RED (W4 api-admin-plus1 F7, docs/review/W4/api-admin-plus1.md): POST /api/admin/v1/clones/create answers
 * "status from your payload (default active)" while an omitted status is stored "paused" by rowFromForm
 * (app/clones/actions.ts). Drives the real route; PostgREST faked at the wire (tests/support/admin-wire.ts).
 * Control: an explicit status reaches the insert. Turns green when the note stops claiming active for a paused row.
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

test("control: an explicit status reaches the clones insert", async () => {
  const w = wire();
  try {
    const { status, body } = await create({ status: "paused" });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(inserted(w)[0]?.status, "paused");
  } finally { w.restore(); }
});

test("F7: with status omitted, the success note does not claim the default is active when the row is paused", async () => {
  const w = wire();
  try {
    const { status, body } = await create({});
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(inserted(w)[0]?.status, "paused", "fixture: rowFromForm stores paused when status is omitted");
    assert.doesNotMatch(String(body.note), /default active/i, "note claims default active for a paused clone");
  } finally { w.restore(); }
});
