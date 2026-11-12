// Characterization (W5 lib-revenue-why-changed-plus2; docs/review/W5/lib-revenue-why-changed-plus2.md, Proof).
// Two money rules that hold today, pinned so a regression goes red here instead of reading as a broken known-red:
//   1. ALL starts at the earliest ledger payment (lib/revenue-window.ts resolveRevenueWindow).
//   2. The "What changed" card refuses a partial ledger read instead of diffing a short day
//      (lib/revenue-why-changed.ts loadPurchases, `if (result.truncated) throw`).
// Driven against a fake PostgREST at the fetch wire that honours filters, order and offset/limit, so a planted
// ordering or truncation bug changes the answer. Mutation proofs: tests/rules/mutations/W5-lib-revenue-why-changed-plus2/.
import assert from "node:assert/strict";
import test from "node:test";
import { query, TIMEOUT, withWire, type Handler, type Row } from "./W5-lib-revenue-why-changed-plus2-wire";
import { withDashboardAccess } from "../../lib/dashboard-access";
import { resolveRevenueWindow } from "../../lib/revenue-window";
import { getRevenueWhyChanged, reportDayStartMs } from "../../lib/revenue-why-changed";

const NOW = Date.parse("2026-11-12T23:30:00Z");

test("ALL starts at the earliest ledger payment, whatever order the rows are stored in", async () => {
  // Stored newest first, so a lookup that drops the ascending order (or the order entirely) picks the wrong row.
  const paid = ["2026-01-02T03:04:05.000Z", "2025-08-01T00:00:00.000Z", "2025-03-04T05:06:07.000Z", "2025-06-30T12:00:00.000Z"];
  const rows: Row[] = paid.map((paid_at, i) => ({ id: `tx-${i}`, paid_at }));
  const h: Handler = ({ path, method, url }) => (path === "star_transactions" && method === "GET" ? { status: 200, json: query(rows, url) } : undefined);
  const w = await withWire(h, () => withDashboardAccess(null, () => resolveRevenueWindow("ALL", undefined, NOW)));
  assert.equal(new Date(w.startMs).toISOString(), "2025-03-04T05:06:07.000Z");
  assert.equal(w.endMs, NOW);
});

test("the What changed card refuses a ledger read that failed after its first page", async () => {
  const day = "2026-11-01";
  const at = (i: number) => new Date(reportDayStartMs(day) + 3_600_000 + i * 1000).toISOString();
  const rows: Row[] = Array.from({ length: 1500 }, (_, i) => ({
    id: `tx-${String(i).padStart(6, "0")}`, clone_id: "00000000-0000-4000-8000-000000000001", telegram_id: i,
    amount_stars: 10, paid_at: at(i), kind: "credits", feature: "credits", invoice_payload: "credits",
  }));
  const h: Handler = ({ path, method, url }) => {
    if (path === "star_transactions" && method === "GET") {
      // Page 1 (offset 0) answers; page 2 (offset 1000) times out. The feature probe has no offset.
      return Number(url.searchParams.get("offset") ?? 0) >= 1000 ? TIMEOUT : { status: 200, json: query(rows, url) };
    }
    if (path === "clones") return { status: 200, json: [] };
    if (path === "users") return { status: 200, json: [] };
    if (path.startsWith("rpc/")) return { status: 200, json: path.endsWith("revenue_messaged_fans") ? 0 : [] };
    return undefined;
  };
  const err = console.error;
  console.error = () => {}; // selectAllRows logs the page failure; keep the test output readable
  try {
    await assert.rejects(
      withWire(h, () => withDashboardAccess(null, () => getRevenueWhyChanged(day, null))),
      /Could not safely read/,
      "1000 of 1500 payments must not be diffed as the whole day",
    );
  } finally {
    console.error = err;
  }
});
