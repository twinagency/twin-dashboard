import { supabaseAdmin } from "@/lib/supabase";
import type { OrToolDef } from "@/lib/openrouter";
import { activeDialConflicts, type DialConflictCfg } from "@/lib/dial-conflicts";
import { findCloneByName, UUID } from "@/lib/clone-name-match";

// ── Read-only tool surface for the internal AI assistant ─────────────────────
// HARD RULE (see CLAUDE.md / project memory): this DB holds live payment and
// user data and must NEVER be mutated by anything AI-driven. Every tool below
// only ever calls `.select(...)` — never insert/update/delete/upsert/rpc — and
// `table`/`select`/`orderBy` are validated against the allowlist below before
// they ever reach supabase-js, so there is no path for the model to reach a
// column or table we haven't explicitly cleared. No raw SQL is ever built —
// queryTable only drives the Supabase JS query builder, which makes SQL
// injection structurally impossible (there's no SQL text from the model at all).

// Real Postgres tables (mirrors bot/db/schema.sql) → the columns the assistant
// may read. Deliberately excludes:
// - clones.bot_token: a live Telegram bot credential, never surfaced.
// - clones.persona / *_prompt / intake: large compiled blobs, not useful to
//     ask questions about and not worth the context-window cost.
// - app_settings.value: this key/value table stores raw third-party API
//     keys (openrouter_api_key, elevenlabs_api_key, deepgram_api_key — see
//     app/settings/fields.ts) alongside ordinary config like clone_defaults.
//     There's no safe per-row split, so `value` is excluded entirely; the
//     assistant can still see which keys exist/were last touched via `key`
//     and `updated_at`.
// - message_purchases / star_transactions payment-provider identifiers
//     (payment_charge_id, telegram_payment_charge_id, invoice_payload): payment
//     dedup keys, not useful for Q&A and closer to a secret than a fact.
// - users.business_connection_id / chat_id: raw Telegram routing internals.
// NOTE: "media" from the original table list isn't a real Postgres table — the
// bot only has a Supabase Storage BUCKET named "media" (photos/videos live in
// storage, rows live in the `photos` and `videos` tables below). There's
// nothing for queryTable to select there, so it's intentionally omitted; ask
// about `photos` / `videos` instead.
export const ALLOWLIST: Record<string, string[]> = {
  app_settings: ["key", "updated_at"],
  chat_history: ["id", "clone_id", "telegram_id", "role", "content", "created_at"],
  clones: [
    "id", "slug", "name", "status", "ai_mode", "smart_split",
    "photos_enabled", "videos_enabled", "bundles_enabled", "voice_enabled",
    "video_vision_enabled", "tips_enabled", "charge_messages",
    "live_captions_enabled", "reactions_enabled", "read_receipts_enabled",
    "message_effects_enabled", "ai_disclosure", "strict_minor_gate", "emojis_enabled", "emoji_amount",
    "sexual_level", "nsfw_level", "push_level",
    "text_model", "voice_model", "media_model", "routing_model",
    "voice_enhance_model", "photo_reply_model", "vision_model", "voice_id",
    "starting_credits", "credit_pack_size", "credit_pack_price_stars",
    "discounts_enabled", "discount_max_photo", "discount_max_video",
    "discount_max_bundle", "discount_max_credits", "spoil_options",
    "subscriptions_enabled", "subscription_tiers", "welcome_instruction", "welcome_bundle_after",
    "onboarding_voice_after", "smart_paywall_enabled", "paywall_instruction",
    "paywall_default_message", "drip_enabled", "drip_per_day",
    "drip_active_window_minutes", "winback_lapse_days", "followup_after_minutes",
    "timezone", "gender", "hometown", "current_city", "occupation", "vibe_preset",
    "deployed_at", "created_at", "updated_at",
    // Migration 097 advanced dials, already live.
    "bubble_delay_min_ms", "bubble_delay_max_ms", "silence_fallback_cooldown_seconds",
    "llm_max_tries", "discount_absolute_max_pct", "tip_max_stars", "realism_effects_enabled",
    "media_keywords", "voice_keywords", "tease_keywords", "tip_reask_cooldown_seconds",
    // Migration 099 advanced dials, batch 2.
    "reaction_ambient_chance_pct", "message_effect_chance_pct", "priority_wait_factor_pct",
    "gap_nudge_threshold_hours", "onboarding_max_messages", "onboarding_step_max_attempts",
    "onboarding_condition_window_messages", "profile_extract_first_at_messages",
    "profile_extract_every_n_messages", "spend_tier_whale_stars", "spend_tier_high_stars",
    "spend_tier_mid_stars", "spoil_context_lookback_messages",
    // Migration 098.
    "strict_onboarding_steps",
    // Migration 093. Needed by checkDialConflicts (silence-nsfw-max /
    // silence-fallback-cooldown-inert rules in lib/dial-conflicts.ts).
    "silence_fallback_mode",
  ],
  fan_profiles: ["user_id", "clone_id", "summary", "interests", "details", "preferences", "extracted_msg_count", "updated_at", "created_at"],
  feedback_items: ["id", "type", "title", "body", "status", "severity", "clone_id", "source", "created_at", "updated_at"],
  message_purchases: ["id", "clone_id", "user_id", "telegram_id", "amount_stars", "messages_granted", "purchased_at"],
  paywall_hits: ["id", "clone_id", "user_id", "telegram_id", "smart", "shown_at"],
  photo_bundle_items: ["id", "bundle_id", "storage_path", "sort_order"],
  photo_bundles: ["id", "clone_id", "name", "caption", "star_price", "is_onboarding", "created_at"],
  photos: ["id", "clone_id", "storage_path", "caption", "teaser_caption", "star_value", "image_name", "is_nude", "explicitness", "is_free", "nsfw", "tags", "auto_desc", "created_at"],
  prompt_templates: ["agent_type", "template", "slots", "description", "updated_at"],
  star_transactions: ["id", "clone_id", "user_id", "telegram_id", "kind", "amount_stars", "paid_at", "imported_from", "feature", "created_at"],
  system_logs: ["id", "ts", "level", "source", "clone_id", "telegram_id", "message", "detail"],
  usage_events: ["id", "clone_id", "user_id", "kind", "model", "prompt_tokens", "completion_tokens", "cost_usd", "ok", "error", "created_at"],
  users: [
    "id", "clone_id", "telegram_id", "name", "stated_name", "username", "language_code",
    "message_credits", "total_messages_purchased", "total_messages_sent",
    "is_active", "blocked", "first_seen_at", "last_message_received",
    "total_spent_stars", "purchase_count", "spend_tier", "is_high_spender",
    "subscription_tier", "subscription_status", "subscription_period_end", "subscription_is_recurring",
  ],
  videos: ["id", "clone_id", "storage_path", "caption", "teaser_caption", "star_value", "is_nude", "explicitness", "is_free", "nsfw", "tags", "auto_desc", "created_at"],
};

