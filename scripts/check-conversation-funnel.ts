// Proves Jesse's seven conversation numbers against the raw rows.
//
// WHAT THIS GUARDS. Migration 125 computes five of the seven in one SQL scan
// (revenue_conversation_funnel) because a 30-day window is 196,994 chat_history
// rows and the page cannot page that for eight integers. A SQL aggregate is
// exactly the kind of code that is wrong quietly: every number it returns looks
// like a measurement, and nothing on the page can contradict it.
//
// So each of the eight is recomputed here over a DIFFERENT code path — PostgREST
// filters plus counting in JS — and asserted to match the page's figure exactly.
// That is the same shape as check-window-tiles.ts, and the same reasoning: the
// original windowed-tiles bug was internally consistent and still wrong.
//
// Four groups:
//
//   1. THE EIGHT NUMBERS ARE RIGHT. Exact equality against the JS recompute.
//
//   2. NO NUMERATOR ESCAPES ITS DENOMINATOR. Every one of these renders as a
//      percentage, and a percentage over 100 is the specific way a funnel lies.
//      offered ⊆ conversations is not free: paywall_hits is a separate table and
//      a fan can have a hit with no chat row in the window, which is exactly
//      what the LEFT join in migration 125 exists to prevent.
//
//   3. THE WINDOW IS REAL. A one-day window is a strict subset of thirty days.
//      If anyone repoints this at an unbounded rollup the way migration 120's
//      functions were, day == month and this goes red.
//
//   4. THE OLD SYSTEM IS OUT OF THE CONVERSION. `harry_sub_` renewals are
//      Telegram auto-renewing the old n8n system's invoice with no server
//      involved (CLAUDE.md, 2026-08-12). Crediting a Twin offer with one would
//      be attributing someone else's sale. NOTE, and read this before deleting
//      the exclusion as dead code: it currently changes NO number in any window
//      including all-time. The assertion is written as a tripwire and says why.
//
// Plus fmtHours(), which needs no database: a median of three minutes must not
// print as "0h", because "0h" reads as instant and instant is a claim.
//
// BOTH WINDOWS ARE EXPLICIT CUSTOM RANGES so getAnalytics() and this file bound
// their reads at the same two instants. A named period recomputes `now` inside
// getAnalytics and would force a tolerance, and a tolerance is where an
// off-by-a-window hides.
//
// PAGED READS ARE ORDERED BY id. chat_history takes ~1,300 inserts an hour and
// unordered .range() paging over a table being written to repeats and skips
// rows. check-revenue-rollups.ts learned that on usage_events: 30,290 rows read,
// 22,285 distinct.
//
// PROVEN TO FAIL: see scripts/prove-conversation-funnel.sh, which plants seven
// separate defects in migration 125 and the panel and watches each one go red.
//
// Reads the LIVE database. Run: npm run test:funnel
import "dotenv/config";
import { getAnalytics } from "../lib/analytics-data";
import { supabaseAdmin } from "../lib/supabase";
import { conversationFunnel } from "../lib/rollup";
import { selectAllRows } from "../lib/select-all";
import { fmtHours } from "../components/RevenueDashboard";

let failures = 0;
function assert(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures += 1;
}
function eq(label: string, got: number, want: number) {
  const ok = got === want;
  assert(label, ok, ok ? `${got}` : `page ${got} vs raw ${want}`);
}
function le(label: string, a: number, b: number) {
  assert(label, a <= b, `${a} <= ${b}`);
}
function lt(label: string, day: number, month: number) {
  const ok = day < month;
  assert(label, ok, ok ? `${day} < ${month}` : `day ${day} vs month ${month} — not windowed`);
}

const MS_DAY = 86_400_000;
const key = (clone: string, tg: number | string) => `${clone}:${tg}`;

// The old n8n system's subscription, and a refund. Must match migration 125's
// two predicates exactly — if they ever disagree, group 1 goes red, which is
// the point of recomputing rather than importing a shared helper.
const isOldSystem = (payload: string | null) => !!payload && payload.startsWith("harry_sub_");
const isRefund = (payload: string | null) => payload === "refund";

