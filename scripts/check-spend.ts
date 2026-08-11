// ── Checks for the /spend roll-up ────────────────────────────────────────────
// Run:  npm run test:spend
//
// THE CHECK THAT MATTERS: the arithmetic in rollUpSpend(). A wrong sum on this
// page does not look wrong, it looks like an answer, and it sends the operator
// chasing the wrong cost. So every assertion here is against the REAL function
// the page calls, fed handmade rows with known totals. No database, no markup:
// a check that asserts on JSX passes while the numbers are nonsense.
//
// Three things this is specifically defending, all of them ways the page can be
// confidently wrong:
//
//   1. THE CACHE NULL RULE. cached_prompt_tokens NULL means the provider
//      reported nothing, which is NOT a zero hit. Coalescing it to 0 puts that
//      call's prompt tokens in the denominator with nothing in the numerator, so
//      every non-caching model (grok, eleven, deepgram, i.e. most of today's
//      calls) drags the fleet hit rate toward zero and a working cache reads as
//      broken.
//   2. UNATTRIBUTED SPEND VANISHING. Rows with no clone_id and rows with no flow
//      still cost real money. Any roll-up that skips them under-reports the
//      total, and under-reports it in the direction that looks like good news.
//   3. cache_discount_usd DOUBLE COUNTING. It is already inside cost_usd. It is
//      attribution of a discount already received, not an extra credit.
//
// PROVEN TO FAIL (planted back twice, both went red before restoring):
//   a) foldCache(): `if (r.cached_prompt_tokens == null) return;` changed to
//      `const cached = r.cached_prompt_tokens ?? 0;` and counted, so nulls join
//      the denominator. Red on S5 and S6.
//   b) rollUpSpend(): the fleet total moved behind the `if (!r.clone_id)` guard,
//      so unattributed spend disappears from the headline. Red on S2 and S3.

import { readFileSync } from "node:fs";
import {
  BACKGROUND_FLOWS,
  LIVE_FLOWS,
  OVERHEAD_FLOWS,
  flowGroup,
  fmtCents,
  fmtUsd,
  rollUpSpend,
  windowRange,
  type SpendUsageRow,
} from "../lib/spend-data";

let passed = 0;
const failures: string[] = [];

