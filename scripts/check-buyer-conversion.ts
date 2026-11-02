// Proves the Revenue page's buyer-conversion panel against the raw tables.
//
// WHY THIS EXISTS. The three visible conversion measures deliberately answer
// three different questions and use two different identity grains:
//
//   1. Lifetime buyer conversion: buyer `users` profiles / all `users` profiles.
//      A profile is one creator–fan relationship, so one Telegram account may
//      appear once per creator in All creators.
//   2. Active-chat buyer conversion: distinct Telegram accounts that both sent
//      a human message and made a positive, non-refund payment in the selected
//      window. In All creators this is one person across the fleet.
//   3. Buyers still chatting (7d): lifetime buyer profiles whose most recent
//      inbound message was in the seven days before the report's fixed as-of
//      instant, divided by all lifetime buyer profiles.
//
// Those are easy to accidentally make internally consistent but wrong: for
// example, using profile rows for one side of #2, a lifetime payment for its
// numerator, or treating imported timestamps as real conversations. This check
// recomputes all three from raw, paged PostgREST reads rather than the page's
// RPCs/helpers, then compares both fleet and one selected creator.
//
// The window and the "now" clock are historical constants on purpose. A named
// period recalculates its end while the test runs; then a small tolerance can
// hide a real wrong-window defect. 2026-08-13 is also inside the import-cutover
// period, so its preceding seven days contain migration 124's forged imported
// `last_message_received < first_seen_at` timestamps. The explicit tripwire
// below makes dropping that guard fail loudly.
//
// Reads the LIVE database. Run: npm run test:buyer-conversion
import "dotenv/config";
import { getAnalytics } from "../lib/analytics-data";
import type { DateRange } from "../lib/dashboard-data";
import { classifyRevenueLedgerRow } from "../lib/revenue-ledger";
import { selectAllRows } from "../lib/select-all";
import { supabaseAdmin } from "../lib/supabase";

const MS_DAY = 86_400_000;
const FIXED_NOW_MS = Date.parse("2026-08-13T00:00:00.000Z");
const RANGE: DateRange = {
  startMs: Date.parse("2026-08-07T00:00:00.000Z"),
  endMs: FIXED_NOW_MS,
};
const iso = (ms: number) => new Date(ms).toISOString();

