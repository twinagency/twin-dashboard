import "../support/admin-route-env";
/**
 * Rule (REVIEW.md inv 7, "A STOP is never harder to trigger than a go"): POST /api/admin/v1/mtproto/write
 * `global_stop` needs no confirm phrase and lands in ONE call (the flag reads back "true"), while lifting it still
 * needs the typed RESUME phrase. Drives the real route and lib/mtproto/global-stop.ts; PostgREST faked at the wire
 * (tests/support/admin-wire.ts). W4 api-admin-plus1 characterization.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { adminRequest, installWire } from "../support/admin-wire";
import { POST } from "../../app/api/admin/v1/mtproto/write/route";
import { GLOBAL_STOP_KEY } from "../../lib/mtproto/types";

const write = (json: Record<string, unknown>) => POST(adminRequest("/api/admin/v1/mtproto/write", { json }));
const flag = (w: ReturnType<typeof installWire>) => w.tables.app_settings?.find((r) => r.key === GLOBAL_STOP_KEY)?.value;

test("global_stop with no confirm phrase stops the fleet in one call", async () => {
  const w = installWire({ tables: { app_settings: [{ key: GLOBAL_STOP_KEY, value: "false" }] }, keys: { app_settings: ["key"] } });
  try {
    const res = await write({ action: "global_stop" });
    const body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.stopped, true);
    assert.equal(flag(w), "true");
    assert.equal(w.rest("reengage_events", "POST").length, 1, "the stop is audited");
  } finally { w.restore(); }
});

test("lifting the stop without the RESUME phrase is refused and the fleet stays stopped", async () => {
  const w = installWire({ tables: { app_settings: [{ key: GLOBAL_STOP_KEY, value: "true" }] }, keys: { app_settings: ["key"] } });
  try {
    const res = await write({ action: "global_resume" });
    assert.equal(res.status, 400);
    assert.equal(flag(w), "true");
  } finally { w.restore(); }
});
