import { supabaseAdmin } from "./supabase";
import { chartColorForClone } from "./colors";

// ── Where the AI money goes (/spend) ─────────────────────────────────────────
//
// The operator's question, in his words: "i wanna see every model being used and
// cost per girl per flow per text gen EVERYTHING". Until migration 107 nothing
// on a usage_events row could answer it — `kind` is llm/tts/stt, the TRANSPORT,
// not the reason. 107 added `flow` (why the call happened) and the four cache
// columns, so this file is the roll-up layer over them.
//
// Same house style as lib/analytics-data.ts and lib/dashboard-data.ts: fetch
// scoped columns, filter the window in SQL, roll up in JS. Unlike those two this
// one PAGES (see fetchUsageEventsPaged below) — usage_events runs ~66k rows/day,
// so a 30-day read is ~2M rows and an unpaged select returns the first 1000 of
// them without saying so. It pages by CURSOR, never by offset; the offset read
// it replaced is what took the dashboard down on 2026-08-18.
//
// READ ONLY. Nothing here writes.

// ── Flow vocabulary ──────────────────────────────────────────────────────────
// EXACTLY the strings in ../bot/src/services/usage.ts (ROUTE_FLOWS / JOB_FLOWS /
// SYSTEM_FLOWS). Not a parallel vocabulary — a spend query and a log search use
// the same words. Do not invent variants; the bot's normalizeFlow() is an
// allowlist, so a label not in this list can never appear in the column.

/** Live reply routes: a fan is sitting there waiting for this one. */
export const LIVE_FLOWS = [
  "TEXT_FLOW",
  "VOICE_FLOW",
  "IMAGE_FLOW",
  "VIDEO_FLOW",
  "SPOIL_FLOW",
  "BUNDLE_FLOW",
  "VISION_FLOW",
  "VIP_FLOW",
] as const;

/** Background senders: nobody is waiting, and it still costs real money. */
export const BACKGROUND_FLOWS = [
  "campaign",
  "drip",
  "followup",
  "free_preview",
  "manual_send",
  "star_reconcile",
  "onboarding",
] as const;

/** Paid on every turn, on top of the reply itself. The spend nobody remembers. */
export const OVERHEAD_FLOWS = [
  "routing",
  "media_match",
  "profile_extract",
  "safety",
  "image_moderation",
  "voice_enhance",
  "name_capture",
] as const;

export type FlowGroup = "live" | "background" | "overhead" | "unattributed";

export const FLOW_GROUP_LABEL: Record<FlowGroup, string> = {
  live: "Live replies",
  background: "Background sends",
  overhead: "Per-turn overhead",
  unattributed: "Unattributed",
};

const GROUP_OF = new Map<string, FlowGroup>([
  ...LIVE_FLOWS.map((f) => [f, "live"] as const),
  ...BACKGROUND_FLOWS.map((f) => [f, "background"] as const),
  ...OVERHEAD_FLOWS.map((f) => [f, "overhead"] as const),
]);

/**
 * Which bucket a flow label belongs to. NULL is its own bucket, never guessed
 * into one of the others — the bot writes null rather than a wrong label, and
 * every row logged before migration 107 has null, so silently folding those into
 * "live" would overstate reply cost by the entire history.
 */
export function flowGroup(flow: string | null | undefined): FlowGroup {
  if (!flow) return "unattributed";
  return GROUP_OF.get(flow) ?? "unattributed";
}

// ── Windows ──────────────────────────────────────────────────────────────────

export type SpendWindow = "today" | "7d" | "30d";

export const SPEND_WINDOWS: { key: SpendWindow; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
];

export function isSpendWindow(v: unknown): v is SpendWindow {
  return v === "today" || v === "7d" || v === "30d";
}

