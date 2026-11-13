/**
 * G27: promoted from tests/known-red/W5-app-clones-* (fix-sweep) as a regression guard.
 * Known red (W5 app-clones F3, money; confirms W4 api-admin O17): rowFromForm stores the credit economy with a bare
 * num() (app/clones/actions.ts:523-525): no floor, no integer check, and a non-numeric value silently becomes the
 * fallback (num, :149-154). The bot maps them straight through (twin-bot src/data/supabase-store.ts ~2944) and grants
 * credit_pack_size credits per pack purchase (src/star-reconcile.ts ~1064). The canonical bounds already exist in
 * lib/clone-default-policy.ts NUMBER_RULES but rowFromForm does not use them.
 * Control: valid positive integers are stored as typed (holds).
 * Turns green when the save refuses with an error before the write, or never stores a negative/zero/fractional pack
 * size, pack price or starting balance; non-numeric input must be refused with an error (not defaulted, not dropped).
 */
import { startFakePostgrest } from "./G27-harness";
import assert from "node:assert/strict";
import test from "node:test";
import { withDashboardAccess } from "../../lib/dashboard-access";
import { updateClone } from "../../app/clones/actions";

const CLONE = "cccccccc-3333-4333-8333-333333333333";
let pg!: Awaited<ReturnType<typeof startFakePostgrest>>;
test.before(async () => { pg = await startFakePostgrest(); });
test.after(() => pg.close());

async function save(money: Record<string, string>) {
  pg.reset();
  pg.respond((c) => (c.method === "PATCH" && c.path.endsWith("/clones") ? { status: 204, body: null } : undefined));
  const fd = new FormData();
  fd.set("name", "Test Clone");
  for (const [k, v] of Object.entries(money)) fd.set(k, v);
  let threw: unknown;
  await withDashboardAccess(null, () => updateClone(CLONE, fd)).catch((e) => { threw = e; });
  return { threw, row: pg.calls.find((c) => c.method === "PATCH" && c.path.endsWith("/clones"))?.body };
}

test("control: valid credit economy is stored as typed", async () => {
  const { row } = await save({ starting_credits: "20", credit_pack_size: "30", credit_pack_price_stars: "299" });
  assert.equal(row?.starting_credits, 20);
  assert.equal(row?.credit_pack_size, 30);
  assert.equal(row?.credit_pack_price_stars, 299);
});

// TEST-CHANGE (G27 Flash minor): the cases bundled three invalid fields, so only the first one checked was
// exercised. Now one invalid field per case, each refused by name with no PATCH.
test("negative / zero / fractional credit values are never written (one field per case, refused by name)", async () => {
  for (const [key, value] of [
    ["starting_credits", "-5"], ["starting_credits", "1.5"],
    ["credit_pack_size", "-50"], ["credit_pack_size", "0"], ["credit_pack_size", "2.5"],
    ["credit_pack_price_stars", "0"], ["credit_pack_price_stars", "-1"], ["credit_pack_price_stars", "9.5"],
  ] as const) {
    const { threw, row } = await save({ [key]: value });
    assert.equal(row, undefined, `${key}=${value} reached the PATCH as ${row?.[key]}`);
    assert.match(String((threw as Error | undefined)?.message), new RegExp(key), `${key}=${value} not refused by name`);
  }
});

test("tip_credits_per_100_stars: non-numeric, negative, fractional or over-max refused by name; blank refused; absent omitted", async () => {
  for (const value of ["abc", "-1", "2.5", "100001", ""]) {
    const { threw, row } = await save({ tip_credits_per_100_stars: value });
    assert.equal(row, undefined, `tip_credits_per_100_stars=${JSON.stringify(value)} reached the PATCH as ${row?.tip_credits_per_100_stars}`);
    assert.match(String((threw as Error | undefined)?.message), /tip_credits_per_100_stars/);
  }
  const ok = await save({ tip_credits_per_100_stars: "5" });
  assert.equal(ok.row?.tip_credits_per_100_stars, 5);
  const absent = await save({});
  assert.equal("tip_credits_per_100_stars" in (absent.row ?? {}), false, "absent tip rate was written with a fallback");
});

test("a non-numeric pack price is refused, not silently replaced by the 199 fallback", async () => {
  const { threw, row } = await save({ credit_pack_price_stars: "abc" });
  assert.ok(threw && row === undefined, `save succeeded with credit_pack_price_stars=${row?.credit_pack_price_stars}`);
});

// Codex final P1 on #404: a cleared field used to save the hardcoded fallback (a 1-Star price became 199).
const MONEY_KEYS = ["starting_credits", "credit_pack_size", "credit_pack_price_stars"] as const;

test("a credit field submitted blank refuses the save before any write", async () => {
  for (const key of MONEY_KEYS) {
    const { threw, row } = await save({ [key]: "" });
    assert.ok(threw && row === undefined, `blank ${key} saved as ${row?.[key]}`);
  }
});

test("a credit field absent from the update form is left out of the PATCH (stored value kept)", async () => {
  const { row } = await save({});
  assert.ok(row, "updateClone never reached the PATCH");
  assert.deepEqual(MONEY_KEYS.filter((k) => k in row), [], "absent credit fields were written with a fallback");
});