function check(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
  } catch (e) {
    failures.push(`${name}\n      ${e instanceof Error ? e.message : String(e)}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function eq(a: unknown, b: unknown, what: string): void {
  if (a !== b) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
/** Money and rates are floats built by repeated addition, so exact equality is
 *  the wrong test; 1e-9 is far tighter than any figure this page renders. */
function near(a: number | null, b: number | null, what: string): void {
  if (a == null || b == null) throw new Error(`${what}: expected ${b}, got ${a}`);
  if (Math.abs(a - b) > 1e-9) throw new Error(`${what}: expected ${b}, got ${a}`);
}

// ── the fixture ──────────────────────────────────────────────────────────────
// Hand-built so every total below is known by arithmetic, not by re-running the
// function under test. Deliberately includes: a null clone_id, a null flow, a
// null model, a failed call, cost_usd as a STRING (postgres numeric comes back
// that way through supabase-js), and both reporting and non-reporting cache rows.

const A = "clone-a";
const B = "clone-b";

function row(r: Partial<SpendUsageRow>): SpendUsageRow {
  return {
    clone_id: null,
    flow: null,
    kind: "llm",
    model: null,
    cost_usd: 0,
    prompt_tokens: null,
    completion_tokens: null,
    cached_prompt_tokens: null,
    cache_write_tokens: null,
    cache_discount_usd: null,
    ok: true,
    ...r,
  };
}

const ROWS: SpendUsageRow[] = [
  // clone A, live text. Cache reported: 800 of 1000 prompt tokens were cached.
  row({ clone_id: A, flow: "TEXT_FLOW", model: "x-ai/grok-4.3", cost_usd: 0.5, prompt_tokens: 1000, completion_tokens: 100, cached_prompt_tokens: 800, cache_write_tokens: 200, cache_discount_usd: 0.25 }),
  // clone A, live voice. Same model, no cache reporting at all (null).
  row({ clone_id: A, flow: "VOICE_FLOW", model: "x-ai/grok-4.3", cost_usd: "0.25", prompt_tokens: 9000, completion_tokens: 50 }),
  // clone A, overhead. Cache reported and genuinely zero: a real 0% hit.
  row({ clone_id: A, flow: "routing", model: "qwen/qwen3-30b-a3b-instruct-2507", cost_usd: 0.01, prompt_tokens: 200, cached_prompt_tokens: 0 }),
  // clone A, overhead, the hardcoded moderation model no clone configures.
  row({ clone_id: A, flow: "image_moderation", model: "openai/gpt-5-mini", cost_usd: 0.02, prompt_tokens: 100, cached_prompt_tokens: 0 }),
  // clone B, background drip.
  row({ clone_id: B, flow: "drip", model: "x-ai/grok-4.3", cost_usd: 0.1, prompt_tokens: 500, cached_prompt_tokens: 100 }),
  // clone B, background, and it FAILED. Failed calls still bill.
  row({ clone_id: B, flow: "followup", model: "x-ai/grok-4.3", cost_usd: 0.04, ok: false }),
  // clone B, the hardcoded LLM fallback, unlabelled flow.
  row({ clone_id: B, flow: null, model: "openai/gpt-4.1-mini", cost_usd: 0.03 }),
  // NO clone at all, and no model. Real money, nobody to bill it to.
  row({ clone_id: null, flow: null, model: null, cost_usd: 0.07 }),
];

// Known by hand: 0.5 + 0.25 + 0.01 + 0.02 + 0.1 + 0.04 + 0.03 + 0.07
const TOTAL = 1.02;
const LIVE = 0.75; // TEXT_FLOW + VOICE_FLOW
const OVERHEAD = 0.03; // routing + image_moderation
const BACKGROUND = 0.14; // drip + followup
const UNATTRIBUTED = 0.1; // the two null-flow rows: 0.03 + 0.07

const D = rollUpSpend(ROWS, {
  window: "7d",
  startIso: "2026-08-05T00:00:00.000Z",
  endIso: "2026-08-12T00:00:00.000Z",
  truncated: false,
  clones: [
    { id: A, name: "Alanna", color: "#ec4899" },
    { id: B, name: "Bella", color: "#a855f7" },
    { id: "clone-c", name: "Cara", color: "#20c5d8" }, // no spend in the window
  ],
  // Only what an operator actually picked in the dashboard. gpt-4.1-mini and
  // gpt-5-mini are absent on purpose: they are hardcoded in bot code.
  configuredModels: ["x-ai/grok-4.3", "qwen/qwen3-30b-a3b-instruct-2507"],
  fanMessages: 200,
  fanMessagesByClone: new Map([
    [A, 150],
    [B, 50],
  ]),
});

// ── S1 the flow vocabulary ───────────────────────────────────────────────────

check("S1 every flow label lands in exactly one bucket, and unknowns land in none of them", () => {
  for (const f of LIVE_FLOWS) eq(flowGroup(f), "live", `${f} must be a live reply`);
  for (const f of BACKGROUND_FLOWS) eq(flowGroup(f), "background", `${f} must be background`);
  for (const f of OVERHEAD_FLOWS) eq(flowGroup(f), "overhead", `${f} must be overhead`);
  // The bot writes null rather than guess. Guessing it into "live" would
  // overstate reply cost by the entire pre-migration-107 history.
  eq(flowGroup(null), "unattributed", "a null flow must stay unattributed");
  eq(flowGroup(""), "unattributed", "an empty flow must stay unattributed");
  eq(flowGroup("TEXT"), "unattributed", "an invented variant must not be accepted as a live flow");
  eq(flowGroup("text_flow"), "unattributed", "the column holds normalized labels; lowercase is not one of them");
  // No label may appear in two lists, or the bucket columns stop adding up.
  const all = [...LIVE_FLOWS, ...BACKGROUND_FLOWS, ...OVERHEAD_FLOWS];
  eq(new Set(all).size, all.length, "a flow label appears in more than one bucket");
});

// ── S2/S3 the totals ─────────────────────────────────────────────────────────

check("S2 the fleet total counts every row, including the ones with no clone", () => {
  near(D.totals.costUsd, TOTAL, "total spend");
  eq(D.totals.calls, ROWS.length, "call count");
  eq(D.totals.errors, 1, "failed call count");
  // The specific regression: dropping the clone-less row loses 0.07 of 1.02.
  assert(D.totals.costUsd > D.clones.reduce((s, c) => s + c.costUsd, 0), "unattributed-clone spend must survive in the fleet total");
  near(D.totals.costUsd - D.clones.reduce((s, c) => s + c.costUsd, 0), 0.07, "the clone-less row's cost");
});

check("S3 the four buckets partition the spend, they do not overlap or drop any", () => {
  near(D.totals.byGroup.live, LIVE, "live spend");
  near(D.totals.byGroup.background, BACKGROUND, "background spend");
  near(D.totals.byGroup.overhead, OVERHEAD, "overhead spend");
  near(D.totals.byGroup.unattributed, UNATTRIBUTED, "unattributed spend");
  const sum = D.totals.byGroup.live + D.totals.byGroup.background + D.totals.byGroup.overhead + D.totals.byGroup.unattributed;
  near(sum, TOTAL, "the four buckets must add back up to the total");
  // Background and overhead are the two the operator has never been able to see
  // on their own. They must be non-zero here or this fixture stopped testing it.
  assert(D.totals.byGroup.background > 0 && D.totals.byGroup.overhead > 0, "fixture no longer covers background/overhead");
});

check("S4 per girl: ranked biggest first, bucketed, and zero-spend clones still appear", () => {
  eq(D.clones.map((c) => c.name).join(","), "Alanna,Bella,Cara", "clones must rank by cost, biggest first");
  const a = D.clones[0];
  const b = D.clones[1];
  near(a.costUsd, 0.78, "Alanna total (0.5 + 0.25 + 0.01 + 0.02)");
  near(b.costUsd, 0.17, "Bella total (0.1 + 0.04 + 0.03)");
  near(a.byGroup.live, 0.75, "Alanna live");
  near(a.byGroup.overhead, 0.03, "Alanna overhead");
  near(b.byGroup.background, 0.14, "Bella background");
  near(b.byGroup.unattributed, 0.03, "Bella's unlabelled row must not be folded into live");
  eq(b.byGroup.live, 0, "Bella has no live spend and must not borrow any");
  eq(D.clones[2].calls, 0, "a clone with no calls must still be listed, at zero");
  // Per-clone flow rows are ranked too, and each one keeps its own bucket.
  eq(a.byFlow[0].flow, "TEXT_FLOW", "Alanna's most expensive flow");
  eq(a.byFlow[0].group, "live", "TEXT_FLOW's bucket");
});

// ── S5/S6 the cache, and the NULL rule ───────────────────────────────────────

check("S5 a provider that reported no cache data is excluded from the hit rate, not counted as a miss", () => {
  // Reporting rows only: 800/1000, 0/200, 0/100, 100/500 = 900 of 1800 = 50%.
  // The VOICE_FLOW row carries 9000 prompt tokens and NO cache report. Coalesce
  // it to zero and the denominator becomes 10800, so the rate collapses to 8.3%
  // and a cache that is working looks broken.
  eq(D.cache.reportingCalls, 4, "only calls that reported cache data may count");
  eq(D.cache.reportingPromptTokens, 1800, "the denominator is the prompt tokens of REPORTING calls only");
  eq(D.cache.cachedPromptTokens, 900, "cached tokens");
  near(D.cache.hitRate, 0.5, "fleet hit rate");
  assert(D.cache.hitRate! > 0.4, "a null cache column must not be counted as a cache miss");
  eq(D.cache.cacheWriteTokens, 200, "cache write tokens");
});

check("S6 a model nobody reported cache for has no hit rate at all, which is not the same as zero", () => {
  const fallback = D.byModel.find((m) => m.model === "openai/gpt-4.1-mini")!;
  eq(fallback.cache.reportingCalls, 0, "that model reported nothing");
  eq(fallback.cache.hitRate, null, "no data must render as no data, never as 0%");
  // And a genuine zero must still be a zero, or the null rule has gone too far.
  const router = D.byModel.find((m) => m.model === "qwen/qwen3-30b-a3b-instruct-2507")!;
  eq(router.cache.hitRate, 0, "a reported zero hit is a real 0%, not missing data");
  const grok = D.byModel.find((m) => m.model === "x-ai/grok-4.3")!;
  near(grok.cache.hitRate, 900 / 1500, "grok: 900 cached of the 1500 prompt tokens on its reporting calls");
});

check("S7 the cache discount is attributed, never subtracted from cost a second time", () => {
  near(D.cache.discountUsd, 0.25, "USD the cache saved");
  // cost_usd already reflects it. If anyone ever nets it off, the total drops to
  // 0.77 and every downstream figure is quietly 25 cents light.
  near(D.totals.costUsd, TOTAL, "the discount must not be deducted from spend");
  near(D.clones[0].costUsd, 0.78, "nor from the clone that earned it");
});

// ── S8 models ────────────────────────────────────────────────────────────────

check("S8 every model is listed, ranked, and flagged when no clone configured it", () => {
  eq(D.byModel[0].model, "x-ai/grok-4.3", "models rank by cost");
  const grok = D.byModel.find((m) => m.model === "x-ai/grok-4.3")!;
  near(grok.costUsd, 0.89, "grok cost (0.5 + 0.25 + 0.1 + 0.04)");
  eq(grok.calls, 4, "grok calls");
  eq(grok.errors, 1, "grok failures");
  eq(grok.promptTokens, 10500, "grok prompt tokens count EVERY call, cache-reporting or not");
  eq(grok.configured, true, "grok is a configured model");
  // The headline of the model table: spend the operator never chose. Both of
  // these are hardcoded in bot code and appear in no dashboard config.
  const unconfigured = D.unconfiguredModels;
  assert(unconfigured.includes("openai/gpt-4.1-mini"), "the LLM fallback must be flagged as unconfigured");
  assert(unconfigured.includes("openai/gpt-5-mini"), "the image moderation model must be flagged as unconfigured");
  assert(!unconfigured.includes("x-ai/grok-4.3"), "a configured model must not be flagged");
  // A row with no model at all still has to carry its cost somewhere visible.
  const nameless = D.byModel.find((m) => m.model === "(no model recorded)")!;
  near(nameless.costUsd, 0.07, "the model-less row's cost must still be listed");
});

// ── S9 the headline number ───────────────────────────────────────────────────

check("S9 cost per fan message divides by fan messages, and says nothing when there are none", () => {
  near(D.totals.costPerFanMessageUsd, TOTAL / 200, "fleet cost per fan message");
  near(D.clones[0].costPerFanMessageUsd, 0.78 / 150, "Alanna cost per fan message");
  eq(D.clones[2].costPerFanMessageUsd, null, "no fan messages means no ratio, not a divide by zero");
  const empty = rollUpSpend([], {
    window: "today",
    startIso: "x",
    endIso: "y",
    truncated: false,
    clones: [],
    configuredModels: [],
    fanMessages: 0,
  });
  eq(empty.totals.costPerFanMessageUsd, null, "an empty window must not report Infinity or NaN");
  eq(empty.totals.costUsd, 0, "an empty window costs nothing");
  eq(empty.cache.hitRate, null, "an empty window has no hit rate");
});

// ── S10 the window ───────────────────────────────────────────────────────────

check("S10 today starts at midnight, the rolling windows do not", () => {
  const now = new Date(2026, 7, 12, 14, 30, 0).getTime();
  const today = windowRange("today", now);
  const midnight = new Date(2026, 7, 12, 0, 0, 0, 0).getTime();
  eq(today.startMs, midnight, "today must start at local midnight, like every other 'today' here");
  eq(today.endMs, now, "today must end now");
  eq(windowRange("7d", now).startMs, now - 7 * 86_400_000, "7d is rolling");
  eq(windowRange("30d", now).startMs, now - 30 * 86_400_000, "30d is rolling");
});

// ── S11 money never renders as $0.00 for a real cost ─────────────────────────

check("S11 fractions of a cent are shown, not rounded away to $0.00", () => {
  // The failure mode this page exists to avoid: 2dp dollars turn the whole table
  // into "$0.00" and the operator concludes nothing costs anything.
  assert(!fmtUsd(0.000042).startsWith("$0.00 "), "sub-cent costs must keep their digits");
  eq(fmtUsd(0.000042), "$0.000042", "a sub-cent cost");
  eq(fmtUsd(0.0123), "$0.0123", "a cent-scale cost");
  eq(fmtUsd(0), "$0", "a genuine zero is the only thing that renders as zero");
  eq(fmtUsd(1234.5), "$1,234.50", "a big number stays readable");
  eq(fmtCents(null), "n/a", "an absent ratio must not render as 0 cents");
  eq(fmtCents(0.0051), "0.510¢", "cost per fan message in cents");
});

// ── S12 the read is paged ────────────────────────────────────────────────────

check("S12 the spend read pages, and the fan-message count does not fetch rows", () => {
  // Source-level, deliberately: usage_events runs ~11k rows/day, so an unpaged
  // select returns the first 1000 and reports the total as if it were complete.
  // The helper being correct is worth nothing if this read does not call it.
  const src = readFileSync(new URL("../lib/spend-data.ts", import.meta.url), "utf8");
  const fetchBody = src.slice(src.indexOf("export async function getSpendData"));
  assert(fetchBody.includes("selectAllRows"), "getSpendData must read usage_events through selectAllRows");
  assert(/truncated/.test(fetchBody), "getSpendData must carry the truncation flag through, not swallow it");
  assert(/head:\s*true/.test(src), "the fan message count must be a HEAD count, not a fetch of chat_history rows");
  assert(!/\.insert\(|\.update\(|\.upsert\(|\.delete\(/.test(src), "the spend page is read only");
});

// ── report ───────────────────────────────────────────────────────────────────

console.log("spend roll-up");
console.log(`  ${passed} passed`);
for (const f of failures) console.error(`  ✗ ${f}`);
console.log(failures.length === 0 ? "\nALL PASS" : `\n${failures.length} FAILURE(S)`);
process.exit(failures.length === 0 ? 0 : 1);