const TABLES = Object.keys(ALLOWLIST);
const FILTER_OPS = ["eq", "gt", "gte", "lt", "lte", "ilike"] as const;
type FilterOp = (typeof FILTER_OPS)[number];
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

type Filter = { column: string; op: FilterOp; value: string | number | boolean };

function clampLimit(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.floor(v));
}

// ── queryTable: the generic allowlisted reader ───────────────────────────────
async function execQueryTable(args: Record<string, unknown>): Promise<unknown> {
  const table = String(args.table ?? "");
  const allowedCols = ALLOWLIST[table];
  if (!allowedCols) return { error: `table not allowed: "${table}". Allowed tables: ${TABLES.join(", ")}` };

  // select: omit / "*" / [] → every allowed column for this table. Otherwise
  // must be a subset of the allowlist — no raw expressions, no embeds/joins.
  const rawSelect = args.select;
  let selectCols: string[];
  if (rawSelect == null || rawSelect === "*" || (Array.isArray(rawSelect) && rawSelect.length === 0)) {
    selectCols = allowedCols;
  } else {
    const requested = Array.isArray(rawSelect)
      ? rawSelect.map(String)
      : String(rawSelect).split(",").map((s) => s.trim()).filter(Boolean);
    const invalid = requested.filter((c) => !allowedCols.includes(c));
    if (invalid.length) return { error: `column(s) not allowed for "${table}": ${invalid.join(", ")}` };
    selectCols = requested;
  }

  let q = supabaseAdmin.from(table).select(selectCols.join(","));

  const rawFilters = args.filters;
  if (Array.isArray(rawFilters)) {
    for (const f of rawFilters) {
      if (!f || typeof f !== "object") return { error: "each filter must be an object {column, op, value}" };
      const { column, op, value } = f as Record<string, unknown>;
      if (typeof column !== "string" || !allowedCols.includes(column)) {
        return { error: `filter column not allowed for "${table}": ${String(column)}` };
      }
      if (typeof op !== "string" || !(FILTER_OPS as readonly string[]).includes(op)) {
        return { error: `filter op not allowed: ${String(op)}. Allowed ops: ${FILTER_OPS.join(", ")}` };
      }
      if (value === undefined) return { error: `filter on "${column}" is missing a value` };
      q = (q as any)[op](column, value as string | number | boolean);
    }
  } else if (rawFilters !== undefined) {
    return { error: "filters must be an array" };
  }

  const orderBy = args.orderBy;
  if (orderBy !== undefined) {
    if (typeof orderBy !== "string" || !allowedCols.includes(orderBy)) {
      return { error: `orderBy column not allowed for "${table}": ${String(orderBy)}` };
    }
    q = q.order(orderBy, { ascending: args.ascending === true });
  }

  const limit = clampLimit(args.limit);
  q = q.limit(limit);

  const { data, error } = await q;
  if (error) return { error: error.message };
  return { rows: data ?? [], rowCount: (data ?? []).length, limitApplied: limit };
}