let failures = 0;
function assert(label: string, condition: boolean, detail = "") {
  console.log(`  ${condition ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures += 1;
}
function eq(label: string, got: number, want: number) {
  const ok = got === want;
  assert(label, ok, ok ? String(got) : `page ${got} vs raw ${want}`);
}
function eqRate(label: string, got: number | null, want: number | null) {
  const ok = got === want;
  assert(label, ok, ok ? String(got ?? "n/a") : `page ${got ?? "n/a"} vs raw ${want ?? "n/a"}`);
}
function le(label: string, numerator: number, denominator: number) {
  assert(label, numerator <= denominator, `${numerator} <= ${denominator}`);
}

/** A truncated raw reference is a lower bound, never a verification source. */
function completeRows<T>(label: string, result: { rows: T[]; truncated: boolean }): T[] {
  if (result.truncated) {
    throw new Error(`${label} was truncated or failed part-way through; refusing to compare a lower bound to the dashboard.`);
  }
  return result.rows;
}

type UserRow = {
  id: string;
  clone_id: string | null;
  purchase_count: number | string | null;
  total_spent_stars: number | string | null;
  legacy_id: string | number | null;
  first_seen_at: string | null;
  last_message_received: string | null;
};
type ChatRow = { id: number | string; telegram_id: number | string | null };
type TransactionRow = {
  id: string;
  telegram_id: number | string | null;
  amount_stars: number | string | null;
  invoice_payload: string | null;
};

type RawBuyerConversion = {
  lifetimeFanProfiles: number;
  lifetimeBuyerProfiles: number;
  lifetimeBuyerRate: number | null;
  activeChatters: number;
  activeChatBuyers: number;
  activeChatBuyerRate: number | null;
  activeBuyerProfiles7d: number;
  activeBuyerEngagement7d: number | null;
  // Test-only evidence that the migration-124 guard is actually exercised by
  // this fixed as-of date, rather than merely existing in a comment.
  forgedImportedBuyerProfiles7d: number;
  unguardedActiveBuyerProfiles7d: number;
};

const buyerProfile = (user: UserRow) =>
  (Number(user.purchase_count) || 0) > 0 || (Number(user.total_spent_stars) || 0) > 0;

const timestamp = (value: string | null): number | null => {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

/** The exact exclusion migration 124 applies to imported user profile rows. */
const forgedImportedTimestamp = (user: UserRow) => {
  const firstSeen = timestamp(user.first_seen_at);
  const lastInbound = timestamp(user.last_message_received);
  return user.legacy_id !== null && firstSeen !== null && lastInbound !== null && lastInbound < firstSeen;
};

const telegramId = (value: number | string | null): number | null => {
  if (value === null) return null;
  const id = Number(value);
  return Number.isFinite(id) ? id : null;
};

function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

/**
 * Direct raw recompute. This deliberately does not call revenue_fan_spend_stats
 * or revenue_messaged_fans: both are part of the dashboard's implementation
 * path, whereas a regression checker needs a separately inspectable reference.
 */
async function rawBuyerConversion(cloneId: string | null): Promise<RawBuyerConversion> {
  let usersQuery = supabaseAdmin
    .from("users")
    .select("id,clone_id,purchase_count,total_spent_stars,legacy_id,first_seen_at,last_message_received")
    .order("id", { ascending: true });
  if (cloneId) usersQuery = usersQuery.eq("clone_id", cloneId);
  const users = completeRows(
    "buyer-conversion users",
    await selectAllRows<UserRow>(usersQuery, { label: "buyer-conversion users" }),
  );

  let chatsQuery = supabaseAdmin
    .from("chat_history")
    .select("id,telegram_id")
    .eq("role", "human")
    .gte("created_at", iso(RANGE.startMs))
    .lte("created_at", iso(RANGE.endMs))
    .order("id", { ascending: true });
  if (cloneId) chatsQuery = chatsQuery.eq("clone_id", cloneId);
  const chats = completeRows(
    "buyer-conversion human chats",
    await selectAllRows<ChatRow>(chatsQuery, { label: "buyer-conversion human chats" }),
  );

  let transactionsQuery = supabaseAdmin
    .from("star_transactions")
    .select("id,telegram_id,amount_stars,invoice_payload")
    .gte("paid_at", iso(RANGE.startMs))
    .lte("paid_at", iso(RANGE.endMs))
    .order("id", { ascending: true });
  if (cloneId) transactionsQuery = transactionsQuery.eq("clone_id", cloneId);
  const transactions = completeRows(
    "buyer-conversion payments",
    await selectAllRows<TransactionRow>(transactionsQuery, { label: "buyer-conversion payments" }),
  );

  const chatters = new Set<number>();
  for (const chat of chats) {
    const id = telegramId(chat.telegram_id);
    if (id !== null) chatters.add(id);
  }

  const paidBuyers = new Set<number>();
  for (const transaction of transactions) {
    // Keep the production definition of a positive, non-adjustment paid order
    // in one place. The raw independence here is the source reads and identity
    // joins, while the classifier itself has dedicated ledger tests.
    if (!classifyRevenueLedgerRow(transaction).paidOrder) continue;
    const id = telegramId(transaction.telegram_id);
    if (id !== null) paidBuyers.add(id);
  }

  let activeChatBuyers = 0;
  for (const id of chatters) if (paidBuyers.has(id)) activeChatBuyers += 1;

  const buyerProfiles = users.filter(buyerProfile);
  const activeSince = FIXED_NOW_MS - 7 * MS_DAY;
  const activeBuyerProfiles = buyerProfiles.filter((user) => {
    const lastInbound = timestamp(user.last_message_received);
    return lastInbound !== null && lastInbound >= activeSince && lastInbound <= FIXED_NOW_MS;
  });
  const forgedImportedBuyerProfiles7d = activeBuyerProfiles.filter(forgedImportedTimestamp).length;
  const activeBuyerProfiles7d = activeBuyerProfiles.filter((user) => !forgedImportedTimestamp(user)).length;

  return {
    lifetimeFanProfiles: users.length,
    lifetimeBuyerProfiles: buyerProfiles.length,
    lifetimeBuyerRate: rate(buyerProfiles.length, users.length),
    activeChatters: chatters.size,
    activeChatBuyers,
    activeChatBuyerRate: rate(activeChatBuyers, chatters.size),
    activeBuyerProfiles7d,
    activeBuyerEngagement7d: rate(activeBuyerProfiles7d, buyerProfiles.length),
    forgedImportedBuyerProfiles7d,
    unguardedActiveBuyerProfiles7d: activeBuyerProfiles.length,
  };
}

type PageBuyerConversion = Awaited<ReturnType<typeof getAnalytics>>["buyerConversion"];

function sameBuyerConversion(label: string, page: PageBuyerConversion, raw: RawBuyerConversion) {
  eq(`${label}: lifetime fan profiles`, page.lifetimeFanProfiles, raw.lifetimeFanProfiles);
  eq(`${label}: lifetime buyer profiles`, page.lifetimeBuyerProfiles, raw.lifetimeBuyerProfiles);
  eqRate(`${label}: lifetime buyer conversion`, page.lifetimeBuyerRate, raw.lifetimeBuyerRate);

  eq(`${label}: active chatters in selected window`, page.activeChatters, raw.activeChatters);
  eq(`${label}: active chatters who paid in selected window`, page.activeChatBuyers, raw.activeChatBuyers);
  eqRate(`${label}: active-chat buyer conversion`, page.activeChatBuyerRate, raw.activeChatBuyerRate);

  eq(`${label}: buyer profiles still chatting in 7 days`, page.activeBuyerProfiles7d, raw.activeBuyerProfiles7d);
  eqRate(`${label}: 7-day buyer engagement`, page.activeBuyerEngagement7d, raw.activeBuyerEngagement7d);

  // These are deliberately re-derived from the page's counts too. If an edit
  // keeps the raw counts but leaves a stale percentage expression, the raw
  // comparisons above might not say which displayed field drifted.
  eqRate(
    `${label}: lifetime rate uses its displayed counts`,
    page.lifetimeBuyerRate,
    rate(page.lifetimeBuyerProfiles, page.lifetimeFanProfiles),
  );
  eqRate(
    `${label}: active-chat rate uses its displayed counts`,
    page.activeChatBuyerRate,
    rate(page.activeChatBuyers, page.activeChatters),
  );
  eqRate(
    `${label}: 7-day engagement uses its displayed counts`,
    page.activeBuyerEngagement7d,
    rate(page.activeBuyerProfiles7d, page.lifetimeBuyerProfiles),
  );
  le(`${label}: lifetime buyers are profiles in the fan denominator`, page.lifetimeBuyerProfiles, page.lifetimeFanProfiles);
  le(`${label}: active-chat buyers are inside the chatter denominator`, page.activeChatBuyers, page.activeChatters);
  le(`${label}: 7-day active buyers are inside lifetime buyer profiles`, page.activeBuyerProfiles7d, page.lifetimeBuyerProfiles);
}

/** Pick a real dashboard-selectable creator with data in the fixed window. */
async function discoverCreatorScope(): Promise<{ cloneId: string; source: string } | null> {
  const { data: cloneRows, error: cloneError } = await supabaseAdmin
    .from("clones")
    .select("id")
    .order("created_at", { ascending: true });
  if (cloneError) throw new Error(`could not read the creator roster: ${cloneError.message}`);
  const cloneIds = (cloneRows ?? [])
    .map((row) => row.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  if (cloneIds.length === 0) return null;

  const { data: activeRows, error: activeError } = await supabaseAdmin
    .from("chat_history")
    .select("clone_id")
    .eq("role", "human")
    .in("clone_id", cloneIds)
    .gte("created_at", iso(RANGE.startMs))
    .lte("created_at", iso(RANGE.endMs))
    .order("created_at", { ascending: false })
    .limit(1);
  if (activeError) throw new Error(`could not find an active creator in the fixed window: ${activeError.message}`);
  const activeCloneId = activeRows?.[0]?.clone_id;
  if (typeof activeCloneId === "string" && activeCloneId.length > 0) {
    return { cloneId: activeCloneId, source: "human chat in the fixed window" };
  }

  return { cloneId: cloneIds[0], source: "creator roster fallback" };
}

async function checkScope(label: string, cloneId: string | null): Promise<RawBuyerConversion> {
  // `includeCost: false` is deliberate: cost is unrelated to this checker and
  // can force an expensive usage_events rollup that makes a conversion failure
  // look like a database timeout.
  const page = (
    await getAnalytics("CUSTOM", cloneId, RANGE, { includeCost: false }, FIXED_NOW_MS)
  ).buyerConversion;
  const raw = await rawBuyerConversion(cloneId);
  sameBuyerConversion(label, page, raw);
  return raw;
}

async function main(): Promise<void> {
  console.log(`buyer conversion, fixed ${iso(RANGE.startMs)} → ${iso(RANGE.endMs)}, as of ${iso(FIXED_NOW_MS)}\n`);

  console.log("1. fleet metrics match raw rows");
  const fleet = await checkScope("fleet", null);

  console.log("\n2. selected creator metrics remain creator-scoped");
  const scope = await discoverCreatorScope();
  if (!scope) {
    assert("a dashboard-selectable creator exists", false);
  } else {
    await checkScope(`creator (${scope.source})`, scope.cloneId);
  }

  console.log("\n3. migration 124 excludes forged imported activity timestamps");
  assert(
    "the fixed as-of date contains forged imported buyer timestamps",
    fleet.forgedImportedBuyerProfiles7d > 0,
    `${fleet.forgedImportedBuyerProfiles7d} forged buyer profiles; ${fleet.unguardedActiveBuyerProfiles7d} before guard, ${fleet.activeBuyerProfiles7d} after`,
  );
  eq(
    "the raw migration-124 guard subtracts every forged buyer timestamp",
    fleet.activeBuyerProfiles7d,
    fleet.unguardedActiveBuyerProfiles7d - fleet.forgedImportedBuyerProfiles7d,
  );

  console.log(`\n${failures === 0 ? "PASS" : `FAIL (${failures})`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
