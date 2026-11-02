// Offline regression checks for the dashboard's revenue-ledger definitions.
//
// Net proceeds intentionally retain every signed row. Orders, buyers and
// repeat rate intentionally do not: a refund/adjustment is evidence of a
// ledger correction, not another purchase.
//
// Run: npm run test:ledger

import { classifyRevenueLedgerRow, repeatBuyerCount, rollupRevenueLedger } from "../lib/revenue-ledger";

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
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const row = (
  id: string,
  clone_id: string,
  telegram_id: number | null,
  amount_stars: number,
  invoice_payload: string | null = null,
) => ({ id, clone_id, telegram_id, amount_stars, invoice_payload });

console.log("dashboard revenue ledger\n");

check("L1 a payment plus a refund keeps net proceeds signed but creates one order and buyer", () => {
  const ledger = rollupRevenueLedger([
    row("payment", "tucci", 101, 1_000),
    row("refund", "tucci", 101, -400, "refund"),
  ]);

  equal(ledger.netStars, 600, "signed net proceeds");
  equal(ledger.grossPaymentStars, 1_000, "positive paid-order Stars");
  equal(ledger.sales, 1, "paid orders");
  equal(ledger.cloneSales.get("tucci"), 1, "creator paid orders");
  equal(ledger.cloneGrossPaymentStars.get("tucci"), 1_000, "creator gross paid-order Stars");
  equal(ledger.fleetPaidOrdersPerFan.size, 1, "buyers");
  equal(repeatBuyerCount(ledger.fleetPaidOrdersPerFan), 0, "repeat buyers");
});

check("L2 refund payloads and negative rows are adjustments even when their signed value differs", () => {
  const positiveRefund = classifyRevenueLedgerRow({ amount_stars: 50, invoice_payload: " refund " });
  equal(positiveRefund.adjustment, true, "refund payload is an adjustment");
  equal(positiveRefund.paidOrder, false, "refund payload is not a paid order");

  const legacyNegative = classifyRevenueLedgerRow({ amount_stars: -50, invoice_payload: null });
  equal(legacyNegative.adjustment, true, "negative ledger row is an adjustment");
  equal(legacyNegative.paidOrder, false, "negative ledger row is not a paid order");
});

check("L3 repeat buyers need two positive non-adjustment payments", () => {
  const ledger = rollupRevenueLedger([
    row("first", "autumn", 202, 100),
    row("adjustment", "autumn", 202, -100, "refund"),
    row("second", "autumn", 202, 200),
  ]);

  equal(ledger.netStars, 200, "signed net proceeds");
  equal(ledger.grossPaymentStars, 300, "paid-order Stars");
  equal(ledger.sales, 2, "two paid orders");
  equal(ledger.fleetPaidOrdersPerFan.size, 1, "one buyer");
  equal(repeatBuyerCount(ledger.fleetPaidOrdersPerFan), 1, "one repeat buyer");
});

console.log(`\n  ${passed} passed`);
for (const failure of failures) console.error(`  ✗ ${failure}`);
console.log(failures.length === 0 ? "\nALL PASS" : `\n${failures.length} FAILURE(S)`);
process.exit(failures.length === 0 ? 0 : 1);