// ── getTopSpenders: ranks users by lifetime Star spend ───────────────────────
// Uses users.total_spent_stars — a running ledger already maintained by the
// bot's add_spend() RPC on every purchase (see idx_users_spend in schema.sql,
// and the identical "Spent" sort on the Fans page, app/users/page.tsx) — rather
// than re-summing star_transactions in JS. Simpler, already-indexed, and stays
// consistent with what the Fans page itself calls "top spenders".
async function execGetTopSpenders(args: Record<string, unknown>): Promise<unknown> {
  const limit = clampLimit(args.limit ?? 10);
  let q = supabaseAdmin
    .from("users")
    .select("id,clone_id,telegram_id,name,stated_name,username,total_spent_stars,purchase_count,spend_tier,clones(name)")
    .order("total_spent_stars", { ascending: false })
    .limit(limit);
  if (typeof args.cloneId === "string" && args.cloneId) q = q.eq("clone_id", args.cloneId);

  const { data, error } = await q;
  if (error) return { error: error.message };
  const rows = (data ?? []).map((u: any) => ({
    userId: u.id,
    cloneId: u.clone_id,
    cloneName: u.clones?.name ?? null,
    telegramId: u.telegram_id,
    fanName: u.stated_name || u.name || `Fan ${u.telegram_id}`,
    username: u.username,
    totalSpentStars: u.total_spent_stars ?? 0,
    purchaseCount: u.purchase_count ?? 0,
    spendTier: u.spend_tier,
  }));
  return { rows };
}

// ── getRecentErrors: newest error-level system_logs rows ─────────────────────
// system_logs.level ('info'|'warn'|'error') is the real severity column, same
// one the Logs page (app/logs/page.tsx) filters/displays on.
async function execGetRecentErrors(args: Record<string, unknown>): Promise<unknown> {
  const limit = clampLimit(args.limit ?? 20);
  let q = supabaseAdmin
    .from("system_logs")
    .select("id,ts,level,source,clone_id,telegram_id,message,detail,clones(name,slug)")
    .eq("level", "error")
    .order("ts", { ascending: false })
    .limit(limit);
  if (typeof args.cloneId === "string" && args.cloneId) q = q.eq("clone_id", args.cloneId);

  const { data, error } = await q;
  if (error) return { error: error.message };
  return { rows: data ?? [] };
}

