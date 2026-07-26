import { supabaseAdmin } from "@/lib/supabase";
import type { OrToolDef } from "@/lib/openrouter";

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
    "message_effects_enabled", "ai_disclosure", "emojis_enabled", "emoji_amount",
    "sexual_level", "nsfw_level", "push_level",
    "text_model", "voice_model", "media_model", "routing_model",
    "voice_enhance_model", "photo_reply_model", "vision_model",
    "starting_credits", "credit_pack_size", "credit_pack_price_stars",
    "discounts_enabled", "discount_max_photo", "discount_max_video",
    "discount_max_bundle", "discount_max_credits",
    "subscriptions_enabled", "welcome_instruction", "welcome_bundle_after",
    "onboarding_voice_after", "smart_paywall_enabled", "paywall_instruction",
    "paywall_default_message", "drip_enabled", "drip_per_day",
    "drip_active_window_minutes", "winback_lapse_days", "followup_after_minutes",
    "timezone", "gender", "hometown", "current_city", "occupation", "vibe_preset",
    "deployed_at", "created_at", "updated_at",
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

export async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "queryTable":
      return execQueryTable(args);
    case "getTopSpenders":
      return execGetTopSpenders(args);
    case "getRecentErrors":
      return execGetRecentErrors(args);
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
];
