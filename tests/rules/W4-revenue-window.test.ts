import "../support/admin-route-env"; // server-only shim + fake env: lib/api-read.ts pulls in the assistant allowlist and supabase
/**
 * W4 lib-api-public-v2-plus6 ( F1, F24; docs/review/W4/lib-api-public-v2-plus6.md): lib/api-read.ts
 * parseRevenueWindow, the parser for the internet-facing /api/v1/revenue (and the admin revenue + sim routes). Pure,
 * no wire, no network: the parser is called with URLSearchParams exactly as the routes build them.
 * F1: any finite start <= end is accepted, so `start=0&end=8640000000000000` (Date's max) passes and reaches a
 *   per-day loop (~1e8 iterations in the shared Next process; the cost is INFERRED, the acceptance is MEASURED here).
 *   Fixed = refused: integer ms, start >= 0, end <= now + 366 days, span <= MAX_CUSTOM_RANGE_DAYS. Each guard has its
 *   own case below so planting either one back goes red.
 * F24: `period=` (empty) skips validation and `?? "1M"` keeps "", so period "" reaches getAnalytics. Fixed = either a
 *   400 or the 1M default (fixed: the 1M default, matching how the validation already read an empty period).
 * Control: `period=1M` and a 30-day custom range parse as before.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { isQueryError, parseRevenueWindow } from "../../lib/api-read";
import { MAX_CUSTOM_RANGE_DAYS } from "../../lib/revenue-window";
import { installWire } from "../support/postgrest-wire";

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

test("F1: each bound holds on its own", () => {
  const DAY = 86_400_000;
  const maxSpan = parse(`start=${END - MAX_CUSTOM_RANGE_DAYS * DAY}&end=${END}`);
  assert.ok(!isQueryError(maxSpan), `the widest allowed span is refused: ${JSON.stringify(maxSpan)}`);
  assert.ok(isQueryError(parse(`start=${END - MAX_CUSTOM_RANGE_DAYS * DAY - 1}&end=${END}`)), "span cap");
  assert.ok(!isQueryError(parse(`start=${START}&end=${Date.now() + 30 * DAY}`)), "a future end the date picker allows");
  assert.ok(isQueryError(parse(`start=${Date.now() + 367 * DAY}&end=${Date.now() + 368 * DAY}`)), "end more than a year ahead");
  assert.ok(isQueryError(parse(`start=-${DAY}&end=0`)), "start before 1970");
  assert.ok(isQueryError(parse(`start=${START}.5&end=${END}`)), "fractional ms");
});

test("F8 at the edge: period=CUSTOM without start/end is a 400 here, not a 500 from the resolver", () => {
  assert.ok(isQueryError(parse("period=CUSTOM")));
});

test("F24: an empty period= is refused or defaults to 1M, never period \"\"", () => {
  const r = parse("period=");
  assert.ok(isQueryError(r) || r.period === "1M", `parsed to ${JSON.stringify(r)}`);
});

// rwl r1 (major + minor): /api/dashboard parsed start/end itself (isFinite only), so an agency or creator login could
// send the same unbounded range. It now shares validateCustomRange with the parser above. Drives the real GET; the
// wire answers nothing, so any request that slips past the guard fails as a non-400.
const dashboard = async (qs: string) => {
  const { GET } = await import("../../app/api/dashboard/route");
  const { NextRequest } = await import("next/server");
  const wire = installWire(() => undefined);
  try {
    const res = await GET(new NextRequest(`http://localhost/api/dashboard?${qs}`));
    return { status: res.status, body: (await res.json()) as { error?: string } };
  } finally { wire.restore(); }
};

test("dashboard: an over-cap, reversed or garbage start/end is a 400", async () => {
  for (const qs of [`start=${END - 1200 * 86_400_000}&end=${END}`, `start=${END}&end=${START}`, `start=${START}&end=abc`, `start=${START}`]) {
    const r = await dashboard(qs);
    assert.equal(r.status, 400, `${qs} -> ${r.status} ${JSON.stringify(r.body)}`);
  }
});

test("dashboard: the Date-max range is a 400 (before the fix it reached the day loop)", async () => {
  assert.equal((await dashboard("start=0&end=8640000000000000")).status, 400);
});

test("dashboard: period=CUSTOM without a valid range is a 400, not a 500", async () => {
  for (const qs of ["period=CUSTOM", "period=CUSTOM&start=x&end=y"]) assert.equal((await dashboard(qs)).status, 400, qs);
});