// Loose clone lookup shared by the test-run read tools below: try UUID, then
// slug, then exact case-insensitive name (lib/clone-name-match.ts), same
// three-step pattern write-tools.ts's resolveCloneId uses. The id step only
// runs on uuid-shaped input (anything else is a 22P02 error on clones.id), so
// any read error is real and throws; executeTool's caller (lib/openrouter.ts)
// turns a throw into a tool {error} result.
async function resolveCloneIdLoose(idOrName: string): Promise<string | null> {
  for (const col of UUID.test(idOrName) ? ["id", "slug"] : ["slug"]) {
    const r = await supabaseAdmin.from("clones").select("id").eq(col, idOrName).maybeSingle();
    if (r.error) throw new Error(`clone lookup failed: ${r.error.message}`);
    if (r.data) return r.data.id;
  }
  const byName = await findCloneByName<{ id: string }>(idOrName, (p) => supabaseAdmin.from("clones").select("id").ilike("name", p));
  return byName?.id ?? null;
}

// Mirror of heatLevel() in components/clone/useCloneConfig.ts, kept minimal:
// only the legacy low/high remap that column can actually hold pre-migration-082.
// Duplicated rather than imported because that file is "use client" and this
// route is server-only; same reasoning as lib/persona-facts.ts mirroring the
// bot's prompt.ts (see dashboard/CLAUDE.md).
function heatLevelServer(v: unknown): "off" | "mild" | "medium" | "explicit" | "max" {
  switch (v) {
    case "low": return "mild";
    case "high": return "explicit";
    case "off": case "mild": case "medium": case "explicit": case "max": return v;
    default: return "medium";
  }
}

// ── checkDialConflicts: run the same dial-conflict rules the Configure page
// shows (lib/dial-conflicts.ts) against one clone's live saved config ────────
// Read-only: selects the allowlisted columns those rules need, maps them into
// the DialConflictCfg shape the same way useCloneConfig.ts's fromClone() maps
// a raw row for the client (same column names, same defaults), and reports
// back exactly which rules are currently true. Empty array = nothing
// conflicts right now, a valid and common answer, not an error.
async function execCheckDialConflicts(args: Record<string, unknown>): Promise<unknown> {
  const idOrSlug = String(args.cloneIdOrSlug ?? "");
  if (!idOrSlug) return { error: "cloneIdOrSlug is required" };
  const cloneId = await resolveCloneIdLoose(idOrSlug);
  if (!cloneId) return { error: `no clone found matching "${idOrSlug}"` };

  const { data, error } = await supabaseAdmin
    .from("clones")
    .select(
      "id,name,slug,silence_fallback_mode,nsfw_level,sexual_level,discounts_enabled," +
        "discount_max_photo,discount_max_video,discount_max_bundle,discount_max_credits," +
        "bubble_delay_min_ms,bubble_delay_max_ms,discount_absolute_max_pct," +
        "spend_tier_whale_stars,spend_tier_high_stars,spend_tier_mid_stars",
    )
    .eq("id", cloneId)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: `no clone found matching "${idOrSlug}"` };

  // Same defaults fromClone() uses in components/clone/useCloneConfig.ts, so
  // this never reports a conflict off a value the dashboard itself wouldn't show.
  const cfg: DialConflictCfg = {
    silenceFallbackMode: (data as any).silence_fallback_mode ?? "on",
    nsfwLevel: heatLevelServer((data as any).nsfw_level),
    sexualLevel: heatLevelServer((data as any).sexual_level),
    discountsEnabled: (data as any).discounts_enabled ?? false,
    discMaxPhoto: (data as any).discount_max_photo ?? 0,
    discMaxVideo: (data as any).discount_max_video ?? 0,
    discMaxBundle: (data as any).discount_max_bundle ?? 0,
    discMaxCredits: (data as any).discount_max_credits ?? 0,
    bubbleDelayMinMs: (data as any).bubble_delay_min_ms ?? 600,
    bubbleDelayMaxMs: (data as any).bubble_delay_max_ms ?? 1400,
    discountAbsoluteMaxPct: (data as any).discount_absolute_max_pct ?? 90,
    spendTierWhaleStars: (data as any).spend_tier_whale_stars ?? 1000,
    spendTierHighStars: (data as any).spend_tier_high_stars ?? 300,
    spendTierMidStars: (data as any).spend_tier_mid_stars ?? 50,
  };

  const conflicts = activeDialConflicts(cfg).map((r) => ({ id: r.id, text: r.text, detail: r.detail }));
  return { cloneId: (data as any).id, cloneName: (data as any).name, conflicts };
}