type ChatRow = { clone_id: string | null; telegram_id: number | null; role: string; meta: { paid?: boolean } | null; created_at: string };
type HitRow = { clone_id: string | null; telegram_id: number | null; shown_at: string };
type TxRow = { clone_id: string | null; telegram_id: number | null; amount_stars: number; paid_at: string; invoice_payload: string | null };
type UserRow = { clone_id: string; telegram_id: number; first_seen_at: string; legacy_id: string | null };

/** Recompute all eight, in JS, from raw rows. `countOldSystem` exists only for
 *  assertion group 4: passing true reproduces the bug of treating an old-system
 *  renewal as a Twin offer converting. */
async function recompute(startMs: number, endMs: number, opts: { countOldSystem?: boolean } = {}) {
  const startIso = new Date(startMs).toISOString();
  const endIso = new Date(endMs).toISOString();
  const allowed = (payload: string | null) =>
    (opts.countOldSystem ? true : !isOldSystem(payload)) && !isRefund(payload);

  const { rows: chat } = await selectAllRows<ChatRow>(
    supabaseAdmin
      .from("chat_history")
      .select("clone_id,telegram_id,role,meta,created_at")
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .order("id", { ascending: true }),
    { label: "check-funnel chat" },
  );

  const fanMsgs = new Map<string, number>();
  const firstOfferAt = new Map<string, number>();
  const noteOffer = (k: string, at: number) => {
    const cur = firstOfferAt.get(k);
    if (cur == null || at < cur) firstOfferAt.set(k, at);
  };
  for (const r of chat) {
    if (!r.clone_id || r.telegram_id == null) continue;
    const k = key(r.clone_id, r.telegram_id);
    if (r.role === "human") fanMsgs.set(k, (fanMsgs.get(k) ?? 0) + 1);
    if (r.meta?.paid === true) noteOffer(k, new Date(r.created_at).getTime());
  }

  const { rows: hits } = await selectAllRows<HitRow>(
    supabaseAdmin
      .from("paywall_hits")
      .select("clone_id,telegram_id,shown_at")
      .gte("shown_at", startIso)
      .lte("shown_at", endIso)
      .order("id", { ascending: true }),
    { label: "check-funnel paywall" },
  );
  for (const r of hits) {
    if (!r.clone_id || r.telegram_id == null) continue;
    noteOffer(key(r.clone_id, r.telegram_id), new Date(r.shown_at).getTime());
  }

  // The cohort: a fan who SENT something. Being messaged is not conversing.
  const convo = new Set([...fanMsgs.keys()]);

  const { rows: txs } = await selectAllRows<TxRow>(
    supabaseAdmin
      .from("star_transactions")
      .select("clone_id,telegram_id,amount_stars,paid_at,invoice_payload")
      .order("id", { ascending: true }),
    { label: "check-funnel tx" },
  );
  const lastPaidInWindow = new Map<string, number>();
  const firstPaidEver = new Map<string, number>();
  for (const t of txs) {
    if (!t.clone_id || t.telegram_id == null) continue;
    if (Number(t.amount_stars) <= 0 || !allowed(t.invoice_payload)) continue;
    const k = key(t.clone_id, t.telegram_id);
    const at = new Date(t.paid_at).getTime();
    const first = firstPaidEver.get(k);
    if (first == null || at < first) firstPaidEver.set(k, at);
    if (at < startMs || at > endMs) continue;
    const last = lastPaidInWindow.get(k);
    if (last == null || at > last) lastPaidInWindow.set(k, at);
  }

  const { rows: users } = await selectAllRows<UserRow>(
    supabaseAdmin
      .from("users")
      .select("clone_id,telegram_id,first_seen_at,legacy_id")
      .is("legacy_id", null)
      .order("id", { ascending: true }),
    { label: "check-funnel users" },
  );
  const organicSeenAt = new Map<string, number>();
  let arrivals = 0;
  const arrivalKeys: string[] = [];
  for (const u of users) {
    const k = key(u.clone_id, u.telegram_id);
    const seen = new Date(u.first_seen_at).getTime();
    organicSeenAt.set(k, seen);
    if (seen >= startMs && seen <= endMs) {
      arrivals += 1;
      arrivalKeys.push(k);
    }
  }

  const ttfp: number[] = [];
  for (const [k, at] of firstPaidEver) {
    if (at < startMs || at > endMs) continue;
    const seen = organicSeenAt.get(k);
    if (seen == null || at < seen) continue;
    ttfp.push((at - seen) / 3_600_000);
  }
  ttfp.sort((a, b) => a - b);
  // percentile_cont(0.5): the mean of the two middle values on an even count,
  // which is NOT the same as picking either one. Postgres does it this way and
  // so must this, or group 1 goes red on every even-sized sample.
  const median =
    ttfp.length === 0
      ? null
      : ttfp.length % 2
        ? ttfp[(ttfp.length - 1) / 2]
        : (ttfp[ttfp.length / 2 - 1] + ttfp[ttfp.length / 2]) / 2;

  const offeredKeys = [...firstOfferAt.keys()].filter((k) => convo.has(k));
  const offeredBought = offeredKeys.filter((k) => {
    const paid = lastPaidInWindow.get(k);
    return paid != null && paid >= firstOfferAt.get(k)!;
  }).length;

  return {
    arrivals,
    arrivalsStarted: arrivalKeys.filter((k) => (fanMsgs.get(k) ?? 0) >= 2).length,
    conversations: convo.size,
    meaningful: [...fanMsgs.values()].filter((n) => n >= 5).length,
    offered: offeredKeys.length,
    offeredBought,
    ttfpN: ttfp.length,
    ttfpMedianHours: median,
  };
}