// ── Provider filter ───────────────────────────────────────────────────────────
// Ronan, 2026-08-14: "have a filter which only shows OpenRouter" - the page
// mixes three billers into one dollar figure (OpenRouter for every LLM call,
// ElevenLabs for voice, Deepgram for transcription), which is exactly what
// makes "why is OpenRouter burning money" impossible to answer from this page
// on its own. `kind` on usage_events is already llm/tts/stt at the source
// (services/llm.ts, services/tts.ts, services/stt.ts in ../bot), and every
// `kind: "llm"` row IS an OpenRouter call - there is no other LLM provider
// wired up - so this is a straight filter, not a new attribution scheme.
export type SpendProvider = "all" | "openrouter" | "elevenlabs" | "deepgram";

export const SPEND_PROVIDERS: { key: SpendProvider; label: string }[] = [
  { key: "all", label: "All" },
  { key: "openrouter", label: "OpenRouter" },
  { key: "elevenlabs", label: "ElevenLabs" },
  { key: "deepgram", label: "Deepgram" },
];

export function isSpendProvider(v: unknown): v is SpendProvider {
  return v === "all" || v === "openrouter" || v === "elevenlabs" || v === "deepgram";
}

/** The usage_events.kind value a provider filter maps to, or null for "all". */
function kindForProvider(p: SpendProvider): "llm" | "tts" | "stt" | null {
  if (p === "openrouter") return "llm";
  if (p === "elevenlabs") return "tts";
  if (p === "deepgram") return "stt";
  return null;
}

/** Window bounds in ms. "today" is midnight server-local, matching every other
 *  "today" on this dashboard; 7d/30d are rolling from now. */
export function windowRange(w: SpendWindow, now = Date.now()): { startMs: number; endMs: number } {
  if (w === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return { startMs: d.getTime(), endMs: now };
  }
  const days = w === "7d" ? 7 : 30;
  return { startMs: now - days * 86_400_000, endMs: now };
}

// ── Row + result shapes ──────────────────────────────────────────────────────

/** One usage_events row, exactly the columns this page selects. `cost_usd` and
 *  `cache_discount_usd` are postgres `numeric`, which supabase-js hands back as
 *  a STRING to avoid float drift — every read of them goes through Number(). */
export type SpendUsageRow = {
  clone_id: string | null;
  flow: string | null;
  kind: string | null;
  model: string | null;
  cost_usd: number | string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  cached_prompt_tokens: number | null;
  cache_write_tokens: number | null;
  cache_discount_usd: number | string | null;
  ok: boolean | null;
};

export type CacheStats = {
  /** Calls whose provider reported cached_prompt_tokens at all. */
  reportingCalls: number;
  /** Prompt tokens on those calls only — the hit-rate denominator. */
  reportingPromptTokens: number;
  cachedPromptTokens: number;
  cacheWriteTokens: number;
  /** cached / reportingPromptTokens, 0..1. NULL when nothing reported: "no data"
   *  and "0% hit rate" are different facts and must not render the same. */
  hitRate: number | null;
  /** USD the provider says the cache saved. ALREADY inside cost_usd — this is
   *  attribution, not a further deduction. Never subtract it again. */
  discountUsd: number;
};

export type FlowSpend = {
  flow: string | null;
  label: string;
  group: FlowGroup;
  costUsd: number;
  calls: number;
  share: number; // of total cost in the window, 0..1
};

export type CloneSpend = {
  id: string;
  name: string;
  color: string;
  costUsd: number;
  calls: number;
  errors: number;
  byGroup: Record<FlowGroup, number>;
  /** Ranked biggest first, only flows this clone actually spent on. */
  byFlow: FlowSpend[];
  costPerFanMessageUsd: number | null;
  fanMessages: number;
};

export type ModelSpend = {
  model: string;
  kind: string | null;
  costUsd: number;
  calls: number;
  errors: number;
  promptTokens: number;
  completionTokens: number;
  cache: CacheStats;
  /** False when no clone has this model in any of its *_model columns, i.e.
   *  spend the operator never chose. openai/gpt-4.1-mini (the LLM fallback) and
   *  openai/gpt-5-mini (image moderation) are hardcoded in bot code and appear
   *  in no dashboard config, so they land here every time. */
  configured: boolean;
};

