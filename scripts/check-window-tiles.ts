// Proves the Revenue stat tiles actually obey the date filter.
//
// THE BUG THIS GUARDS. The Revenue page's period filter (1D/1W/.../ALL + custom
// range) re-fetched correctly, and five of the eleven tiles ignored the result:
// Users, Active (24h), Messages, Buyers and Repeat rate were all lifetime
// figures. Switching 1D → ALL moved six tiles and left five frozen, which reads
// as "nothing happened today" rather than "this tile can't answer that".
// Reported by Ronan 2026-08-21. Fixed by migration 122
// (revenue_clone_user_stats_window) plus deriving buyers/repeat from the
// star_transactions rows lib/dashboard-data.ts already scopes to the window.
//
// Two things are asserted, and the first one is the regression guard:
//
//   1. THE NUMBERS MOVE. A 1-day window is a strict subset of a 5-year one, and
//      there is real volume in both (~20k chat_history rows/day against 271k
//      all-time). So every one of the five must come back strictly smaller on
//      the day window. If anyone repoints these at an all-time rollup again,
//      day == all and this goes red immediately. This is the assertion that
//      would have caught the original bug; a value check alone would not have,
//      because the lifetime numbers were internally consistent — just answering
//      the wrong question.
//
//   2. THE NUMBERS ARE RIGHT. Each of the five is recomputed here from raw rows
//      over a different code path (PostgREST filters + counting in JS, versus
//      the SQL aggregate the page uses) and asserted to match exactly.
//
// Both windows are passed as an explicit CUSTOM range rather than a named
// period, so getDashboard() and this file bound their reads at the same two
// instants and an exact comparison is meaningful. Named periods compute
// `now` inside getDashboard, which would leave a few hundred ms of drift and
// force a tolerance — a tolerance is where a real off-by-a-window hides.
//
// PAGED READS ARE ORDERED BY id. check-revenue-rollups.ts learned this the hard
// way: .range() paging over a live table that is being inserted into repeats and
// skips rows, and chat_history takes ~1,300 inserts an hour.
//
// PROVEN TO FAIL: see the header of the repo's prove step — swapping
// cloneUserStatsWindow(startMs, windowEnd) back to the migration-120
// cloneUserStats(dayAgo) in lib/dashboard-data.ts turns assertion group 1 red
// on users/active/messages (day == all), which is exactly the shipped bug.
//
// Reads the LIVE database. Run: npm run test:tiles
import "dotenv/config";
import { getDashboard } from "../lib/dashboard-data";
import { supabaseAdmin } from "../lib/supabase";
import { selectAllRows } from "../lib/select-all";

let failures = 0;
function assert(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures += 1;
}
function eq(label: string, got: number, want: number) {
  const ok = got === want;
  assert(label, ok, ok ? `${got}` : `page ${got} vs raw ${want}`);
}
function lt(label: string, day: number, all: number) {
  const ok = day < all;
  assert(label, ok, ok ? `${day} < ${all}` : `day ${day} vs all ${all} — tile is not windowed`);
}

const MS_DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

/** Fans whose last_message_received falls in [startMs, endMs], counted from raw
 *  rows rather than through the SQL rollup — the independent side of the
 *  comparison. Called either side of the page's own read; see the bracketing
 *  note at the call site. */
async function rawActiveCount(startMs: number, endMs: number, cloneIds: string[]): Promise<number> {
  const { rows } = await selectAllRows<{
    id: string;
    legacy_id: string | null;
    first_seen_at: string;
    last_message_received: string | null;
  }>(
    supabaseAdmin
      .from("users")
      .select("id,legacy_id,first_seen_at,last_message_received")
      .in("clone_id", cloneIds)
      .gte("last_message_received", iso(startMs))
      .lte("last_message_received", iso(endMs))
      .order("id", { ascending: true }),
    { label: "users last_message_received in window" },
  );
  // The forged-stamp exclusion (migration 124), reimplemented here rather than
  // reused: PostgREST cannot compare two columns to each other, so this is done
  // in JS over the raw rows. That is the point of this file — the page's number
  // has to be reproducible by something that is not the page's own SQL.
  return rows.filter(
    (r) =>
      !(r.legacy_id !== null && r.last_message_received !== null &&
        new Date(r.last_message_received).getTime() < new Date(r.first_seen_at).getTime()),
  ).length;
}

