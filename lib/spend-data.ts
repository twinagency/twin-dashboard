import { supabaseAdmin } from "./supabase";
import { selectAllRows } from "./select-all";
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
// one PAGES (see selectAllRows below) — usage_events runs ~11k rows/day, so a
// 30-day read is ~330k rows and an unpaged select returns the first 1000 of them
// without saying so.
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

// usage_events runs ~11k rows/day, so 30 days is ~330k rows — past
// selectAllRows' 200k default. Raised deliberately rather than left to truncate
// silently, and the result still carries `truncated` for the day the fleet
// outgrows even this.
const USAGE_MAX_ROWS = 400_000;

export async function getSpendData(
  window: SpendWindow,
  cloneId: string | null = null,
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

  // ── usage_events in the window, PAGED ──────────────────────────────────────
  // The (clone_id, flow, created_at desc) index from migration 107 covers the
  // scoped read; the fleet-wide one is a plain range scan on created_at.
  // Ordered so page boundaries are deterministic: an unordered paged read can
  // repeat or skip rows between pages, and either one is a wrong sum.
  let usageQ = supabaseAdmin
    .from("usage_events")
    .select(
      "clone_id,flow,kind,model,cost_usd,prompt_tokens,completion_tokens,cached_prompt_tokens,cache_write_tokens,cache_discount_usd,ok",
    )
    .gte("created_at", startIso)
    .lte("created_at", endIso)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (cloneId) usageQ = usageQ.eq("clone_id", cloneId);
  const { rows: usageRows, truncated } = await selectAllRows<SpendUsageRow>(usageQ, {
    maxRows: USAGE_MAX_ROWS,
    label: "spend usage_events",
  });

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