export type SpendData = {
  window: SpendWindow;
  startIso: string;
  endIso: string;
  /** True when the paged read hit its ceiling: every total below is then a
   *  LOWER BOUND, and the page says so rather than quietly under-reporting. */
  truncated: boolean;
  totals: {
    costUsd: number;
    calls: number;
    errors: number;
    byGroup: Record<FlowGroup, number>;
    fanMessages: number;
    costPerFanMessageUsd: number | null;
  };
  cache: CacheStats;
  clones: CloneSpend[];
  byFlow: FlowSpend[];
  byModel: ModelSpend[];
  /** Models charging money that no clone is configured to use. */
  unconfiguredModels: string[];
};

// ── The roll-up ──────────────────────────────────────────────────────────────

const num = (v: number | string | null | undefined): number => {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
};

function emptyGroups(): Record<FlowGroup, number> {
  return { live: 0, background: 0, overhead: 0, unattributed: 0 };
}

function emptyCache(): CacheStats {
  return {
    reportingCalls: 0,
    reportingPromptTokens: 0,
    cachedPromptTokens: 0,
    cacheWriteTokens: 0,
    hitRate: null,
    discountUsd: 0,
  };
}

/**
 * Fold one row into a cache accumulator.
 *
 * THE NULL RULE, and the whole reason this is a named function rather than four
 * inline `+=`: cached_prompt_tokens NULL means the provider reported NOTHING,
 * which is not the same as a zero hit. Coalescing null to 0 would add that call's
 * prompt tokens to the denominator with nothing in the numerator, so every
 * non-caching model (grok, eleven, deepgram — the bulk of today's calls) would
 * drag the fleet hit rate toward zero and make a working cache look broken. So a
 * null row contributes to NEITHER side. Its `cost_usd` still counts everywhere
 * else; it is only invisible to cache maths.
 */
function foldCache(acc: CacheStats, r: SpendUsageRow): void {
  acc.discountUsd += num(r.cache_discount_usd); // attribution only, never subtracted from cost
  if (r.cached_prompt_tokens == null) return;
  acc.reportingCalls += 1;
  acc.reportingPromptTokens += r.prompt_tokens ?? 0;
  acc.cachedPromptTokens += r.cached_prompt_tokens;
  acc.cacheWriteTokens += r.cache_write_tokens ?? 0;
}

function sealCache(acc: CacheStats): CacheStats {
  acc.hitRate = acc.reportingPromptTokens > 0 ? acc.cachedPromptTokens / acc.reportingPromptTokens : null;
  return acc;
}

export type CloneLite = { id: string; name: string; color: string };

/**
 * Pure roll-up: usage rows in, the whole page's numbers out. Separated from the
 * fetch on purpose so the check in scripts/check-spend.ts asserts the ARITHMETIC
 * against handmade rows, with no database and no markup involved. A wrong sum
 * here sends the operator chasing the wrong cost.
 */
