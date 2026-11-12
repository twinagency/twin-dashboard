import "../support/admin-route-env"; // server-only shim + fake env: lib/api-read.ts pulls in the assistant allowlist and supabase
/**
 * KNOWN RED (W4 lib-api-public-v2-plus6 F1, F24; docs/review/W4/lib-api-public-v2-plus6.md): lib/api-read.ts
 * parseRevenueWindow, the parser for the internet-facing /api/v1/revenue (and the admin revenue + sim routes). Pure,
 * no wire, no network: the parser is called with URLSearchParams exactly as the routes build them.
 * F1: any finite start <= end is accepted, so `start=0&end=8640000000000000` (Date's max) passes and reaches a
 *   per-day loop (~1e8 iterations in the shared Next process; the cost is INFERRED, the acceptance is MEASURED here).
 *   Fixed = refused (bounded ends and/or a span cap).
 * F24: `period=` (empty) skips validation and `?? "1M"` keeps "", so period "" reaches getAnalytics. Fixed = either a
 *   400 or the 1M default.
 * Control: `period=1M` and a 30-day custom range parse as before.
 * Team's Claude owns the fix. Not wired into npm scripts on purpose.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { isQueryError, parseRevenueWindow } from "../../lib/api-read";

const parse = (qs: string) => parseRevenueWindow(new URLSearchParams(qs));
const START = Date.parse("2026-10-01T00:00:00.000Z");
const END = START + 30 * 86_400_000;

test("control: period=1M and a 30-day custom range parse", () => {
  assert.deepEqual(parse("period=1M"), { period: "1M" });
  assert.deepEqual(parse(""), { period: "1M" });
  assert.deepEqual(parse(`start=${START}&end=${END}`), { period: "CUSTOM", range: { startMs: START, endMs: END } });
  assert.ok(isQueryError(parse("period=1Q")), "an unknown period is refused");
});

test("F1: an unbounded custom range (start=0, end=Date max) is refused", () => {
  const r = parse("start=0&end=8640000000000000");
  assert.ok(isQueryError(r), `accepted a ${Math.round(8.64e15 / 86_400_000)}-day window: ${JSON.stringify(r)}`);
});

test("F24: an empty period= is refused or defaults to 1M, never period \"\"", () => {
  const r = parse("period=");
  assert.ok(isQueryError(r) || r.period === "1M", `parsed to ${JSON.stringify(r)}`);
});
