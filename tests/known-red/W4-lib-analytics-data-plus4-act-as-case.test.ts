// KNOWN RED (W4 lib-analytics-data-plus4 F10, docs/review/W4/lib-analytics-data-plus4.md): lib/api-auth.ts parseActAs
// matches case-insensitively but keeps the caller's case in `kind`, so "CLONE:<uuid>" yields kind "CLONE": it falls
// through `=== "clone"` (app/api/admin/v1/act-as/revenue/route.ts:30) to the agency lookup (404) and logActAs stores
// target_type "CLONE". Team's Claude owns the fix. Pure function, no network.
// Intended runner: init.sh's known-red loop (init.sh:54-56); not wired yet: orchestrator item.
import assert from "node:assert/strict";
import test from "node:test";
import { parseActAs } from "../../lib/api-auth";

const ID = "12345678-1234-4234-8234-123456789abc";
const actAs = (v: string) => parseActAs(new Headers({ "x-twin-act-as": v }));

test("control: lowercase clone:<uuid> parses to kind clone", () => {
  assert.deepEqual(actAs(`clone:${ID}`), { kind: "clone", id: ID });
});

test("F10: CLONE:<uuid> is read as kind clone or refused, never kind CLONE", () => {
  const r = actAs(`CLONE:${ID}`);
  assert.ok(r === null || r.kind === "clone", `kind came back as ${JSON.stringify(r?.kind)}`);
});
