// KNOWN RED (W7 ui-agencyjoin-plus17 finding F2, HIGH, data-risk/money).
// A creator's own Configure save (components/CloneForm.tsx:250-255 -> updateClone, app/clones/actions.ts:1119-1163) writes
// operational money columns (credit_pack_price_stars :525, tip_credits_per_100_stars :529) but never sets
// uses_default_config=false, and the Configure page only labels the creator "Fleet default"
// (components/clone/CreatorControlPlaneShell.tsx:166). The next /settings template save (components/CloneDefaultsForm.tsx:53-62
// -> saveCloneDefaults, app/settings/actions.ts:129-135) cascades every operational column onto every follower, so the
// creator's own price/tip rate is silently replaced. The template hint at CloneDefaultsForm.tsx:143 even says the tip rate
// is "set per creator on its own page".
// Condition: an internal admin or agency manager sets a money value on a creator that still follows the fleet default
// (the normal state, `?? true`); later an internal admin saves /settings for any reason, even an unrelated field.
// Accepted fixes: the Configure save detaches the creator (or refuses the edit while following), or the cascade skips it.
// Fake Supabase client (stateful clones table), no network, no DB. Harness precedent: W6-app-settings-plus5 known-reds.
// Run: nice -n 10 node --import tsx --experimental-test-module-mocks --test tests/known-red/W7-ui-agencyjoin-plus17-fleet-overwrites-creator-money.test.mts
// Team's Claude owns the fix. Not wired into npm scripts.
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { withModuleMocks } from "../support/module-mocks-rerun.ts";

// W7 close: init.sh runs plain `node --import tsx --test`; without module mocks this re-runs the file with the flag.
if (withModuleMocks(import.meta.url, { controls: 1, rest: 1 })) {

type Row = Record<string, unknown>;
const clones = new Map<string, Row>();
let template: string | null = null;

function query(table: string) {
  let op: "select" | "update" | "upsert" = "select";
  let payload: Row = {};
  const filters: ((r: Row) => boolean)[] = [];
  const run = () => {
    if (table === "app_settings") {
      if (op === "upsert") template = String(payload.value);
      return { data: template == null ? null : { value: template }, error: null };
    }
    const rows = [...clones.values()].filter(r => filters.every(f => f(r)));
    if (op === "update") for (const r of rows) Object.assign(r, payload);
    return { data: rows.map(r => ({ ...r })), error: null };
  };
  const q: any = {
    select: () => q, order: () => q, single: async () => run(), maybeSingle: async () => run(),
    eq: (k: string, v: unknown) => { filters.push(r => r[k] === v); return q; },
    in: (k: string, vs: unknown[]) => { filters.push(r => vs.includes(r[k])); return q; },
    update: (p: Row) => { op = "update"; payload = p; return q; },
    upsert: (p: Row) => { op = "upsert"; payload = p; return q; },
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => { try { return resolve(run()); } catch (e) { return reject(e); } },
  };
  return q;
}

const lib = (p: string) => new URL(`../../lib/${p}`, import.meta.url).href;
mock.module(lib("supabase.ts"), { namedExports: { supabaseAdmin: { from: query, storage: { from: () => ({ upload: async () => ({}), remove: async () => ({}) }) } } } });
mock.module(lib("agency-management.ts"), { namedExports: { guardDashboardAction: async () => {} } });
mock.module(lib("dashboard-access.ts"), { namedExports: { getDashboardAccess: async () => null } });
mock.module(lib("compiler.ts"), { namedExports: { compileClone: async () => {} } });
mock.module(lib("query-cache.ts"), { namedExports: { invalidateCloneCaches: async () => {} } });
mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });

const { updateClone } = await import("../../app/clones/actions.ts");
const { saveCloneDefaults } = await import("../../app/settings/actions.ts");
const { BUILTIN_CLONE_DEFAULTS } = await import("../../lib/clone-default-policy.ts");

const ID = "c1";
const MONEY = { credit_pack_price_stars: 499, tip_credits_per_100_stars: 50 };
const seed = (usesDefault: boolean) => {
  clones.clear();
  clones.set(ID, { id: ID, uses_default_config: usesDefault, credit_pack_price_stars: BUILTIN_CLONE_DEFAULTS.credit_pack_price_stars,
    tip_credits_per_100_stars: 0 });
};
// The creator's own Configure save: only the fields this test cares about need to be meaningful.
const configureSave = async () => {
  const fd = new FormData();
  fd.set("name", "Creator"); fd.set("status", "paused");
  for (const [k, v] of Object.entries(MONEY)) fd.set(k, String(v));
  await updateClone(ID, fd);
};
// An unrelated /settings save: the template exactly as built in (the admin only changed, say, a wait time).
const templateSave = async () => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(BUILTIN_CLONE_DEFAULTS)) fd.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  fd.set("tip_credits_per_100_stars", "0"); // the form always posts it: defaultValue ?? 0 (CloneDefaultsForm.tsx:142)
  fd.set("response_wait_max", String(Number(BUILTIN_CLONE_DEFAULTS.response_wait_max) + 1));
  return saveCloneDefaults(fd);
};
const money = () => { const r = clones.get(ID)!; return { credit_pack_price_stars: r.credit_pack_price_stars, tip_credits_per_100_stars: r.tip_credits_per_100_stars }; };

test("control: a Custom creator's own money values survive a template save", async () => {
  seed(false);
  await configureSave();
  assert.deepEqual(money(), MONEY, "Configure save wrote the creator's values");
  assert.equal((await templateSave()).appliedFollowers, 0);
  assert.deepEqual(money(), MONEY);
});

test("HIGH: a creator's own Configure money values are not silently replaced by the next fleet template save", async () => {
  seed(true);
  // Refusing the edit while following the default is an accepted fix, but only a deliberate refusal: a plain Error that
  // leaves the row untouched. A harness/runtime fault (TypeError, ReferenceError, assertion) must not read as fixed.
  let refusal: unknown;
  await configureSave().catch((e) => { refusal = e; });
  if (refusal !== undefined) {
    assert.ok(refusal instanceof Error && refusal.constructor === Error, `configureSave failed for a non-refusal reason: ${String(refusal)}`);
    assert.deepEqual(money(), { credit_pack_price_stars: BUILTIN_CLONE_DEFAULTS.credit_pack_price_stars, tip_credits_per_100_stars: 0 },
      "a refused Configure save must write nothing");
    return;
  }
  assert.deepEqual(money(), MONEY, "Configure save wrote the creator's values");
  await templateSave();
  assert.deepEqual(money(), MONEY, "template save overwrote the creator's own price / tip rate set on her Configure page");
});
}
