// Offline regression checks for lib/star-dedupe.ts.
//
// Background: a 2026-09 bot bug (fixed in twin-bot 8040422) recorded some real
// Telegram payments TWICE, as two star_transactions rows with different `id`s
// but the same (clone_id, telegram_id, kind, amount_stars, paid_at). 169
// existing duplicate rows (154 groups, ~110k Stars) remain in the table.
// Every SUM/COUNT of star_transactions for revenue/sales/buyers must collapse
// these to one row each (lowest id wins) before summing, while leaving
// refunds netted and never merging two independently real payments that
// happen to share amount/timestamp/kind for different fans or clones.
//
// Run: npm run test:star-dedupe

import { dedupeStarRows, type StarDedupeKeyFields } from "../lib/star-dedupe";
import { hasIndividualReceiptSchema, receiptMayGrantMedia, receiptMayRevokeMedia, withReceiptColumns } from "../lib/star-receipts";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let passed = 0;
const failures: string[] = [];

function check(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures.push(`${name}\n      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function equal(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

type Row = StarDedupeKeyFields & { invoice_payload?: string | null };

const row = (
  id: string,
  clone_id: string,
  telegram_id: number,
  kind: string,
  amount_stars: number,
  paid_at: string,
  invoice_payload: string | null = null,
  receipt_namespace: string | null = null,
): Row => ({ id, clone_id, telegram_id, kind, amount_stars, paid_at, invoice_payload, receipt_namespace });

check("an exact duplicate pair collapses to one row, keeping the lowest id", () => {
  const rows = [
    row("b", "clone-1", 111, "credits", 500, "2026-09-01T00:00:00Z"),
    row("a", "clone-1", 111, "credits", 500, "2026-09-01T00:00:00Z"),
  ];
  const out = dedupeStarRows(rows);
  equal(out.length, 1, "row count");
  equal(out[0].id, "a", "surviving id");
});

check("two real payments, same fan and amount, different second, both counted", () => {
  const rows = [
    row("1", "clone-1", 111, "credits", 500, "2026-09-01T00:00:00.000Z"),
    row("2", "clone-1", 111, "credits", 500, "2026-09-01T00:00:01.000Z"),
  ];
  const out = dedupeStarRows(rows);
  equal(out.length, 2, "row count");
});

check("two verified v2i1 charges at the same fan, price and second both survive", () => {
  const rows = [
    row("v2i1:42:charge-a", "clone-1", 111, "media", 500, "2026-09-01T00:00:00Z", "v2i1:offer-a", "v2i1"),
    row("v2i1:42:charge-b", "clone-1", 111, "media", 500, "2026-09-01T00:00:00Z", "v2i1:offer-b", "v2i1"),
  ];
  const out = dedupeStarRows(rows);
  equal(out.length, 2, "row count");
  equal(out.reduce((sum, item) => sum + Number(item.amount_stars), 0), 1000, "summed Stars");
});

check("the same scoped v2i1 charge id is emitted once", () => {
  const receipt = row("v2i1:42:charge-a", "clone-1", 111, "media", 500, "2026-09-01T00:00:00Z", "v2i1:offer-a", "v2i1");
  const out = dedupeStarRows([receipt, { ...receipt }]);
  equal(out.length, 1, "row count");
});

check("a quarantined v2i1 receipt is retained independently for money reporting", () => {
  const rows = [
    row("v2i1:42:good", "clone-1", 111, "media", 500, "2026-09-01T00:00:00Z", "v2i1:good", "v2i1"),
    row("v2i1:42:mismatch", "clone-1", 111, "other", 500, "2026-09-01T00:00:00Z", "v2i1:bad", "v2i1"),
  ];
  equal(dedupeStarRows(rows).length, 2, "row count");
});

check("distinct v2i1 refunds survive even when amount and time match", () => {
  const rows = [
    row("refund:v2i1:42:charge-a", "clone-1", 111, "other", -500, "2026-09-01T00:05:00Z", "refund", "v2i1"),
    row("refund:v2i1:42:charge-b", "clone-1", 111, "other", -500, "2026-09-01T00:05:00Z", "refund", "v2i1"),
  ];
  const out = dedupeStarRows(rows);
  equal(out.length, 2, "row count");
  equal(out.reduce((sum, item) => sum + Number(item.amount_stars), 0), -1000, "summed Stars");
});

check("an invoice prefix without the persisted namespace keeps legacy dedupe", () => {
  const rows = [
    row("b", "clone-1", 111, "media", 500, "2026-09-01T00:00:00Z", "v2i1:malformed"),
    row("a", "clone-1", 111, "media", 500, "2026-09-01T00:00:00Z", "v2i1:malformed"),
  ];
  const out = dedupeStarRows(rows);
  equal(out.length, 1, "row count");
  equal(out[0].id, "a", "legacy winner");
});

check("only verified v2i1 receipts may grant media while legacy ownership remains unchanged", () => {
  equal(receiptMayGrantMedia({ receipt_namespace: "v2i1", receipt_status: "verified" }), true, "verified receipt");
  equal(receiptMayGrantMedia({ receipt_namespace: "v2i1", receipt_status: "quarantined" }), false, "quarantined receipt");
  equal(receiptMayGrantMedia({ receipt_namespace: "v2i1", receipt_status: "refunded" }), false, "refunded receipt");
  equal(receiptMayGrantMedia({ receipt_namespace: "v2i1", receipt_status: null }), false, "missing status");
  equal(receiptMayGrantMedia({ receipt_namespace: null, receipt_status: null }), true, "legacy receipt");
});

check("only a settled v2i1 refund revokes media while quarantined refund money remains non-entitling", () => {
  equal(receiptMayRevokeMedia({ receipt_namespace: "v2i1", receipt_status: "refunded" }), true, "settled refund");
  equal(receiptMayRevokeMedia({ receipt_namespace: "v2i1", receipt_status: "quarantined" }), false, "quarantined refund");
  equal(receiptMayRevokeMedia({ receipt_namespace: "v2i1", receipt_status: null }), false, "missing status");
  equal(receiptMayRevokeMedia({ receipt_namespace: null, receipt_status: null }), true, "legacy refund");
});

check("every named star_transactions reader that deduplicates money fetches receipt_namespace", () => {
  const files = [
    "lib/agency-access.ts", "lib/analytics-data.ts", "lib/api-public-v2.ts", "lib/dashboard-data.ts",
    "lib/mtproto/attribution.ts", "lib/revenue-why-changed.ts", "lib/star-balance.ts",
    "app/info/page.tsx", "app/users/page.tsx",
  ];
  for (const file of files) {
    const source = readFileSync(resolve(process.cwd(), file), "utf8");
    for (const helper of ["hasIndividualReceiptSchema", "withReceiptColumns"]) {
      if (!source.includes(helper)) throw new Error(`${file} is missing ${helper}`);
    }
  }
});

check("catalogue ownership and rankings read receipt_status before accepting v2i1 media", () => {
  for (const file of ["lib/catalogue-checkout.ts", "lib/catalogue-api.ts"]) {
    const source = readFileSync(resolve(process.cwd(), file), "utf8");
    if (!source.includes("withReceiptColumns") || !source.includes("receiptMayGrantMedia") || !source.includes("receiptMayRevokeMedia")) {
      throw new Error(`${file} does not gate v2i1 media receipts`);
    }
  }
});

check("old-schema column fallback leaves legacy selects unchanged", () => {
  equal(withReceiptColumns("id,amount_stars", false), "id,amount_stars", "legacy columns");
  equal(withReceiptColumns("id,amount_stars", true), "id,amount_stars,receipt_namespace", "aggregate columns");
  equal(withReceiptColumns("id,amount_stars", true, true), "id,amount_stars,receipt_namespace,receipt_status", "ownership columns");
});

const schemaProbeCheck = (async () => {
  try {
    const missingDb = { from: () => ({ select: () => ({ limit: async () => ({ error: { code: "42703", message: "column receipt_namespace does not exist" } }) }) }) };
    equal(await hasIndividualReceiptSchema(missingDb), false, "confirmed old schema");
    const outageDb = { from: () => ({ select: () => ({ limit: async () => ({ error: { code: "08006", message: "connection lost" } }) }) }) };
    let threw = false;
    try { await hasIndividualReceiptSchema(outageDb); } catch { threw = true; }
    equal(threw, true, "outage must not downgrade to legacy mode");
    const unrelatedColumnDb = { from: () => ({ select: () => ({ limit: async () => ({ error: { code: "42703", message: "column unrelated_field does not exist" } }) }) }) };
    threw = false;
    try { await hasIndividualReceiptSchema(unrelatedColumnDb); } catch { threw = true; }
    equal(threw, true, "an unrelated schema error must not downgrade to legacy mode");
    passed += 1;
    console.log("  ✓ schema probing falls back only for confirmed missing columns");
  } catch (error) {
    failures.push(`schema probing falls back only for confirmed missing columns\n      ${error instanceof Error ? error.message : String(error)}`);
  }
})();

check("three-way duplicate (bug fired twice) still collapses to one", () => {
  const rows = [
    row("z", "clone-1", 111, "media", 250, "2026-09-05T12:00:00Z"),
    row("y", "clone-1", 111, "media", 250, "2026-09-05T12:00:00Z"),
    row("x", "clone-1", 111, "media", 250, "2026-09-05T12:00:00Z"),
  ];
  const out = dedupeStarRows(rows);
  equal(out.length, 1, "row count");
  equal(out[0].id, "x", "lowest id wins");
});

check("duplicates are scoped per clone: same fan/amount/time on two clones both survive", () => {
  const rows = [
    row("a", "clone-1", 111, "credits", 500, "2026-09-01T00:00:00Z"),
    row("b", "clone-2", 111, "credits", 500, "2026-09-01T00:00:00Z"),
  ];
  const out = dedupeStarRows(rows);
  equal(out.length, 2, "row count");
});

check("duplicates are scoped per fan: same clone/amount/time for two fans both survive", () => {
  const rows = [
    row("a", "clone-1", 111, "credits", 500, "2026-09-01T00:00:00Z"),
    row("b", "clone-1", 222, "credits", 500, "2026-09-01T00:00:00Z"),
  ];
  const out = dedupeStarRows(rows);
  equal(out.length, 2, "row count");
});

check("a refund row is never merged with anything, even an identical-looking one", () => {
  const rows = [
    row("r1", "clone-1", 111, "credits", 500, "2026-09-01T00:00:00Z", "refund"),
    row("r2", "clone-1", 111, "credits", 500, "2026-09-01T00:00:00Z", "refund"),
  ];
  const out = dedupeStarRows(rows);
  equal(out.length, 2, "row count");
});

check("a negative-amount adjustment row (legacy, no payload) is left alone too", () => {
  const rows = [
    row("r1", "clone-1", 111, "credits", -500, "2026-09-01T00:00:00Z"),
    row("r2", "clone-1", 111, "credits", -500, "2026-09-01T00:00:00Z"),
  ];
  const out = dedupeStarRows(rows);
  equal(out.length, 2, "row count");
});

check("a refund still nets against the paid row it corrects (sum, not count)", () => {
  const rows = [
    row("p1", "clone-1", 111, "credits", 500, "2026-09-01T00:00:00Z"),
    row("r1", "clone-1", 111, "credits", -500, "2026-09-01T00:05:00Z", "refund"),
  ];
  const out = dedupeStarRows(rows);
  equal(out.length, 2, "both rows survive dedupe");
  const net = out.reduce((s, r) => s + (Number(r.amount_stars) || 0), 0);
  equal(net, 0, "net stars after refund");
});

check("a TON row (id starting ton:) is a normal row, dedupe applies to it like any other", () => {
  const rows = [
    row("ton:2", "clone-1", 111, "media", 300, "2026-09-01T00:00:00Z"),
    row("ton:1", "clone-1", 111, "media", 300, "2026-09-01T00:00:00Z"),
  ];
  const out = dedupeStarRows(rows);
  equal(out.length, 1, "row count");
  equal(out[0].id, "ton:1", "lowest id (string-sorted) wins");
});

check("no key columns missing: clone_id/telegram_id/kind/amount_stars/paid_at are all required to match", () => {
  const base = row("a", "clone-1", 111, "credits", 500, "2026-09-01T00:00:00Z");
  const variants: [string, Row][] = [
    ["clone_id differs", { ...base, id: "b", clone_id: "clone-2" }],
    ["telegram_id differs", { ...base, id: "b", telegram_id: 222 }],
    ["kind differs", { ...base, id: "b", kind: "media" }],
    ["amount_stars differs", { ...base, id: "b", amount_stars: 501 }],
    ["paid_at differs", { ...base, id: "b", paid_at: "2026-09-01T00:00:01Z" }],
  ];
  for (const [label, other] of variants) {
    const out = dedupeStarRows([base, other]);
    if (out.length !== 2) throw new Error(`${label}: expected these to stay distinct, got ${out.length} row(s)`);
  }
});

check("dedupe is pure: input array and rows are not mutated", () => {
  const rows = [
    row("b", "clone-1", 111, "credits", 500, "2026-09-01T00:00:00Z"),
    row("a", "clone-1", 111, "credits", 500, "2026-09-01T00:00:00Z"),
  ];
  const snapshot = JSON.stringify(rows);
  dedupeStarRows(rows);
  equal(JSON.stringify(rows), snapshot, "input rows unchanged");
});

check("PLANTED BUG CHECK: this suite fails if dedupe is a no-op (guards against silently disabling it)", () => {
  const rows = [
    row("b", "clone-1", 111, "credits", 500, "2026-09-01T00:00:00Z"),
    row("a", "clone-1", 111, "credits", 500, "2026-09-01T00:00:00Z"),
  ];
  const noop = (r: readonly Row[]) => [...r];
  const out = dedupeStarRows(rows);
  if (out.length === noop(rows).length) {
    // This assertion only fails if dedupeStarRows truly is a no-op AND the
    // fixture below matches; keep it as a live smoke test, not a tautology.
    if (out.length !== 1) throw new Error("dedupe did not collapse the duplicate pair");
  }
});

void schemaProbeCheck.then(() => {
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.error("\nFAILURES:");
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
});
