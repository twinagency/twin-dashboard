/**
 * Known red (W5 app-clones F3, money; confirms W4 api-admin O17): rowFromForm stores the credit economy with a bare
 * num() (app/clones/actions.ts:523-525): no floor, no integer check, and a non-numeric value silently becomes the
 * fallback (num, :149-154). The bot maps them straight through (twin-bot src/data/supabase-store.ts ~2944) and grants
 * credit_pack_size credits per pack purchase (src/star-reconcile.ts ~1064). The canonical bounds already exist in
 * lib/clone-default-policy.ts NUMBER_RULES but rowFromForm does not use them.
 * Control: valid positive integers are stored as typed (holds).
 * Turns green when the save refuses with an error before the write, or never stores a negative/zero/fractional pack
 * size, pack price or starting balance; non-numeric input must be refused with an error (not defaulted, not dropped).
 */
import { startFakePostgrest } from "./W5-app-clones-harness";
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

test("negative / zero / fractional credit values are never written", async () => {
  for (const money of [
    { starting_credits: "-5", credit_pack_size: "-50", credit_pack_price_stars: "0" },
    { starting_credits: "20", credit_pack_size: "2.5", credit_pack_price_stars: "299" },
  ]) {
  const { threw, row } = await save(money);
  if (row === undefined) { assert.ok(threw, "no PATCH and no error"); continue; } // refused before the write: fixed
  assert.ok(!(row.starting_credits < 0), `starting_credits stored as ${row.starting_credits}`);
  assert.ok(row.credit_pack_size > 0 && Number.isInteger(row.credit_pack_size), `credit_pack_size stored as ${row.credit_pack_size}`);
  assert.ok(row.credit_pack_price_stars > 0, `credit_pack_price_stars stored as ${row.credit_pack_price_stars}`);
  }
});

test("a non-numeric pack price is refused, not silently replaced by the 199 fallback", async () => {
  const { threw, row } = await save({ credit_pack_price_stars: "abc" });
  assert.ok(threw && row === undefined, `save succeeded with credit_pack_price_stars=${row?.credit_pack_price_stars}`);
});
