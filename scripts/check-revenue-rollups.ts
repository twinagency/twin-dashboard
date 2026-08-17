// Proves migration 120's SQL rollups return EXACTLY what the old JS roll-up did.
//
// The change this guards: every money aggregate on the Revenue page used to be
// computed by downloading the rows and adding them up in Node. That was 67.8s
// for a 1M view, and usage_events was past selectAllRows()'s 200,000 row
// ceiling, so the cost totals were silently lower bounds. Migration 120 moves
// the aggregation into Postgres.
//
// A rewrite of arithmetic that produces different arithmetic is worse than the
// slow version, so this check does not trust the SQL: it recomputes each figure
// the OLD way, by paging the raw rows here, and asserts the two agree exactly.
// It reads the LIVE database on purpose — the shapes that break these
// definitions (NULL clone_id, NULL ok, purchase_count 0 with spend > 0, an
// unknown spend_tier) are all in the real data and none of them are in a
// fixture.
//
// The window is 1D so the check stays under ~20s. The definitions it proves are
// window-independent; the row volume is not.
//
// EVERY PAGED READ HERE IS ORDERED BY id, and that is not tidiness. Writing this
// check is how we found the second bug in the old path: .range() paging over a
// live, unordered table repeats and skips rows as inserts land mid-walk. The
// first run of this file, comparing against the unordered read the app actually
// used, reported 30,290 usage_events rows of which only 22,285 were distinct —
// 26% double-counted, the rest missed, and the cost total inflated to 37.38
// against a true 33.94. So the old number was wrong twice over: truncated at the
// 200,000 row ceiling, and duplicated below it. Ordered, the two agree exactly.
//
// PROVEN TO FAIL: dropping `greatest(1, purchases)` to plain `purchases` turns
// total_purchases red (6,554 vs 6,206 on 2026-08-17 — 348 fans have spend with
// purchase_count still 0, so the clause is load-bearing and the check sees it).
//
// NOT proven, and worth knowing: `ok is not true` vs `ok = false` are currently
// indistinguishable, because usage_events has no NULL `ok` rows today. That
// assertion is a tripwire for a shape that has not happened yet, not evidence.
//
// Run: npm run test:rollups
import "dotenv/config";
import { supabaseAdmin } from "../lib/supabase";
import { TIERS as ANALYTICS_TIERS } from "../lib/analytics-data";
import { selectAllRows } from "../lib/select-all";
import {
  cloneUserStats,
  fanSpendStats,
  fanTiers,
  messagedFanCount,
  paywallStats,
  usageRollup,
} from "../lib/rollup";

let failures = 0;
function assert(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures += 1;
}
function eq(label: string, sql: number, js: number, tolerance = 0) {
  const ok = Math.abs(sql - js) <= tolerance;
  assert(label, ok, ok ? `${sql}` : `SQL ${sql} vs paged JS ${js}`);
}

const MS_DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

type CloneCounters = { fans: number; active: number; messages: number; buyers: number };

/** The reference roll-up for ONE clone, read the old way. */
async function pagedCloneCounters(cloneId: string, activeSince: number): Promise<CloneCounters> {
  const { rows } = await selectAllRows<{
    last_message_received: string | null;
    total_messages_sent: number | null;
    purchase_count: number | null;
    total_spent_stars: number | null;
  }>(
    supabaseAdmin
      .from("users")
      .select("last_message_received,total_messages_sent,purchase_count,total_spent_stars")
      .eq("clone_id", cloneId)
      .order("id", { ascending: true }),
    { label: `check users ${cloneId}` },
  );
  const out: CloneCounters = { fans: 0, active: 0, messages: 0, buyers: 0 };
  for (const u of rows) {
    out.fans += 1;
    out.messages += u.total_messages_sent ?? 0;
    if ((u.purchase_count ?? 0) > 0 || (u.total_spent_stars ?? 0) > 0) out.buyers += 1;
    if (u.last_message_received && new Date(u.last_message_received).getTime() >= activeSince) out.active += 1;
  }
  return out;
}

/** True when the SQL counters sit between two reference reads taken either side
 *  of them — i.e. the difference is the table moving, not the definition. */