async function main() {
  const end = Date.now();
  const day = { startMs: end - MS_DAY, endMs: end };
  const month = { startMs: end - 30 * MS_DAY, endMs: end };

  console.log("Jesse's conversation funnel (migration 125)\n");

  // ── 1. the eight numbers, against a JS recompute over the same instants ────
  console.log("1. the numbers are right (1-day window, fleet)");
  const page = (await getAnalytics("CUSTOM", null, day)).conversationFunnel;
  const raw = await recompute(day.startMs, day.endMs);
  eq("arrivals", page.arrivals, raw.arrivals);
  eq("arrivals who got past message one", page.arrivalsStarted, raw.arrivalsStarted);
  eq("conversations", page.conversations, raw.conversations);
  eq("meaningful (5+ fan messages)", page.meaningful, raw.meaningful);
  eq("offered", page.offered, raw.offered);
  eq("offered and bought", page.offeredBought, raw.offeredBought);
  eq("first-time buyers in window", page.ttfpN, raw.ttfpN);
  {
    const got = page.ttfpMedianHours;
    const want = raw.ttfpMedianHours;
    const ok =
      got === null || want === null ? got === want : Math.abs(got - want) < 1e-6;
    assert(
      "median hours to first purchase",
      ok,
      ok ? String(got ?? "null") : `page ${got} vs raw ${want}`,
    );
  }

  // ── 2. no rate can exceed 100% ────────────────────────────────────────────
  console.log("\n2. every numerator stays inside its denominator");
  le("started <= arrivals", page.arrivalsStarted, page.arrivals);
  le("meaningful <= conversations", page.meaningful, page.conversations);
  le("offered <= conversations", page.offered, page.conversations);
  le("bought <= offered", page.offeredBought, page.offered);

  // ── 3. the window is real ─────────────────────────────────────────────────
  // conversationFunnel() directly rather than getAnalytics(): a 30-day
  // getAnalytics also runs revenue_usage_rollup over usage_events, which
  // statement-times-out on this project (a known slow query, see the header of
  // lib/rollup.ts, 2026-08-21). That failure has nothing to do with this
  // funnel, and a check that goes red for someone else's slow query is a check
  // people learn to ignore. This is still the function the page calls.
  console.log("\n3. the window is real (1 day is a strict subset of 30)");
  const monthPage = await conversationFunnel(month.startMs, month.endMs, null);
  lt("conversations", page.conversations, monthPage.conversations);
  lt("offered", page.offered, monthPage.offered);
  lt("arrivals", page.arrivals, monthPage.arrivals);

  // ── 4. old-system renewals are not Twin conversions ───────────────────────
  // A FIXED window, 2026-08-07 to 2026-08-13, chosen for three properties a
  // rolling window does not have:
  //
  //   * it straddles 2026-08-08, the day the cutover INSERTed 57,164 fan rows
  //     all stamped with that date. So `arrivals` here genuinely exercises
  //     migration 123's `legacy_id is null`: drop that predicate and this
  //     window's arrivals jump by tens of thousands. A rolling 1-day window
  //     cannot test it, because the forged stamps aged out on 2026-08-09.
  //   * it contains harry_sub_ rows (the last is 2026-08-12), for the tripwire
  //     below.
  //   * it sits at the cutover, where chat volume is a few tens of thousands of
  //     rows rather than the 196,994 a 30-day recompute would page.
  //     selectAllRows caps at 200,000, so an all-time recompute would silently
  //     truncate and this check would compare against a lower bound while
  //     printing a tick.
  console.log("\n4. old n8n renewals are excluded from the conversion");
  const cutover = { startMs: Date.parse("2026-08-07T00:00:00Z"), endMs: Date.parse("2026-08-13T00:00:00Z") };
  const cutoverPage = await conversationFunnel(cutover.startMs, cutover.endMs, null);
  const withOld = await recompute(cutover.startMs, cutover.endMs, { countOldSystem: true });
  const withoutOld = await recompute(cutover.startMs, cutover.endMs);
  // THE EXCLUSION IS CORRECT AND CURRENTLY INERT, AND THIS ASSERTION SAYS SO
  // RATHER THAN PRETENDING OTHERWISE.
  //
  // Measured 2026-08-21 across five widening windows up to all-time, on the
  // full 1,174 harry_sub_ rows: including them changes offered_bought by ZERO
  // in every one. Only 76 of those fans were ever shown a Twin offer at all,
  // and each of those either never sent a message in the window or had already
  // bought something of Twin's after the offer, so counting the renewal adds
  // nobody.
  //
  // That means an assertion of the form "removing the exclusion turns this red"
  // would be a lie: it would be green with the guard deleted. Writing it that
  // way is how this project ends up with a check nobody can trust, and the
  // exclusion is exactly the sort of thing that gets deleted as dead code by
  // someone who checked whether it moved a number.
  //
  // So this asserts the equality that holds today and is a TRIPWIRE for the day
  // it stops holding. Going red here means old-system money has started
  // overlapping the fans Twin is making offers to, which is Ronan's call to
  // make (his 2026-08-21 decision: totals stay whole, old money gets its own
  // line), not something to quietly re-derive.
  assert(
    "old-system renewals still overlap no Twin conversion (tripwire)",
    withOld.offeredBought === withoutOld.offeredBought,
    `${withOld.offeredBought} with vs ${withoutOld.offeredBought} without` +
      (withOld.offeredBought === withoutOld.offeredBought
        ? ""
        : " — old n8n money now touches this metric, take it to Ronan"),
  );
  eq("the page matches the excluding count", cutoverPage.offeredBought, withoutOld.offeredBought);
  // ...and while that window is loaded, the other seven too. Group 1 proves the
  // arithmetic on a live rolling day; this proves it on a fixed historical one,
  // which is the half that keeps passing after the data moves on.
  eq("arrivals (fixed window)", cutoverPage.arrivals, withoutOld.arrivals);
  eq("conversations (fixed window)", cutoverPage.conversations, withoutOld.conversations);
  eq("meaningful (fixed window)", cutoverPage.meaningful, withoutOld.meaningful);
  eq("offered (fixed window)", cutoverPage.offered, withoutOld.offered);

  // ── 5. fmtHours, no database ──────────────────────────────────────────────
  console.log("\n5. a duration a person reads");
  const fh = (h: number | null, want: string) =>
    assert(`fmtHours(${h}) = ${want}`, fmtHours(h) === want, fmtHours(h));
  fh(null, "-");
  fh(0.05, "3 min"); // NOT "0h": instant is a claim, and this is three minutes
  fh(0.5, "30 min");
  fh(1, "1.0h");
  fh(4.1275, "4.1h");
  fh(47.9, "47.9h");
  fh(48, "2.0d");
  fh(240, "10.0d");

  console.log(`\n${failures === 0 ? "PASS" : `FAIL (${failures})`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
