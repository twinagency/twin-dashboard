// KNOWN RED (W4 lib-analytics-data-plus4 F7, F8, F9, docs/review/W4/lib-analytics-data-plus4.md): lib/api-public-query.ts.
// F7: limit=0.5 passes `> 0` and floors to 0, so /api/v1/payments answers an empty page with nextCursor null ("no payments").
// F8: the since<until check runs before the 90-day clamp, so since=2020-01-01&until=2020-06-01 passes and the clamped
//     since lands after until: 200 with an inverted window and zero payments.
// F9: decodeCursor checks `t` by regex only (2026-99-99 passes and reaches Postgres as a 22008), and encodeCursor checks
//     nothing, so an id outside ID_RE yields a cursor the API's own decoder rejects.
// Team's Claude owns the fix. Pure functions, fixed clock, no network.
// Intended runner: init.sh's known-red loop (init.sh:54-56); not wired yet: orchestrator item.
import assert from "node:assert/strict";
import test from "node:test";
import { decodeCursor, encodeCursor, isQueryError, parsePaymentQuery } from "../../lib/api-public-query";

const NOW = Date.parse("2026-11-12T05:00:00Z");
const parse = (qs: string) => parsePaymentQuery(new URLSearchParams(qs), NOW);

test("control: limit=50&since=24h parses to limit 50 with since before until", () => {
  const q = parse("limit=50&since=24h");
  assert.ok(!isQueryError(q), "must parse");
  if (isQueryError(q)) return;
  assert.equal(q.limit, 50);
  assert.ok(Date.parse(q.since) < Date.parse(q.until));
});

test("control: a cursor the API mints from a normal row round-trips", () => {
  const c = { t: "2026-10-09T01:02:03.456Z", i: "abc-123" };
  assert.deepEqual(decodeCursor(encodeCursor(c)), c);
});

test("F7: limit=0.5 is refused or still asks for at least one row", () => {
  const q = parse("limit=0.5");
  assert.ok(isQueryError(q) || q.limit >= 1, `limit=0.5 parsed to limit ${isQueryError(q) ? "?" : q.limit}`);
});

test("F7: a non-numeric, zero or negative limit is refused with 400", () => {
  for (const limit of ["abc", "0", "-5"]) {
    const q = parse(`limit=${limit}`);
    assert.ok(isQueryError(q), `limit=${limit} parsed to limit ${isQueryError(q) ? "?" : q.limit}`);
  }
});

test("F8: a since older than the 90-day floor never yields an inverted window", () => {
  const q = parse("since=2020-01-01&until=2020-06-01");
  assert.ok(isQueryError(q) || Date.parse(q.since) < Date.parse(q.until),
    isQueryError(q) ? "" : `since ${q.since} is after until ${q.until}`);
});

test("F9: a caller-supplied cursor carrying an impossible date is rejected by decodeCursor", () => {
  // Built by hand, as a caller would: a fixed encodeCursor may rightly refuse to mint this one.
  const forged = Buffer.from(JSON.stringify({ t: "2026-99-99T00:00:00Z", i: "x" })).toString("base64url");
  assert.equal(decodeCursor(forged), null, "2026-99-99 reaches Postgres as a 22008 and a 500");
});

test("F9: a caller-supplied cursor carrying a day the month does not have is rejected by decodeCursor", () => {
  const forged = Buffer.from(JSON.stringify({ t: "2026-02-31T00:00:00Z", i: "x" })).toString("base64url");
  assert.equal(decodeCursor(forged), null, "Feb 31 rolls over to Mar 3 in Date.parse; the cursor is not one this API issued");
});

test("F9: every cursor encodeCursor issues is one decodeCursor accepts", () => {
  const c = { t: "2026-10-09T01:02:03.456+00:00", i: "a/b+c" };
  let minted: string;
  try {
    minted = encodeCursor(c);
  } catch {
    return; // refusing to mint an undecodable cursor is a fix too
  }
  assert.notEqual(decodeCursor(minted), null, "the API's own cursor is rejected as 'not one this API issued'");
});