export function rollUpSpend(
  rows: SpendUsageRow[],
  ctx: {
    window: SpendWindow;
    startIso: string;
    endIso: string;
    truncated: boolean;
    clones: CloneLite[];
    /** Configured model ids from every clone's *_model columns. */
    configuredModels: Iterable<string>;
    /** chat_history rows with role='human' in the window, fleet-wide. */
    fanMessages: number;
    /** Same, per clone id. Absent ids simply have no per-clone denominator. */
    fanMessagesByClone?: Map<string, number>;
  },
): SpendData {
  const configured = new Set(
    Array.from(ctx.configuredModels)
      .filter((m): m is string => typeof m === "string" && m.trim() !== "")
      .map((m) => m.trim().toLowerCase()),
  );

  const totals = { costUsd: 0, calls: 0, errors: 0, byGroup: emptyGroups() };
  const fleetCache = emptyCache();

  type CloneAcc = { costUsd: number; calls: number; errors: number; byGroup: Record<FlowGroup, number>; flows: Map<string, { cost: number; calls: number }> };
  const cloneAcc = new Map<string, CloneAcc>();
  const flowAcc = new Map<string, { cost: number; calls: number }>();
  type ModelAcc = { kind: string | null; cost: number; calls: number; errors: number; pt: number; ct: number; cache: CacheStats };
  const modelAcc = new Map<string, ModelAcc>();

  // "" is the key for a null flow / null model, so the unattributed bucket is a
  // real row on the page rather than a silently dropped one.
  const FLOW_NULL = "";

  for (const r of rows) {
    const cost = num(r.cost_usd);
    const group = flowGroup(r.flow);
    const failed = r.ok === false;

    // Fleet totals count EVERY row, including rows with no clone_id — an
    // unattributed call still cost real money and must not vanish.
    totals.costUsd += cost;
    totals.calls += 1;
    if (failed) totals.errors += 1;
    totals.byGroup[group] += cost;
    foldCache(fleetCache, r);

    const flowKey = r.flow ?? FLOW_NULL;
    const f = flowAcc.get(flowKey) ?? { cost: 0, calls: 0 };
    f.cost += cost;
    f.calls += 1;
    flowAcc.set(flowKey, f);

    const modelKey = r.model ?? FLOW_NULL;
    const m = modelAcc.get(modelKey) ?? { kind: r.kind ?? null, cost: 0, calls: 0, errors: 0, pt: 0, ct: 0, cache: emptyCache() };
    m.cost += cost;
    m.calls += 1;
    if (failed) m.errors += 1;
    m.pt += r.prompt_tokens ?? 0;
    m.ct += r.completion_tokens ?? 0;
    foldCache(m.cache, r);
    modelAcc.set(modelKey, m);

    // Per-clone stats need a clone to attribute to; those rows are already in
    // the fleet totals above.
    if (!r.clone_id) continue;
    const c = cloneAcc.get(r.clone_id) ?? { costUsd: 0, calls: 0, errors: 0, byGroup: emptyGroups(), flows: new Map() };
    c.costUsd += cost;
    c.calls += 1;
    if (failed) c.errors += 1;
    c.byGroup[group] += cost;
    const cf = c.flows.get(flowKey) ?? { cost: 0, calls: 0 };
    cf.cost += cost;
    cf.calls += 1;
    c.flows.set(flowKey, cf);
    cloneAcc.set(r.clone_id, c);
  }

  const share = (cost: number) => (totals.costUsd > 0 ? cost / totals.costUsd : 0);
  const flowLabel = (flow: string | null) => flow ?? "Unattributed";

  const toFlowRows = (src: Map<string, { cost: number; calls: number }>): FlowSpend[] =>
    Array.from(src.entries())
      .map(([key, v]) => {
        const flow = key === FLOW_NULL ? null : key;
        return { flow, label: flowLabel(flow), group: flowGroup(flow), costUsd: v.cost, calls: v.calls, share: share(v.cost) };
      })
      .sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls);

  const clones: CloneSpend[] = ctx.clones
    .map((c) => {
      const a = cloneAcc.get(c.id);
      const fanMessages = ctx.fanMessagesByClone?.get(c.id) ?? 0;
      const costUsd = a?.costUsd ?? 0;
      return {
        id: c.id,
        name: c.name,
        color: c.color,
        costUsd,
        calls: a?.calls ?? 0,
        errors: a?.errors ?? 0,
        byGroup: a?.byGroup ?? emptyGroups(),
        byFlow: a ? toFlowRows(a.flows) : [],
        fanMessages,
        costPerFanMessageUsd: fanMessages > 0 ? costUsd / fanMessages : null,
      };
    })
    // Biggest first: the operator wants to know who is expensive.
    .sort((a, b) => b.costUsd - a.costUsd || a.name.localeCompare(b.name));

  const byModel: ModelSpend[] = Array.from(modelAcc.entries())
    .map(([key, m]) => ({
      model: key === FLOW_NULL ? "(no model recorded)" : key,
      kind: m.kind,
      costUsd: m.cost,
      calls: m.calls,
      errors: m.errors,
      promptTokens: m.pt,
      completionTokens: m.ct,
      cache: sealCache(m.cache),
      configured: key !== FLOW_NULL && configured.has(key.toLowerCase()),
    }))
    .sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls);

  return {
    window: ctx.window,
    startIso: ctx.startIso,
    endIso: ctx.endIso,
    truncated: ctx.truncated,
    totals: {
      ...totals,
      fanMessages: ctx.fanMessages,
      costPerFanMessageUsd: ctx.fanMessages > 0 ? totals.costUsd / ctx.fanMessages : null,
    },
    cache: sealCache(fleetCache),
    clones,
    byFlow: toFlowRows(flowAcc),
    byModel,
    unconfiguredModels: byModel.filter((m) => !m.configured && m.costUsd > 0).map((m) => m.model),
  };
}

