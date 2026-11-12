// KNOWN RED (W6 app-settings-plus5, finding S1, docs/review/W6/app-settings-plus5.md).
// pushDefaultsToClones (app/settings/actions.ts:197-201) reads the template through getCloneDefaults (:58-68), which
// answers a missing or unparseable `clone_defaults` row with the BUILT-IN defaults. The push then writes those onto
// existing clones (Custom ones included): starting_credits, credit_pack_size, credit_pack_price_stars, discount caps.
// Money values nobody saved. Condition: internal admin presses "Push to selected" while the row is missing or corrupt.
// Fake Supabase client (records the update payload), no network, no DB. Run:
//   node --import tsx --experimental-test-module-mocks --test tests/known-red/W6-app-settings-plus5-push-unsaved-defaults.test.mts
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { withModuleMocks } from "../support/module-mocks-rerun.ts";

// W6 close: init.sh runs plain `node --import tsx --test`; without module mocks this re-runs the file with the flag.
if (withModuleMocks(import.meta.url, { controls: 1, rest: 2 })) {

type Row = { value: string } | null;
let stored: Row = null;
const updates: Record<string, unknown>[] = [];

function query(table: string) {
  const q = {
    select: () => q, eq: () => q, in: () => q, order: () => q,
    maybeSingle: async () => ({ data: table === "app_settings" ? stored : null, error: null }),
    update: (payload: Record<string, unknown>) => { if (table === "clones") updates.push(payload); return q; },
    then: (resolve: (v: { data: unknown; error: null }) => unknown) => resolve({ data: [], error: null }),
  };
  return q;
}

const lib = (p: string) => new URL(`../../lib/${p}`, import.meta.url).href;
mock.module(lib("supabase.ts"), { namedExports: { supabaseAdmin: { from: query } } });
mock.module(lib("agency-management.ts"), { namedExports: { guardDashboardAction: async () => {} } });
mock.module(lib("query-cache.ts"), { namedExports: { invalidateCloneCaches: async () => {} } });
mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });

const { pushDefaultsToClones } = await import("../../app/settings/actions.ts");
const { BUILTIN_CLONE_DEFAULTS } = await import("../../lib/clone-default-policy.ts");

const MONEY = ["starting_credits", "credit_pack_size", "credit_pack_price_stars"] as const;

test("control: a saved template is pushed with its own saved values", async () => {
  updates.length = 0;
  stored = { value: JSON.stringify({ ...BUILTIN_CLONE_DEFAULTS, starting_credits: 7, credit_pack_size: 11, credit_pack_price_stars: 401 }) };
  await pushDefaultsToClones(["clone-1"]);
  assert.equal(updates.length, 1);
  assert.deepEqual(MONEY.map(k => updates[0][k]), [7, 11, 401]);
});

for (const [label, row] of [["missing", null], ["unparseable", { value: "{not json" }]] as const) {
  test(`S1: push with a ${label} clone_defaults row writes no built-in money values onto existing clones`, async () => {
    updates.length = 0;
    stored = row;
    await pushDefaultsToClones(["clone-1"]).catch(() => {}); // refusing (throw) is an acceptable fix
    const written = updates.flatMap(u => MONEY.filter(k => k in u).map(k => `${k}=${String(u[k])}`));
    assert.deepEqual(written, [], `push wrote unsaved built-in values: ${written.join(", ")}`);
  });
}
}
