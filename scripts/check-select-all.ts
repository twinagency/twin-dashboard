// Guards lib/select-all.ts, the paging used by every fleet-wide roll-up.
//
// The defect this exists for is silence, not slowness: an unpaged PostgREST
// select stops at the server row cap, returns no error, and the caller reports
// a fraction of the fleet as the whole of it. At 39 fans nothing showed. At the
// ~29,800 fans and ~1.22M messages the n8n import brings, every one of those
// roll-ups is wrong on day one.
//
// No database: a fake builder stands in for the query, so this asserts the
// paging arithmetic itself rather than a live table's current size.
//
// Run: npm run test:paging

import { selectAllRows } from "../lib/select-all";

let failures = 0;
function assert(label: string, cond: boolean) {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}`);
    failures += 1;
  }
}

/** A builder that serves `total` rows in pages, exactly as PostgREST would, and
 *  records every range it was asked for. */
function fakeTable(total: number) {
  const ranges: [number, number][] = [];
  return {
    ranges,
    range(from: number, to: number) {
      ranges.push([from, to]);
      const rows = [];
      for (let i = from; i <= to && i < total; i++) rows.push({ i });
      return Promise.resolve({ data: rows, error: null });
    },
  };
}

async function main() {
  console.log("▶️  selectAllRows paging (lib/select-all.ts)\n");

  // The core regression. 2,500 rows is past the 1000-row cap; an unpaged read
  // returns 1000 and claims that is everything.
  {
    const t = fakeTable(2500);
    const { rows, truncated } = await selectAllRows<{ i: number }>(t);
    assert("reads all 2500 rows across the 1000-row cap", rows.length === 2500);
    assert("does not report truncation when it got everything", truncated === false);
    assert("pages in strides of 1000", t.ranges[0][0] === 0 && t.ranges[0][1] === 999);
    assert("rows are not duplicated across pages", new Set(rows.map((r) => r.i)).size === 2500);
  }

  // Import-scale: the real chat_history volume.
  {
    const { rows, truncated } = await selectAllRows<{ i: number }>(fakeTable(1_220_000), { maxRows: 1_500_000 });
    assert("reads 1.22M rows when the ceiling allows", rows.length === 1_220_000);
    assert("1.22M rows is not flagged truncated under a 1.5M ceiling", truncated === false);
  }

  // A short first page means done — no wasted second request.
  {
    const t = fakeTable(12);
    const { rows, truncated } = await selectAllRows<{ i: number }>(t);
    assert("a short page ends the read", rows.length === 12 && truncated === false);
    assert("a short page costs exactly one request", t.ranges.length === 1);
  }

  // An empty table is not a truncated table.
  {
    const { rows, truncated } = await selectAllRows<{ i: number }>(fakeTable(0));
    assert("empty table returns no rows, untruncated", rows.length === 0 && truncated === false);
  }

  // Hitting the ceiling must be visible, never silent. This is the property the
  // whole file is for.
  {
    const { rows, truncated } = await selectAllRows<{ i: number }>(fakeTable(50_000), { maxRows: 3000 });
    assert("stops at the ceiling", rows.length === 3000);
    assert("REPORTS truncation at the ceiling (never silent)", truncated === true);
  }

  // Exactly-on-the-boundary: a full last page with nothing after it. The read
  // must not claim truncation just because the final page came back full.
  {
    const { rows, truncated } = await selectAllRows<{ i: number }>(fakeTable(2000));
    assert("exactly 2000 rows reads fully", rows.length === 2000);
    assert("a full final page with no remainder is not truncated", truncated === false);
  }

  // A mid-read error returns what it has and admits the set is partial, rather
  // than handing back a confident empty array.
  {
    let calls = 0;
    const flaky = {
      range(from: number, to: number) {
        calls += 1;
        if (calls === 2) return Promise.resolve({ data: null, error: { message: "connection reset" } });
        const rows = [];
        for (let i = from; i <= to; i++) rows.push({ i });
        return Promise.resolve({ data: rows, error: null });
      },
    };
    const { rows, truncated } = await selectAllRows<{ i: number }>(flaky);
    assert("a failed page keeps the rows already read", rows.length === 1000);
    assert("a failed page is reported as truncated", truncated === true);
  }

  console.log(failures === 0 ? "\n✅ paging checks passed" : `\n❌ ${failures} paging check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