// ── The fetch ────────────────────────────────────────────────────────────────

// Every *_model column on `clones`. Anything charging money that is not in this
// set is spend the operator never configured.
const MODEL_COLUMNS = [
  "text_model",
  "voice_model",
  "media_model",
  "routing_model",
  "voice_enhance_model",
  "photo_reply_model",
  "vision_model",
  "eleven_model",
] as const;

// usage_events ran ~11k rows/day when this was first built; by 2026-08-13 it
// was ~66k/day and climbing with the fleet, so 30 days can be 1-2M rows. Raised
// deliberately rather than left to truncate silently, and the result still
// carries `truncated` for the day the fleet outgrows even this.
const USAGE_MAX_ROWS = 400_000;

const USAGE_SELECT_COLS =
  "clone_id,flow,kind,model,cost_usd,prompt_tokens,completion_tokens,cached_prompt_tokens,cache_write_tokens,cache_discount_usd,ok";
// The roll-up never reads created_at or id, but the CURSOR does, so the keyset
// read has to ask for them. Selecting only USAGE_SELECT_COLS here would hand
// back rows whose created_at is undefined, the cursor would never advance, and
// every slice would return its first page over and over. Kept as a separate
// constant so the roll-up's column list stays the roll-up's business.
const USAGE_KEYSET_COLS = `${USAGE_SELECT_COLS},created_at,id`;
const USAGE_PAGE = 1000;

// THE OUTAGE THIS EXISTS FOR (2026-08-18). Both earlier versions of this
// function paged with .range(from, to), which is LIMIT/OFFSET. Postgres cannot
// seek to an offset: it walks and discards every row before it, so page N costs
// N*1000 rows of work. At ~66k rows/day the 30-day window matches ~2M rows and
// the read runs to the 400k ceiling, i.e. OFFSET 399000 on the last page. Those
// pages blew the statement timeout ("canceling statement due to statement
// timeout"), ten at a time, and the hung request pool took the whole Next
// process down - Apache served "Proxy Error / Error reading from remote server"
// on every route, not just /spend. Adding concurrency made it worse, not
// better: it multiplied the number of simultaneous 400k-row sorts.
//
// So there is no OFFSET anywhere below. Two mechanisms replace it:
//
//   1. TIME SLICING gives concurrency. created_at is already the ordering key,
//      so cutting the window into N consecutive spans splits the rows into N
//      ordered, non-overlapping groups. Concatenating the slices in slice order
//      reproduces the exact global created_at+id ordering - no merge needed.
//   2. KEYSET (cursor) PAGING walks each slice. Every page asks for rows AFTER
//      the last row it saw rather than for rows at an offset, which is an index
//      seek on (created_at, id) and costs the same whether it is page 1 or page
//      400.
//
// Do not "optimise" this back to .range() on a whole window. The offset is the
// bug; the round trips never were.
const USAGE_SLICES = 10;

