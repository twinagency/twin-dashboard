// Proves the Revenue page's "Users" tile shows the ALL-TIME fan count, and that
// only "New" moves with the date filter.
//
// THE BUG THIS GUARDS. Ronan, 2026-08-22: "users no matter what time frame
// should always show TOTAL user count all time (same as 24hr reachable). only
// one that changes is NEW users on diff time period."
//
// Before this, the Users tile rendered `s.activeUsers` — fans who MESSAGED in
// the selected window. Picking 1D made the audience appear to shrink to a few
// hundred people. Two tiles on that row now deliberately ignore the filter:
// "Users" (totalFans) and "Reachable now (24h)" (reachable24h).
//
// Two halves, and the source grep is the half that catches the regression:
//
//   1. THE TILE IS WIRED TO totalFans. check-window-tiles.ts already asserts the
//      DATA layer keeps totalFans window-independent, but it never opens the
//      component — the original bug was a correct number on the wrong tile, and
//      no data-layer assertion can see that. So the JSX is read directly.
//
//   2. THE DATA BACKING IT DOES NOT MOVE, and newFans does. Same live-read
//      technique as check-window-tiles.ts, kept here so this file fails on its
//      own if someone window-scopes totalFans in lib/dashboard-data.ts.
//
// PROVEN TO FAIL: change the tile back to `fmtNum(s.activeUsers)` in
// components/RevenueDashboard.tsx and group 1 goes red.
//
// Reads the LIVE database. Run: npm run test:users-tile
import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getDashboard } from "../lib/dashboard-data";

let failures = 0;
function assert(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures += 1;
}

const MS_DAY = 86_400_000;

async function main(): Promise<void> {
  // ── 1. the tile is wired to the all-time count ──────────────────────────────
  console.log("the Users tile reads totalFans, not activeUsers");
  const src = readFileSync(join(__dirname, "..", "components", "RevenueDashboard.tsx"), "utf8");
  // The tile literals are one per line: { label: "Users", value: fmtNum(...) }.
  const tile = (label: string) => {
    const m = src.match(new RegExp(`\\{\\s*label:\\s*"${label}",\\s*value:\\s*([^,}]+)`));
    return m ? m[1].trim() : null;
  };
  const users = tile("Users");
  assert('the "Users" tile exists', users !== null, users ?? "not found");
  assert('"Users" renders s.totalFans', users === "fmtNum(s.totalFans)", users ?? "-");
  const fresh = tile("New");
  assert('"New" still renders s.newFans (the windowed one)', fresh === "fmtNum(s.newFans)", fresh ?? "-");
  // The previous "Net / active" label hid both sides of a useful diagnostic
  // ratio. Its replacement must keep the relationship explicit and must use
  // the selected-period active-fan denominator — never the all-time Users tile.
  assert(
    "the opaque Net / active label is gone",
    !/label:\s*"Net \/ active"/.test(src),
  );
  assert(
    "Revenue / active fan keeps the active-fan denominator",
    /const revenuePerActiveFan = s\.activeUsers > 0 \? displayStars \/ s\.activeUsers : null;/.test(src),
  );
  assert(
    "Revenue / active fan says it uses adjusted revenue",
    /label:\s*"Revenue \/ active fan"[\s\S]{0,220}scope:\s*"after adjustments ÷ active fans"/.test(src),
  );

  // ── 2. totalFans is window-independent and newFans is not ───────────────────
  console.log("\nthe filter moves New and leaves Users alone");
  const endMs = Date.now();
  // Sequential: two revenue_usage_rollup scans at once hit the statement
  // timeout. Same note as check-window-tiles.ts.
  const day = await getDashboard("CUSTOM", { startMs: endMs - MS_DAY, endMs });
  // 7 days, not 30: getDashboard also runs revenue_usage_rollup over
  // usage_events (~330k rows a month) and a 7d window hits the Postgres
  // statement timeout. 7d still holds thousands of arrivals, which is all the
  // movement assertions need.
  const month = await getDashboard("CUSTOM", { startMs: endMs - 7 * MS_DAY, endMs });
  // Not ==: the two reads are ~2s apart and real fans arrive between them. The
  // tolerance is nowhere near the ~57k a window-scoped regression would swing.
  assert(
    "Users (totalFans) is the same on 1d and 7d",
    Math.abs(day.totals.totalFans - month.totals.totalFans) <= 20,
    `day ${day.totals.totalFans} vs 7d ${month.totals.totalFans}`,
  );
  assert(
    "New (newFans) is strictly smaller on 1d than on 7d",
    day.totals.newFans < month.totals.newFans,
    `day ${day.totals.newFans} vs 7d ${month.totals.newFans}`,
  );
  assert(
    "Users is bigger than New over 7d (audience vs arrivals)",
    month.totals.totalFans > month.totals.newFans,
    `${month.totals.totalFans} fans vs ${month.totals.newFans} new`,
  );

  console.log(failures === 0 ? "\nPASS" : `\nFAIL (${failures})`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => {
  console.error(`FAILED: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