async function bracketedMatch(cloneId: string, activeSince: number): Promise<boolean> {
  const before = await pagedCloneCounters(cloneId, activeSince);
  const sql = (await cloneUserStats(activeSince, cloneId))[0];
  const after = await pagedCloneCounters(cloneId, activeSince);
  if (!sql) return false;
  const within = (value: number, a: number, b: number) => value >= Math.min(a, b) && value <= Math.max(a, b);
  return (
    within(Number(sql.fans), before.fans, after.fans) &&
    within(Number(sql.active), before.active, after.active) &&
    within(Number(sql.messages), before.messages, after.messages) &&
    within(Number(sql.buyers), before.buyers, after.buyers)
  );
}

async function main() {
  const endMs = Date.now();
  const startMs = endMs - MS_DAY;
  console.log(`revenue rollups vs paged roll-up, window ${iso(startMs)} → ${iso(endMs)}\n`);

  // ── usage_events: cost, calls, errors ──────────────────────────────────────
  console.log("usage_events");
  const sqlUsage = await usageRollup(startMs, endMs);
  const { rows: usageRows } = await selectAllRows<{
    clone_id: string | null;
    cost_usd: number | null;
    ok: boolean | null;
  }>(
    supabaseAdmin
      .from("usage_events")
      .select("clone_id,cost_usd,ok")
      .gte("created_at", iso(startMs))
      .lte("created_at", iso(endMs))
      .order("id", { ascending: true }),
    { label: "check usage_events" },
  );
  let jsCost = 0;
  let jsCalls = 0;
  let jsErrors = 0;
  const jsCostByClone = new Map<string, number>();
  for (const u of usageRows) {
    jsCost += Number(u.cost_usd) || 0;
    jsCalls += 1;
    if (!u.ok) jsErrors += 1;
    if (u.clone_id) jsCostByClone.set(u.clone_id, (jsCostByClone.get(u.clone_id) ?? 0) + (Number(u.cost_usd) || 0));
  }
  const sqlCost = sqlUsage.reduce((s, r) => s + (Number(r.cost_usd) || 0), 0);
  const sqlCalls = sqlUsage.reduce((s, r) => s + (Number(r.calls) || 0), 0);
  const sqlErrors = sqlUsage.reduce((s, r) => s + (Number(r.errors) || 0), 0);
  // Floating point sums of the same numbers in a different order.
  eq("total cost_usd", Number(sqlCost.toFixed(6)), Number(jsCost.toFixed(6)), 0.000001);
  eq("total calls", sqlCalls, jsCalls);
  eq("total errors (ok IS NOT TRUE, NULL counts)", sqlErrors, jsErrors);
  // Unattributed spend, tested where it actually exists. Asserting it inside the
  // 1D window was worthless: every NULL-clone row in usage_events was written
  // between 2026-07-04 and 2026-07-29, so `false === false` passed while the
  // property went untested. This finds the window those rows live in and
  // compares the group against a read of exactly them.
  {
    // PAGED, not .limit(2000): PostgREST caps a response at 1,000 rows whatever
    // the limit says, and the first version of this assertion read 1,000 of the
    // 1,474 NULL-clone rows and then failed against the SQL for the missing 474.
    const { rows } = await selectAllRows<{ created_at: string; cost_usd: number | null }>(
      supabaseAdmin
        .from("usage_events")
        .select("created_at,cost_usd")
        .is("clone_id", null)
        .order("created_at", { ascending: true }),
      { label: "check unattributed usage" },
    );
    if (rows.length === 0) {
      assert("unattributed (clone_id NULL) spend: none in the table to test", true);
    } else {
      const firstMs = new Date(rows[0].created_at).getTime();
      // +1ms on each end. Postgres stores these timestamps to the microsecond
      // and JS Date truncates to the millisecond, so a window built from a row's
      // own timestamp excludes that row: the first run of this assertion saw
      // 1,473 of 1,474 rows and failed by one row's $0.00028.
      const lastMs = new Date(rows[rows.length - 1].created_at).getTime() + 1;
      const jsNullCost = rows.reduce((s, r) => s + (Number(r.cost_usd) || 0), 0);
      const groups = await usageRollup(firstMs, lastMs);
      const nullGroup = groups.find((g) => g.clone_id === null);
      const ok =
        !!nullGroup && Math.abs((Number(nullGroup.cost_usd) || 0) - jsNullCost) <= 0.000001;
      assert(
        "unattributed (clone_id NULL) spend is kept, not dropped",
        ok,
        ok ? `$${jsNullCost.toFixed(4)} over ${rows.length} rows` : `group ${nullGroup ? "wrong" : "missing"}`,
      );
    }
  }
  let perCloneCostMatches = true;
  for (const row of sqlUsage) {
    if (!row.clone_id) continue;
    const js = jsCostByClone.get(row.clone_id) ?? 0;
    if (Math.abs((Number(row.cost_usd) || 0) - js) > 0.000001) perCloneCostMatches = false;
  }
  assert(`per-clone cost matches for all ${sqlUsage.length} groups`, perCloneCostMatches);

  // ── users: per-clone fans / active / messages / buyers ─────────────────────
  console.log("\nusers, per clone");
  const activeSince = endMs - MS_DAY;
  const sqlStats = await cloneUserStats(activeSince);
  const { rows: userRows } = await selectAllRows<{
    clone_id: string;
    last_message_received: string | null;
    total_messages_sent: number | null;
    purchase_count: number | null;
    total_spent_stars: number | null;
  }>(
    supabaseAdmin
      .from("users")
      .select("clone_id,last_message_received,total_messages_sent,purchase_count,total_spent_stars")
      .order("id", { ascending: true }),
    { label: "check users" },
  );
  const jsByClone = new Map<string, { fans: number; active: number; messages: number; buyers: number }>();
  for (const u of userRows) {
    const s = jsByClone.get(u.clone_id) ?? { fans: 0, active: 0, messages: 0, buyers: 0 };
    s.fans += 1;
    s.messages += u.total_messages_sent ?? 0;
    if ((u.purchase_count ?? 0) > 0 || (u.total_spent_stars ?? 0) > 0) s.buyers += 1;
    if (u.last_message_received && new Date(u.last_message_received).getTime() >= activeSince) s.active += 1;
    jsByClone.set(u.clone_id, s);
  }
  assert("same number of clone groups", sqlStats.length === jsByClone.size, `${sqlStats.length} vs ${jsByClone.size}`);

  // A mismatch here is not automatically a bug: `users` is written on every
  // inbound message, so total_messages_sent and last_message_received move
  // between the SQL call and the reference read a few seconds later. The first
  // run of this check went red on one clone for exactly that reason.
  //
  // So a mismatch is re-tested by BRACKETING: read that clone's rows, call the
  // rollup again, read them a second time. Live drift leaves the SQL value
  // between the two reference values. A wrong definition does not.
  const mismatches: string[] = [];
  for (const row of sqlStats) {
    const js = jsByClone.get(row.clone_id);
    if (
      js &&
      Number(row.fans) === js.fans &&
      Number(row.active) === js.active &&
      Number(row.messages) === js.messages &&
      Number(row.buyers) === js.buyers
    ) {
      continue;
    }
    if (!(await bracketedMatch(row.clone_id, activeSince))) mismatches.push(row.clone_id);
  }
  assert("fans / active24h / messages / buyers match per clone", mismatches.length === 0, mismatches.join(", "));

  // ── users: lifetime spend funnel + tiers ───────────────────────────────────
  // Same live-drift problem as above, solved the cheap way round: the rollup
  // costs about a second, the reference read costs twenty, so the expensive
  // read is BRACKETED by two rollups. A figure that lands between them moved
  // because a fan paid mid-check; one that lands outside is a real disagreement.
  console.log("\nusers, lifetime spend");
  const sqlSpendBefore = await fanSpendStats(null);
  const { rows: spendRows } = await selectAllRows<{
    total_spent_stars: number | null;
    spend_tier: string | null;
    purchase_count: number | null;
  }>(
    supabaseAdmin.from("users").select("total_spent_stars,spend_tier,purchase_count").order("id", { ascending: true }),
    { label: "check users spend" },
  );
  const TIER_KEYS = ["whale", "high", "mid", "low", "none"];
  let fans = 0;
  let buyers = 0;
  let repeatBuyers = 0;
  let oneTime = 0;
  let threePlus = 0;
  let totalPurchases = 0;
  let repeatBuyerStars = 0;
  let lifetimeStars = 0;
  const buyerSpend: number[] = [];
  const jsTierFans = new Map<string, number>();
  const jsTierStars = new Map<string, number>();
  for (const u of spendRows) {
    fans += 1;
    const spent = Number(u.total_spent_stars) || 0;
    const pc = Number(u.purchase_count) || 0;
    if (pc > 0 || spent > 0) {
      buyers += 1;
      totalPurchases += Math.max(1, pc);
      buyerSpend.push(spent);
      if (pc > 1) {
        repeatBuyers += 1;
        repeatBuyerStars += spent;
      } else {
        oneTime += 1;
      }
      if (pc >= 3) threePlus += 1;
    }
    lifetimeStars += spent;
    const tier = TIER_KEYS.includes(u.spend_tier ?? "") ? (u.spend_tier as string) : "none";
    jsTierFans.set(tier, (jsTierFans.get(tier) ?? 0) + 1);
    jsTierStars.set(tier, (jsTierStars.get(tier) ?? 0) + spent);
  }
  const sorted = [...buyerSpend].sort((a, b) => a - b);
  const jsMedian =
    sorted.length === 0
      ? 0
      : sorted.length % 2 === 1
        ? sorted[Math.floor(sorted.length / 2)]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;

  const sqlSpendAfter = await fanSpendStats(null);
  const spans = (label: string, key: keyof typeof sqlSpendAfter, js: number) => {
    const a = Number(sqlSpendBefore[key]) || 0;
    const b = Number(sqlSpendAfter[key]) || 0;
    const ok = js >= Math.min(a, b) && js <= Math.max(a, b);
    assert(label, ok, ok ? `${b}` : `SQL ${a}..${b} vs paged JS ${js}`);
  };
  spans("fans", "fans", fans);
  spans("buyers (purchase_count > 0 OR spend > 0)", "buyers", buyers);
  spans("repeat buyers", "repeat_buyers", repeatBuyers);
  spans("one-time buyers", "one_time", oneTime);
  spans("3+ purchase buyers", "three_plus", threePlus);
  spans("total purchases (min 1 per buyer)", "total_purchases", totalPurchases);
  spans("repeat buyer stars", "repeat_buyer_stars", repeatBuyerStars);
  spans("lifetime stars (ALL fans, not just buyers)", "lifetime_stars", lifetimeStars);
  spans("median buyer spend", "median_buyer_stars", jsMedian);

  const sqlTiers = await fanTiers(null);
  let tiersMatch = true;
  for (const row of sqlTiers) {
    if ((jsTierFans.get(row.tier) ?? 0) !== Number(row.fans)) tiersMatch = false;
    if (Math.abs((jsTierStars.get(row.tier) ?? 0) - (Number(row.stars) || 0)) > 0.000001) tiersMatch = false;
  }
  assert("spend tiers match (unknown tier folds into 'none')", tiersMatch && sqlTiers.length === jsTierFans.size);

  // ── chat_history: distinct fans who messaged ───────────────────────────────
  console.log("\nchat_history");
  const sqlMessaged = await messagedFanCount(startMs, endMs, null);
  const { rows: msgRows } = await selectAllRows<{ telegram_id: number | null }>(
    supabaseAdmin
      .from("chat_history")
      .select("telegram_id")
      .eq("role", "human")
      .gte("created_at", iso(startMs))
      .lte("created_at", iso(endMs))
      .order("id", { ascending: true }),
    { label: "check chat_history" },
  );
  const jsMessaged = new Set<number>();
  for (const m of msgRows) if (m.telegram_id != null) jsMessaged.add(m.telegram_id);
  eq("distinct fans who messaged", sqlMessaged, jsMessaged.size);

  // ── paywall_hits: views, distinct fans, conversion ─────────────────────────
  console.log("\npaywall_hits");
  const { rows: paywallRows } = await selectAllRows<{ telegram_id: number | null }>(
    supabaseAdmin
      .from("paywall_hits")
      .select("telegram_id")
      .gte("shown_at", iso(startMs))
      .lte("shown_at", iso(endMs))
      .order("id", { ascending: true }),
    { label: "check paywall_hits" },
  );
  const jsPaywalled = new Set<number>();
  for (const p of paywallRows) if (p.telegram_id != null) jsPaywalled.add(p.telegram_id);
  // Credit buyers in the window, the same set analytics-data.ts intersects with.
  const { rows: creditRows } = await selectAllRows<{ telegram_id: number | null; feature: string | null; kind: string | null }>(
    supabaseAdmin
      .from("star_transactions")
      .select("telegram_id,feature,kind")
      .gte("paid_at", iso(startMs))
      .lte("paid_at", iso(endMs))
      .order("id", { ascending: true }),
    { label: "check star_transactions" },
  );
  const creditBuyers = new Set<number>();
  for (const t of creditRows) {
    const isCredits = t.feature === "credits" || (!t.feature && t.kind === "credits");
    if (isCredits && t.telegram_id != null) creditBuyers.add(t.telegram_id);
  }
  const sqlPaywall = await paywallStats(startMs, endMs, null, [...creditBuyers]);
  eq("paywall views", sqlPaywall.views, paywallRows.length);
  eq("distinct fans paywalled", sqlPaywall.fans, jsPaywalled.size);
  eq(
    "paywalled fans who bought credits",
    sqlPaywall.converted,
    [...jsPaywalled].filter((id) => creditBuyers.has(id)).length,
  );

  // ── the clone-scoped path ──────────────────────────────────────────────────
  // Everything above runs fleet-wide (p_clone null). The scoped path is what
  // /api/v1/revenue hands every model for her own dashboard, and a broken
  // `(p_clone is null or x = p_clone)` in any of the six functions would ship
  // green without this. One clone, three of the rollups, same reference reads.
  console.log("\nscoped to one clone");
  {
    const { data: cloneRow } = await supabaseAdmin
      .from("clones")
      .select("id,name")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const cloneId = cloneRow?.id as string | undefined;
    if (!cloneId) {
      assert("a clone exists to scope to", false);
    } else {
      const scopedUsage = await usageRollup(startMs, endMs, cloneId);
      const fleetUsage = await usageRollup(startMs, endMs);
      const fleetForClone = fleetUsage.find((r) => r.clone_id === cloneId);
      assert(
        "scoped usage returns only that clone",
        scopedUsage.every((r) => r.clone_id === cloneId),
        scopedUsage.map((r) => r.clone_id).join(", "),
      );
      eq(
        "scoped usage cost equals that clone's slice of the fleet rollup",
        Number(Number(scopedUsage[0]?.cost_usd ?? 0).toFixed(6)),
        Number(Number(fleetForClone?.cost_usd ?? 0).toFixed(6)),
        0.000001,
      );

      const { rows: scopedUsers } = await selectAllRows<{
        purchase_count: number | null;
        total_spent_stars: number | null;
      }>(
        supabaseAdmin
          .from("users")
          .select("purchase_count,total_spent_stars")
          .eq("clone_id", cloneId)
          .order("id", { ascending: true }),
        { label: "check scoped users" },
      );
      const scopedFansJs = scopedUsers.length;
      const scopedBuyersJs = scopedUsers.filter(
        (u) => (u.purchase_count ?? 0) > 0 || (u.total_spent_stars ?? 0) > 0,
      ).length;
      const scopedSpend = await fanSpendStats(cloneId);
      assert(
        "scoped fan count is this clone's, not the fleet's",
        Math.abs(Number(scopedSpend.fans) - scopedFansJs) <= 2 && Number(scopedSpend.fans) < fans,
        `${scopedSpend.fans} vs ${scopedFansJs} (fleet ${fans})`,
      );
      eq("scoped buyers", Number(scopedSpend.buyers), scopedBuyersJs, 2);

      const scopedMessaged = await messagedFanCount(startMs, endMs, cloneId);
      assert(
        "scoped messaged-fan count is a subset of the fleet's",
        scopedMessaged <= sqlMessaged,
        `${scopedMessaged} of ${sqlMessaged}`,
      );
    }
  }

  // ── the tier list has to stay in step with the app ─────────────────────────
  // The five keys live in three places: the migration, TIERS in
  // lib/analytics-data.ts, and this file. Adding a tier upstream without
  // touching the SQL folds it into "none" — the new tier renders 0 users and
  // "No spend yet" absorbs it. Importing the app's list here means that shows
  // up as a failure instead of a quietly wrong chart.
  console.log("\ntier vocabulary");
  {
    const appTiers = ANALYTICS_TIERS.map((t) => t.key).sort();
    const sqlKnown = [...TIER_KEYS].sort();
    assert(
      "the app's spend tiers are exactly the ones the SQL knows about",
      JSON.stringify(appTiers) === JSON.stringify(sqlKnown),
      `app ${appTiers.join("/")} vs SQL ${sqlKnown.join("/")}`,
    );
  }

  console.log(failures === 0 ? "\nAll rollups agree with the paged roll-up." : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