// Safety stop for the cursor loop inside one slice. A slice is 1/10th of the
// window, so 2000 pages is 2M rows in a single slice - far past USAGE_MAX_ROWS
// and only reachable if a cursor ever failed to advance. Bounded so a bad
// cursor cannot spin forever the way the offset read could not fail fast.
const USAGE_MAX_PAGES_PER_SLICE = 2000;

/** PostgREST filter value: double-quote it so the `+00:00` and `:` in a
 *  timestamp cannot be read as filter syntax, and escape any embedded quote. */
function pgrestValue(v: string): string {
  return `"${v.replace(/"/g, '\\"')}"`;
}

/** One slice of the read window. `inclusiveEnd` picks lte over lt. */
export type UsageSlice = { from: string; to: string; inclusiveEnd: boolean };

/**
 * Cut [startIso, endIso] into `sliceCount` consecutive spans.
 *
 * EXPORTED FOR THE CHECK, because the two ways this can be wrong both lose
 * money silently rather than throwing: a gap between slices drops every row in
 * it, and an overlap counts those rows twice. So the contract is exact - slice
 * i's `to` IS slice i+1's `from`, every slice is half-open, and only the LAST
 * one closes its upper bound (reproducing the single `lte` the unsliced read
 * used, so the row set is unchanged). A window that cannot be sliced (equal
 * bounds, reversed bounds, unparseable) degrades to one inclusive slice rather
 * than to zero slices, i.e. to "slower", never to "empty".
 */
export function usageSliceBounds(startIso: string, endIso: string, sliceCount: number): UsageSlice[] {
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  const n =
    Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs && sliceCount > 1
      ? Math.floor(sliceCount)
      : 1;
  if (n === 1) return [{ from: startIso, to: endIso, inclusiveEnd: true }];

  const width = (endMs - startMs) / n;
  const slices: UsageSlice[] = [];
  for (let i = 0; i < n; i++) {
    const isLast = i === n - 1;
    slices.push({
      from: i === 0 ? startIso : new Date(startMs + width * i).toISOString(),
      to: isLast ? endIso : new Date(startMs + width * (i + 1)).toISOString(),
      inclusiveEnd: isLast,
    });
  }
  return slices;
}

/**
 * The PostgREST spelling of `(created_at, id) > (cursorAt, cursorId)`.
 *
 * EXPORTED FOR THE CHECK. Two failure modes, both silent:
 *   - `gte` instead of `gt` on created_at re-returns the cursor row forever, so
 *     the slice never advances and the page guard is the only thing that stops
 *     it.
 *   - dropping the `id` leg skips every row that shares a created_at with the
 *     cursor except one. usage_events writes many rows per timestamp, so this
 *     does not lose an edge case, it loses a slice of the bill.
 */
export function usageCursorFilter(cursorAt: string, cursorId: string): string {
  const at = pgrestValue(cursorAt);
  return `created_at.gt.${at},and(created_at.eq.${at},id.gt.${pgrestValue(cursorId)})`;
}

/**
 * usage_events for the window, read with time-sliced keyset paging.
 *
 * Concurrency comes from the slices (10 in flight), and each slice walks
 * forward on a (created_at, id) cursor. The row set and its order are identical
 * to the old offset read; only the cost per page changes, from O(offset) to
 * O(1). `maxRows` is a shared budget across slices rather than a prefix cut:
 * a truncated spend read is already flagged as a lower bound, and losing rows
 * spread across the window keeps the chart's shape, where a hard prefix would
 * silently end the month early and read as "spend stopped".
 */