/** The clone ids getDashboard totals over — it sums perClone, which is keyed off
 *  the clones table, so the raw reads have to be restricted the same way. */
async function fleetCloneIds(): Promise<string[]> {
  const { data } = await supabaseAdmin.from("clones").select("id");
  return (data ?? []).map((c) => c.id as string);
}

async function main(): Promise<void> {
  const endMs = Date.now();
  const dayStartMs = endMs - MS_DAY;
  // 30 days, not "everything": getDashboard also runs revenue_usage_rollup over
  // usage_events, which is ~330k rows a month and hits the Postgres statement
  // timeout somewhere past a few months. 30d is still a strict superset of 1d
  // with ~600k chat rows and a month of buyers in it, which is all the movement
  // assertions need — the point is that the window is respected, not that it is
  // enormous.
  const allStartMs = endMs - 30 * MS_DAY;

  console.log(`stat tiles, day window ${iso(dayStartMs)} → ${iso(endMs)}\n`);

  // `active` counts users.last_message_received inside the window, and that
  // column is UPDATED in place on every inbound message. A fan whose previous
  // message was inside the window and who messages again NOW gets stamped past
  // windowEnd and drops out of the count — so `active` drifts DOWNWARD while
  // this check runs, and it is the only one of the five that can. (first_seen_at
  // never changes; chat_history is insert-only with timestamps past windowEnd;
  // star_transactions likewise.)
  //
  // So `active` is bracketed rather than compared once: a raw read either side
  // of the page's own read, asserting the page's number sits between them. That
  // is the same technique check-revenue-rollups.ts uses, and for the same
  // reason — the difference is the table moving, not the definition. Comparing
  // it to a single raw read taken seconds later is a flaky check, and a flaky
  // check gets ignored, which is worse than not having one.
  const cloneIds = await fleetCloneIds();
  const activeBefore = await rawActiveCount(dayStartMs, endMs, cloneIds);

  // SEQUENTIAL, not Promise.all. Two getDashboard() calls at once put two
  // revenue_usage_rollup scans of usage_events on the pooler simultaneously and
  // both hit the statement timeout — which surfaces as "migration 120 must be
  // applied", a genuinely misleading error. One at a time each take ~2s.
  const day = await getDashboard("CUSTOM", { startMs: dayStartMs, endMs });
  const activeAfter = await rawActiveCount(dayStartMs, endMs, cloneIds);
  const all = await getDashboard("CUSTOM", { startMs: allStartMs, endMs });

  // ── 1. the tiles move with the window ───────────────────────────────────────
  console.log("the window changes the numbers");
  lt("new", day.totals.newFans, all.totals.newFans);
  lt("users (messaged in window)", day.totals.activeUsers, all.totals.activeUsers);
  lt("messages", day.totals.messages, all.totals.messages);
  lt("buyers", day.totals.buyers, all.totals.buyers);
  // ...and the one that must NOT move. Telegram's 24h business-bot messaging
  // window is who the fleet can reach right now; it is not a fact about the
  // selected period, and a filter that changed it would be actively misleading
  // about who can legally be messaged. This is the inverse of every other
  // assertion here and it is deliberate.
  // NOT asserted as exact equality between the two calls: each getDashboard()
  // takes its own now(), the two run ~2s apart, and fans cross the 24h boundary
  // continuously — so an == here would be the same flaky check as the one
  // bracketed above. Asserted instead by its defining property: on a 30-day
  // window a 24h figure MUST come in under the 30-day active count. If anyone
  // repoints this at the window, the two become equal and this goes red.
  assert(
    "reachable24h ignores the window (Telegram's 24h messaging limit)",
    all.totals.reachable24h < all.totals.activeUsers,
    `24h reachable ${all.totals.reachable24h} vs 30d active ${all.totals.activeUsers}`,
  );
  // And on a 1-day window the two are measuring almost the same span, so they
  // should land within a couple of percent of each other. 2% of ~870 is ~17
  // fans, comfortably above the handful that cross the boundary mid-run.
  const spread = Math.abs(day.totals.reachable24h - day.totals.activeUsers);
  assert(
    "reachable24h ≈ active on a 1-day window (same span, two clocks)",
    spread <= Math.max(5, day.totals.activeUsers * 0.02),
    `reachable ${day.totals.reachable24h} vs active ${day.totals.activeUsers}, spread ${spread}`,
  );
  // totalFans is the audience size, not a fact about a period, so it must not
  // move either. Both calls read migration 120's all-time rollup, ~2s apart, so
  // a handful of genuinely new fans can land between them — hence a small
  // absolute tolerance rather than ==, and it is nowhere near the ~57k a
  // window-scoped regression would swing it by.
  assert(
    "totalFans ignores the window (it is the audience, not a period)",
    Math.abs(day.totals.totalFans - all.totals.totalFans) <= 20,
    `day ${day.totals.totalFans} vs all ${all.totals.totalFans}`,
  );
  // THE CUTOVER GUARD (migration 123). 57,164 fans were bulk-inserted on
  // 2026-08-08 and every one carries first_seen_at = that day, so before the
  // legacy_id filter a 30-day window reported ~65,360 arrivals against a fleet
  // of ~65,366 — "everyone joined this month". Real signups run 400-770 a day,
  // so 30 days of them cannot approach the fleet size. If the filter is ever
  // dropped, this is the assertion that says so.
  assert(
    "new over 30d is real signups, not the cutover import",
    all.totals.newFans < all.totals.totalFans * 0.5,
    `30d new ${all.totals.newFans} vs ${all.totals.totalFans} fans on the fleet`,
  );
  // Repeat rate is a ratio, so "smaller" is not the property — "not frozen" is.
  // Over a single day almost nobody buys twice; over five years plenty do.
  assert(
    "repeat rate differs between the two windows",
    day.totals.repeatPct !== all.totals.repeatPct,
    `day ${(day.totals.repeatPct * 100).toFixed(2)}% vs all ${(all.totals.repeatPct * 100).toFixed(2)}%`,
  );

  // ── 2. the day window's numbers are correct ─────────────────────────────────
  // Recomputed from raw rows, restricted to the same clone set getDashboard
  // totals over (it sums perClone, which is keyed off the clones table).
  console.log("\nthe day window's numbers match a raw read");

  const { rows: joined } = await selectAllRows<{ id: string }>(
    supabaseAdmin
      .from("users")
      .select("id")
      .in("clone_id", cloneIds)
      .is("legacy_id", null)
      .gte("first_seen_at", iso(dayStartMs))
      .lte("first_seen_at", iso(endMs))
      .order("id", { ascending: true }),
    { label: "users first_seen in window" },
  );
  eq("new = fans who ARRIVED in the window, imports excluded", day.totals.newFans, joined.length);

  // BRACKETED, not compared once — see the note at the activeBefore read above.
  // The two reference reads straddle the page's own, so the assertion is "the
  // page's number is one this table actually held while it was being read",
  // which is the strongest true statement available about a column that is
  // being overwritten ~20 times a minute. Drift is one-directional (fans leave
  // the window as they message again), so `before` is the upper bound.
  const lo = Math.min(activeBefore, activeAfter);
  const hi = Math.max(activeBefore, activeAfter);
  assert(
    "active = fans who messaged in the window",
    day.totals.activeUsers >= lo && day.totals.activeUsers <= hi,
    `page ${day.totals.activeUsers}, raw bracket ${lo}..${hi}`,
  );

  const { rows: chatRows } = await selectAllRows<{ id: number }>(
    supabaseAdmin
      .from("chat_history")
      .select("id")
      .in("clone_id", cloneIds)
      .gte("created_at", iso(dayStartMs))
      .lte("created_at", iso(endMs))
      .order("id", { ascending: true }),
    { label: "chat_history in window" },
  );
  eq("messages = chat_history rows in the window", day.totals.messages, chatRows.length);

  // Buyers and repeat rate come off the same ledger the Transactions tile does.
  // Rows with no telegram_id can't be attributed to a person and so can't make
  // one a buyer — the page skips them here too.
  const { rows: txRows } = await selectAllRows<{ id: string; telegram_id: number | null }>(
    supabaseAdmin
      .from("star_transactions")
      .select("id,telegram_id")
      .gte("paid_at", iso(dayStartMs))
      .lte("paid_at", iso(endMs))
      .order("id", { ascending: true }),
    { label: "star_transactions in window" },
  );
  const txPerFan = new Map<number, number>();
  for (const t of txRows) {
    if (t.telegram_id == null) continue;
    txPerFan.set(t.telegram_id, (txPerFan.get(t.telegram_id) ?? 0) + 1);
  }
  let repeatBuyers = 0;
  for (const count of txPerFan.values()) if (count > 1) repeatBuyers += 1;
  eq("buyers = distinct fans who paid in the window", day.totals.buyers, txPerFan.size);
  const wantRepeat = txPerFan.size > 0 ? repeatBuyers / txPerFan.size : 0;
  assert(
    "repeat rate = repeat buyers / buyers, both in the window",
    Math.abs(day.totals.repeatPct - wantRepeat) < 1e-9,
    `page ${day.totals.repeatPct} vs raw ${wantRepeat}`,
  );

  // ── 2b. the 30-DAY window's numbers are correct too ─────────────────────────
  // THIS IS THE ASSERTION THAT WAS MISSING. Everything above value-checks only
  // the 1-day window, and 1 day is exactly where the forged-timestamp bug did
  // NOT show: the cutover import wrote 56,262 last_message_received stamps
  // ranging 2026-05-16..2026-08-09, all of which had already aged out of a 24h
  // window. So `Users` sat at 2.01x on 30d (18,328 against a true 9,112) while
  // every 1d assertion stayed green. A check that only ever looks at the
  // narrowest window cannot see a defect that lives in the older rows.
  console.log("\nthe 30-day window's numbers match a raw read");
  const wideActiveBefore = await rawActiveCount(allStartMs, endMs, cloneIds);
  const wide = await getDashboard("CUSTOM", { startMs: allStartMs, endMs });
  const wideActiveAfter = await rawActiveCount(allStartMs, endMs, cloneIds);
  const wlo = Math.min(wideActiveBefore, wideActiveAfter);
  const whi = Math.max(wideActiveBefore, wideActiveAfter);
  assert(
    "users over 30d excludes timestamps the import forged",
    wide.totals.activeUsers >= wlo && wide.totals.activeUsers <= whi,
    `page ${wide.totals.activeUsers}, raw bracket ${wlo}..${whi}`,
  );

  // ── 3. shape ────────────────────────────────────────────────────────────────
  console.log("\nshape");
  assert(
    "repeat rate is a fraction, not a percentage",
    day.totals.repeatPct >= 0 && day.totals.repeatPct <= 1,
    `${day.totals.repeatPct}`,
  );
  const perCloneSum = cloneIds.reduce((n, id) => n + (day.perClone[id]?.messages ?? 0), 0);
  eq("fleet messages = sum of per-clone messages", day.totals.messages, perCloneSum);

  console.log(failures === 0 ? "\nPASS" : `\nFAIL (${failures})`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => {
  console.error(`FAILED: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