// NOTE: listTestRuns / getTestRun used to live here, wrapping lib/test-runs.ts.
// The Test console was removed on 2026-07-28 and that module went with it, so
// those two tools are gone. Nothing else referenced them.

export async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "queryTable":
      return execQueryTable(args);
    case "getTopSpenders":
      return execGetTopSpenders(args);
    case "getRecentErrors":
      return execGetRecentErrors(args);
    case "checkDialConflicts":
      return execCheckDialConflicts(args);
    default:
      return { error: `unknown tool: ${name}` };
  }
}

export const TOOL_DEFS: OrToolDef[] = [
  {
    type: "function",
    function: {
      name: "queryTable",
      description:
        `Read rows from one allowlisted table via the Supabase query builder (no raw SQL, read-only). ` +
        `Returns at most ${MAX_LIMIT} rows regardless of the requested limit. ` +
        `Allowed tables: ${TABLES.join(", ")}. Use this for anything not covered by the specialized tools ` +
        `(e.g. recent conversations from chat_history, a clone's config from clones, a fan's row from users, ` +
        `feedback_items, prompt_templates, usage_events, etc).`,
      parameters: {
        type: "object",
        properties: {
          table: { type: "string", enum: TABLES, description: "Table to read from." },
          select: {
            type: "array",
            items: { type: "string" },
            description: "Column names to return. Omit or leave empty for all allowed columns of this table.",
          },
          filters: {
            type: "array",
            description: "Simple equality/range filters, ANDed together.",
            items: {
              type: "object",
              properties: {
                column: { type: "string", description: "Must be one of this table's allowed columns." },
                op: { type: "string", enum: FILTER_OPS as unknown as string[] },
                value: { description: "Value to compare against." },
              },
              required: ["column", "op", "value"],
            },
          },
          orderBy: { type: "string", description: "Column to sort by (must be an allowed column)." },
          ascending: { type: "boolean", description: "Sort ascending. Default false (newest/highest first)." },
          limit: { type: "integer", description: `Max rows to return, capped at ${MAX_LIMIT} server-side.` },
        },
        required: ["table"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getTopSpenders",
      description: "Top fans by lifetime Star spend (users.total_spent_stars), across all clones or one clone.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "integer", description: `How many to return, capped at ${MAX_LIMIT}. Default 10.` },
          cloneId: { type: "string", description: "Optional clone UUID to restrict to one bot." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getRecentErrors",
      description: "Most recent error-level entries from system_logs (level = 'error'), newest first.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "integer", description: `How many to return, capped at ${MAX_LIMIT}. Default 20.` },
          cloneId: { type: "string", description: "Optional clone UUID to restrict to one bot." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "checkDialConflicts",
      description:
        "Check one clone's live saved config for known dial-conflict rules, the same warnings the " +
        "Configure page's own cards show (e.g. discounts enabled with every cap at 0%, bubble delay max " +
        "below min, spend-tier thresholds out of order). Returns the array of currently-triggered rules " +
        "({id, text, detail}); an empty array means nothing conflicts right now, which is a valid, common " +
        "answer, not an error. Use this instead of guessing at contradictions when asked to review, audit, " +
        "or check a clone's settings for conflicts.",
      parameters: {
        type: "object",
        properties: {
          cloneIdOrSlug: { type: "string", description: "Clone UUID, slug, or name to check." },
        },
        required: ["cloneIdOrSlug"],
      },
    },
  },
];