export async function fetchUsageEventsPaged(
  startIso: string,
  endIso: string,
  cloneId: string | null,
  provider: SpendProvider,
  maxRows: number,
  // Seam for the check, NOT a feature. check-spend.ts drives this exact loop
  // against a fake that enforces PostgREST semantics, because the failures that
  // matter here (a cursor that does not advance, a slice boundary that drops
  // rows) produce a plausible smaller number rather than an error, and a
  // source-text assertion cannot see either one.
  client: { from: (t: string) => any } = supabaseAdmin,
): Promise<{ rows: SpendUsageRow[]; truncated: boolean }> {
  const kind = kindForProvider(provider);
  /** Every filter except the window, which each slice narrows for itself. */
  const scoped = <Q extends { eq: any }>(q: Q): Q => {
    let x = q;
    if (cloneId) x = x.eq("clone_id", cloneId);
    if (kind) x = x.eq("kind", kind);
    return x;
  };

  const slices = usageSliceBounds(startIso, endIso, USAGE_SLICES);

  // Shared so ten concurrent slices cannot each fetch maxRows and hand back 10x
  // the ceiling the caller asked for.
  let budget = maxRows;
  let hitCeiling = false;

  async function readSlice(slice: UsageSlice, i: number): Promise<SpendUsageRow[]> {
    const rows: SpendUsageRow[] = [];
    const { from, to, inclusiveEnd } = slice;

    let cursorAt: string | null = null;
    let cursorId: string | null = null;

    for (let page = 0; page < USAGE_MAX_PAGES_PER_SLICE; page++) {
      if (budget <= 0) {
        hitCeiling = true;
        return rows;
      }
      // RESERVE the page's worth of budget before awaiting, and refund whatever
      // the page did not use once it lands. Decrementing after the await instead
      // lets all ten slices read the same budget, each fetch a full page, and
      // hand back up to maxRows + 9 pages.
      const limit = Math.min(USAGE_PAGE, budget);
      budget -= limit;

      let q = scoped(client.from("usage_events").select(USAGE_KEYSET_COLS)).gte("created_at", from);
      q = inclusiveEnd ? q.lte("created_at", to) : q.lt("created_at", to);
      if (cursorAt !== null) q = q.or(usageCursorFilter(cursorAt, String(cursorId)));

      const { data, error } = await q
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(limit);

      if (error) {
        console.error(`[spend usage_events] slice ${i} (${from}..${to}) page ${page} failed: ${error.message}`);
        budget += limit; // this slice is giving up; the other nine may still use it
        hitCeiling = true;
        return rows;
      }
      const batch = (data ?? []) as SpendUsageRow[];
      budget += limit - batch.length; // refund the unused reservation
      if (batch.length === 0) return rows;

      rows.push(...batch);

      // A short page is the end of the slice: the server had nothing more to
      // give, which is the only reliable end signal (a full page could be
      // either). Same rule selectAllRows uses.
      if (batch.length < limit) return rows;

      const last = batch[batch.length - 1] as unknown as { created_at?: string; id?: string | number };
      // No usable cursor means the next page would repeat this one forever.
      // Stop and flag rather than loop or silently drop the rest.
      if (!last?.created_at || last.id == null) {
        console.error(`[spend usage_events] slice ${i} page ${page} returned rows without created_at/id; stopping.`);
        hitCeiling = true;
        return rows;
      }
      cursorAt = last.created_at;
      cursorId = String(last.id);
    }

    console.error(`[spend usage_events] slice ${i} hit the ${USAGE_MAX_PAGES_PER_SLICE} page guard; totals are a lower bound.`);
    hitCeiling = true;
    return rows;
  }

  const perSlice = await Promise.all(slices.map((s, i) => readSlice(s, i)));
  if (hitCeiling) {
    console.warn(`[spend usage_events] stopped short of the full window; totals below are lower bounds.`);
  }
  // Slice order IS created_at order, so a flat concat is already sorted.
  return { rows: perSlice.flat(), truncated: hitCeiling };
}

