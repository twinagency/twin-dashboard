// Rule (W7 ui-agencyjoin-plus17 F2, HIGH, money). A /settings template save (saveCloneDefaults, app/settings/actions.ts)
// used to write EVERY operational column onto every follower, so an unrelated template edit silently replaced a price, tip
// rate or toggle set on a creator's own page (updateClone, setCloneToggle, /flows). Fix (rwl R1+R2 decisions): the save
// cascades only the fields whose EFFECTIVE value changed, previous = CLONE_DEFAULT_FALLBACKS (what the form shows for an
// absent key) under getCloneDefaults(), read before any write. A related group (wait, bubble, discount levels+tiers)
// cascades whole. The follower UPDATE runs before the template upsert, so a failed save is retried with the same delta.
// Posting the form's own fallback (tip 0) is a no-op; changing a field absent from the stored template (a brake) cascades.
// Switching a creator back to Following default applies the effective template at once; pushDefaultsToClones is unchanged.
// Real action sources transpiled and run against a fake Supabase client (precedent scripts/check-agency-clone-save.ts).
// Run: nice -n 10 node --import tsx --test tests/rules/W7-template-cascades-changed-only.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { beforeEach } from "node:test";
import ts from "typescript";
import * as policy from "../../lib/clone-default-policy";
import * as pricing from "../../lib/pricing";
import * as agencyWrite from "../../lib/agency-write";
import * as settingsFields from "../../app/settings/fields";
import * as toggleFields from "../../app/clones/toggle-fields";

type Row = Record<string, unknown>;
const clones = new Map<string, Row>();
let template: string | null = null;
let cloneWrites: Row[] = [];
let failOn: "update" | "upsert" | null = null;

function query(table: string) {
  let op: "select" | "update" | "upsert" = "select";
  let payload: Row = {};
  const filters: ((r: Row) => boolean)[] = [];
  const run = () => {
    if (op === failOn) return { data: null, error: { message: `fake ${op} error` } };
    if (table === "app_settings") {
      if (op === "upsert") template = String(payload.value);
      return { data: template == null ? null : { value: template }, error: null };
    }
    const rows = [...clones.values()].filter(r => filters.every(f => f(r)));
    if (op === "update") { cloneWrites.push(payload); for (const r of rows) Object.assign(r, payload); }
    return { data: rows.map(r => ({ ...r })), error: null };
  };
  const q: Record<string, unknown> = {
    select: () => q, order: () => q, single: async () => run(), maybeSingle: async () => run(),
    eq: (k: string, v: unknown) => { filters.push(r => r[k] === v); return q; },
    in: (k: string, vs: unknown[]) => { filters.push(r => vs.includes(r[k])); return q; },
    update: (p: Row) => { op = "update"; payload = p; return q; },
    upsert: (p: Row) => { op = "upsert"; payload = p; return q; },
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => { try { return resolve(run()); } catch (e) { return reject(e); } },
  };
  return q;
}

const deps: Record<string, unknown> = {
  "@/lib/supabase": { supabaseAdmin: { from: query } },
  "@/lib/agency-management": { guardDashboardAction: async () => {} },
  "@/lib/dashboard-access": { getDashboardAccess: async () => null },
  "@/lib/compiler": { compileClone: async () => {} },
  "@/lib/query-cache": { invalidateCloneCaches: async () => {} },
  "next/cache": { revalidatePath: () => {} },
  "@/lib/intake": { INTAKE_FIELD_KEYS: [], assembleAnswers: () => "" },
  "@/lib/vibes": { vibePresetFor: () => null },
  "@/lib/clone-default-policy": policy, "@/lib/pricing": pricing, "@/lib/agency-write": agencyWrite,
  "./fields": settingsFields, "./toggle-fields": toggleFields,
};
function load(path: string): Record<string, (...args: never[]) => Promise<unknown>> {
  const source = readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
  const out = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function("require", "exports", out)((name: string) => {
    if (!(name in deps)) throw new Error(`unexpected import in ${path}: ${name}`);
    return deps[name];
  }, exports);
  return exports as Record<string, (...args: never[]) => Promise<unknown>>;
}
const settings = load("app/settings/actions.ts"); deps["@/app/settings/actions"] = settings;
const cloneActions = load("app/clones/actions.ts");
const saveCloneDefaults = settings.saveCloneDefaults as unknown as (fd: FormData) => Promise<{ appliedFollowers: number }>;
const updateClone = cloneActions.updateClone as unknown as (id: string, fd: FormData) => Promise<void>;
const setCloneToggle = cloneActions.setCloneToggle as unknown as (id: string, f: string, v: boolean) => Promise<void>;
const { BUILTIN_CLONE_DEFAULTS } = policy;

const ID = "c1", CUSTOM = "c2";
const MONEY = { credit_pack_price_stars: 499, tip_credits_per_100_stars: 50 };
const seed = (usesDefault: boolean) => clones.set(ID, { id: ID, uses_default_config: usesDefault,
  credit_pack_price_stars: BUILTIN_CLONE_DEFAULTS.credit_pack_price_stars, tip_credits_per_100_stars: 0 });