export async function getSpendData(
  window: SpendWindow,
  cloneId: string | null = null,
  provider: SpendProvider = "all",
  now = Date.now(),
): Promise<SpendData> {
  const { startMs, endMs } = windowRange(window, now);
  const startIso = new Date(startMs).toISOString();
  const endIso = new Date(endMs).toISOString();

  // ── clones: names, colors, and every configured model id ───────────────────
  const { data: cloneRows } = await supabaseAdmin
    .from("clones")
    .select(`id,name,intake,${MODEL_COLUMNS.join(",")}`)
    .order("created_at", { ascending: true });
  const cloneRecords = ((cloneRows ?? []) as unknown as Record<string, unknown>[]).filter(
    (c) => !cloneId || c.id === cloneId,
  );
  const clones: CloneLite[] = cloneRecords.map((c, i) => ({
    id: String(c.id),
    name: String(c.name ?? "Unnamed"),
    color: chartColorForClone(c.intake, i),
  }));
  const configuredModels: string[] = [];
  for (const c of cloneRecords) {
    for (const col of MODEL_COLUMNS) {
      const v = c[col];
      if (typeof v === "string" && v.trim()) configuredModels.push(v.trim());
    }
  }

  // ── usage_events in the window, TIME-SLICED KEYSET READ ────────────────────
  // usage_events passed ~66k rows/day by 2026-08-13 (fleet growth, not a leak -
  // see the tracker's spend investigation), six times the ~11k/day this was
  // built against, so a 30d window matches ~2M rows and runs to the 400k
  // ceiling. Every earlier version paged with OFFSET, which made the last pages
  // cost ~400k discarded rows each and took the whole dashboard down on
  // 2026-08-18. fetchUsageEventsPaged now walks a (created_at, id) cursor inside
  // each of USAGE_SLICES time slices - same rows, same order, constant cost per
  // page. Full reasoning at its definition above.
  const { rows: usageRows, truncated } = await fetchUsageEventsPaged(startIso, endIso, cloneId, provider, USAGE_MAX_ROWS);

  // ── fan messages in the window (the cost-per-message denominator) ──────────
  // A HEAD count, not a paged read: nothing here needs the rows themselves, and
  // chat_history is the biggest table in the database.
  const fanMessages = await countFanMessages(startIso, endIso, cloneId);
  const fanMessagesByClone = new Map<string, number>();
  await Promise.all(
    clones.map(async (c) => {
      fanMessagesByClone.set(c.id, await countFanMessages(startIso, endIso, c.id));
    }),
  );

  return rollUpSpend(usageRows, {
    window,
    startIso,
    endIso,
    truncated,
    clones,
    configuredModels,
    fanMessages,
    fanMessagesByClone,
  });
}

async function countFanMessages(startIso: string, endIso: string, cloneId: string | null): Promise<number> {
  let q = supabaseAdmin
    .from("chat_history")
    .select("id", { count: "exact", head: true })
    .eq("role", "human")
    .gte("created_at", startIso)
    .lte("created_at", endIso);
  if (cloneId) q = q.eq("clone_id", cloneId);
  const { count, error } = await q;
  if (error) {
    console.error(`[spend] fan message count failed: ${error.message}`);
    return 0;
  }
  return count ?? 0;
}

// ── Display units ────────────────────────────────────────────────────────────
// These are fractions of a cent per call, so a plain 2-decimal dollar renders the
// entire page as "$0.00". One adaptive USD formatter used EVERYWHERE on the page
// keeps the unit consistent while still showing small numbers: precision grows as
// the amount shrinks, and a genuine zero is the only thing that prints "$0".

export function fmtUsd(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "$0";
  const abs = Math.abs(n);
  const dp = abs >= 100 ? 2 : abs >= 1 ? 3 : abs >= 0.01 ? 4 : 6;
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

/** Per-fan-message cost only, where cents are the unit a human can reason about
 *  ("half a cent a message"). Always labelled with the cent sign so it is never
 *  mistaken for the dollar figures around it. */
export function fmtCents(usd: number | null): string {
  if (usd == null || !Number.isFinite(usd)) return "n/a";
  const c = usd * 100;
  return c.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + "¢";
}

export function fmtPct(v: number | null): string {
  return v == null ? "no data" : (v * 100).toFixed(1) + "%";
}

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}