beforeEach(() => { clones.clear(); template = null; cloneWrites = []; });
// The creator's own Configure save: only the fields this test cares about need to be meaningful.
const configureSave = async () => {
  const fd = new FormData();
  fd.set("name", "Creator"); fd.set("status", "paused");
  for (const [k, v] of Object.entries(MONEY)) fd.set(k, String(v));
  await updateClone(ID, fd);
};
// A /settings save of the template as the form posts it: built-ins, tip 0 (defaultValue ?? 0, CloneDefaultsForm.tsx),
// response_wait_max moved by `waitBump`, plus `extra`.
const templateSave = async (waitBump = 1, extra: Record<string, string> = {}, fail: typeof failOn = null) => {
  const fd = new FormData();
  failOn = fail;
  for (const [k, v] of Object.entries(BUILTIN_CLONE_DEFAULTS)) fd.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  fd.set("tip_credits_per_100_stars", "0");
  fd.set("tips_enabled", "false");
  fd.set("response_wait_max", String(Number(BUILTIN_CLONE_DEFAULTS.response_wait_max) + waitBump));
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  try { return await saveCloneDefaults(fd); } finally { failOn = null; }
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
  await configureSave();
  assert.deepEqual(money(), MONEY, "Configure save wrote the creator's values");
  await templateSave();
  assert.deepEqual(money(), MONEY, "template save overwrote the creator's own price / tip rate set on her Configure page");
});

test("an unrelated template field save keeps her price and tip rate once the template holds them", async () => {
  await templateSave(0); // the stored template now holds every field, tip 0 and price 299 included
  seed(true);
  await configureSave();
  cloneWrites = [];
  assert.equal((await templateSave(2)).appliedFollowers, 1);
  assert.deepEqual(cloneWrites, [{ response_wait_min: BUILTIN_CLONE_DEFAULTS.response_wait_min,
    response_wait_max: Number(BUILTIN_CLONE_DEFAULTS.response_wait_max) + 2 }], "only the changed field (and its pair) is written");
  assert.deepEqual(money(), MONEY);
});

test("a changed template price reaches followers, never a detached creator", async () => {
  await templateSave(0);
  seed(true);
  clones.set(CUSTOM, { id: CUSTOM, uses_default_config: false, credit_pack_price_stars: 777 });
  await configureSave();
  assert.equal((await templateSave(0, { credit_pack_price_stars: "350" })).appliedFollowers, 1);
  assert.deepEqual(money(), { ...MONEY, credit_pack_price_stars: 350 }, "a changed template field is the fleet's latest word");
  assert.equal(clones.get(CUSTOM)!.credit_pack_price_stars, 777, "a detached creator is untouched");
});

test("an unchanged template save writes no clone row", async () => {
  await templateSave(0);
  seed(true);
  cloneWrites = [];
  assert.equal((await templateSave(0)).appliedFollowers, 0);
  assert.deepEqual(cloneWrites, []);
});

test("a toggle set through setCloneToggle on a follower survives an unrelated template save", async () => {
  await templateSave(0); // tips_enabled=false in the template
  seed(true);
  await setCloneToggle(ID, "tips_enabled", true);
  await templateSave(3);
  assert.equal(clones.get(ID)!.tips_enabled, true);
});

test("C1: a failed follower UPDATE leaves the template unchanged, and the retry resends", async () => {
  await templateSave(0);
  seed(true);
  const before = template;
  await assert.rejects(templateSave(5, {}, "update"));
  assert.equal(template, before, "template must not move past followers that never got the change");
  await templateSave(5);
  assert.equal(clones.get(ID)!.response_wait_max, Number(BUILTIN_CLONE_DEFAULTS.response_wait_max) + 5);
});

test("C1: a failed template upsert after the UPDATE throws, and the retry resends the same delta", async () => {
  await templateSave(0);
  seed(true);
  cloneWrites = [];
  await assert.rejects(templateSave(5, {}, "upsert"));
  assert.equal(cloneWrites.length, 1, "followers are written before the template");
  await templateSave(5);
  assert.deepEqual(cloneWrites[1], cloneWrites[0], "retry re-diffs against the unchanged template");
});

test("C2: a brake absent from the stored template reaches followers when changed; its fallback is a no-op", async () => {
  await templateSave(0); // stored template has no push_level / price_guard_mode
  seed(true);
  cloneWrites = [];
  await templateSave(0, { push_level: "medium", price_guard_mode: "block" });
  assert.deepEqual(cloneWrites, [], "posting the value the form shows changes nothing");
  await templateSave(0); assert.deepEqual(cloneWrites, [], "dropping them from the stored template changes nothing either");
  await templateSave(0, { push_level: "low" });
  assert.equal(clones.get(ID)!.push_level, "low");
});

test("C3: switching a creator back to Following default applies the template to her at once", async () => {
  await templateSave(0, { credit_pack_price_stars: "350" });
  clones.set(CUSTOM, { id: CUSTOM, uses_default_config: false, credit_pack_price_stars: 777, personality: "hers" });
  await (settings.setCloneUsesDefault as unknown as (id: string, v: boolean) => Promise<void>)(CUSTOM, true);
  const { uses_default_config, credit_pack_price_stars, personality, category_pricing } = clones.get(CUSTOM)!;
  assert.deepEqual([uses_default_config, credit_pack_price_stars, personality, category_pricing], [true, 350, "hers", undefined]);
});

test("C4: a changed wait max cascades the whole pair (30/20 case)", async () => {
  await templateSave(0);
  seed(true);
  clones.get(ID)!.response_wait_min = 30;
  await templateSave(20 - Number(BUILTIN_CLONE_DEFAULTS.response_wait_max));
  assert.deepEqual([clones.get(ID)!.response_wait_min, clones.get(ID)!.response_wait_max], [BUILTIN_CLONE_DEFAULTS.response_wait_min, 20]);
});

test("C5: the same spoil menu with a different key order is unchanged", async () => {
  await templateSave(0, { spoil_options: '[{"stars":1000,"label":"x"}]' });
  seed(true);
  cloneWrites = [];
  await templateSave(0, { spoil_options: '[{"label":"x","stars":1000}]' });
  assert.deepEqual(cloneWrites, []);
});
