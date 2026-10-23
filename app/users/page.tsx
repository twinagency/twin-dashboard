import MessagesWorkspace from "@/components/users/TelegramLiveWorkspace";
import TelegramSpendSummary from "@/components/users/TelegramSpendSummary";
import { Sparkles, FileText, ShoppingCart, UserRound, MapPin, Clock3, SlidersHorizontal, MessageCircle } from "lucide-react";
import { MutationForm } from "@/components/DashboardAccessProvider";
import Link from "@/components/NavigationLink";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { fmtNum } from "@/lib/money";
import { getCloneScope } from "@/lib/clone-scope";
import { selectAllRows } from "@/lib/select-all";
import StarAmount from "@/components/StarAmount";
import { SpendTierChip } from "@/components/SpendTierBadge";
import { Card } from "@/components/ui/card";
import FanAvatar from "@/components/FanAvatar";
import { Input } from "@/components/ui/input";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { Info } from "@/components/clone/fields";
import { setCredits, resetCounters, setTestTraffic, toggleActive, setBlocked, setPaused, deleteUser, clearMinorFlag } from "./actions";
import ManualTakeover from "@/components/ManualTakeover";
import { campaignStepsOf, nextDripDueAt } from "@/lib/drip";
import LiveFeed from "@/components/users/LiveFeed";
import PurchaseToasts from "@/components/users/PurchaseToasts";
import FanLive from "@/components/users/FanLive";
import DripStrip from "@/components/users/DripStrip";
import { dedupeStarRows } from "@/lib/star-dedupe";
import FanDossier from "@/components/users/FanDossier";
import { toRows, parseEvents, sentenceCase } from "@/lib/fan-dossier";
import ChatThread, { type ThreadMessage } from "@/components/users/ChatThread";
import { flowLabelOf } from "@/lib/flow-labels";
import { historyCursor, parseHistoryCursor } from "@/lib/chat-history-window";
import { loadV2Fans, loadTelegramHistory } from "@/lib/live-telegram";
import { fanKey, fanMatches, sortFans, inboxCursor, parseInboxCursor, isStoredFan, virtualFanId } from "@/lib/live-telegram-model";

export const dynamic = "force-dynamic";

// Fans + Messages merged into one screen (Telegram-style): fan list (left,
// photo/name/username) → real chat_history thread (middle) → complete fan
// data + knowledge dossier (right). Used to be two separate pages/nav items —
// one inbox now, like real Telegram.

function ago(ts: string | null): string {
  if (!ts) return "-";
  const secs = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  if (secs < 86400 * 30) return `${Math.floor(secs / 86400)}d`;
  return new Date(ts).toLocaleDateString();
}

function dateTime(ts: string | null): string {
  if (!ts) return "-";
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const prettyKey = (k: string) => k.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

// ── Per-fan stage ───────────────────────────────────────────────────────────
// Where a fan actually IS: his onboarding position, how far the campaign has
// run at him this quiet episode, his paywall episode, and what the router last
// picked for him. Rendered twice, as chips on every row of the fan list and
// expanded in the Journey block on the right, but computed ONCE in journeyOf()
// below so the two can never disagree and the mirror of
// bot/src/onboarding-state.ts lives in a single place.
type OnboardingStepRow = {
  type: "text" | "voice" | "photo" | "video" | "bundle" | "collect" | "tease";
  after_messages?: number;
  media_id?: string | null;
  free?: boolean;
  collect_field?: string | null;
  instruction?: string | null;
  // Stable id (migration 087) — what onboarding_steps_done records.
  id?: string | null;
};
type CloneRow = {
  id: string;
  name: string;
  slug: string;
  engine?: string | null;
  onboarding_steps: OnboardingStepRow[] | null;
  onboarding_free_preview_enabled: boolean | null;
  photos_enabled: boolean | null;
  drip_steps: unknown[] | null;
  drip_enabled: boolean | null;
};

const ONBOARDING_STEP_LABEL: Record<string, { label: string; emoji: string }> = {
  text: { label: "text", emoji: "💬" },
  voice: { label: "voice", emoji: "🎙️" },
  photo: { label: "photo", emoji: "📷" },
  video: { label: "video", emoji: "🎥" },
  bundle: { label: "bundle", emoji: "🎁" },
  collect: { label: "collect", emoji: "❓" },
  tease: { label: "tease", emoji: "😏" },
};

// campaignStepsOf moved to lib/drip.ts when the live feed needed the same
// filter server side. Two copies of it would drift, and a drift means the
// dashboard shows a different step number than the bot will actually send.

// Delivery is tracked by STABLE STEP ID (migration 087), never by position:
// positions re-point at different steps the moment the list is edited, which
// desynced every live fan. Mirrors deliveredStepKeys()/stepKey() in
// bot/src/onboarding-state.ts, including the positional fallback for a row
// that only has pre-087 history.
const stepKeyOf = (s: OnboardingStepRow, i: number) => (s.id?.trim() ? s.id.trim() : `#${i}`);

function journeyOf(u: any, clone: CloneRow | undefined) {
  const onboardingSteps: OnboardingStepRow[] = clone?.onboarding_steps ?? [];
  const done: unknown[] = Array.isArray(u?.onboarding_steps_done) ? u.onboarding_steps_done : [];
  const sentIdx: number[] = Array.isArray(u?.onboarding_steps_sent) ? u.onboarding_steps_sent : [];
  const sentStepSet = new Set<string>(done.filter((k): k is string => typeof k === "string" && !!k.trim()));
  if (sentStepSet.size === 0) {
    for (const i of sentIdx) {
      const step = onboardingSteps[i];
      if (step) sentStepSet.add(stepKeyOf(step, i));
    }
  }
  // Sequential pointer, same as dueOnboardingStep(): first step not yet sent.
  const nextStepIndex = onboardingSteps.findIndex((s, i) => !sentStepSet.has(stepKeyOf(s, i)));
  const nextStep = nextStepIndex !== -1 ? onboardingSteps[nextStepIndex] : null;
  const firedSteps = onboardingSteps.filter((s, i) => sentStepSet.has(stepKeyOf(s, i)));
  // onboardingActive() in bot/src/onboarding-state.ts: frozen while onboarding
  // has something LEFT to do - an unsent step remains, or the free-preview
  // fallback is still armed - never a bare "!onboarding_complete" (that would
  // freeze forever on a clone with no onboarding configured at all).
  const freePreviewArmed =
    !!clone?.onboarding_free_preview_enabled && !!clone?.photos_enabled && !u?.onboarding_free_preview_sent;
  const creditsFrozen = !!u && !u.onboarding_complete && (nextStepIndex !== -1 || freePreviewArmed);
  // Campaign ("drip"): campaign_step is how many steps have fired in the fan's
  // CURRENT quiet episode. handler.ts resets it to 0 the moment he messages,
  // so a live fan reads 0 and that is correct, not missing data.
  const campaignSteps = campaignStepsOf(clone?.drip_steps);
  const campaignStep: number = u?.campaign_step ?? 0;
  return {
    onboardingSteps,
    nextStep,
    nextStepIndex,
    firedSteps,
    freePreviewArmed,
    creditsFrozen,
    campaignSteps,
    campaignStep,
    campaignEnabled: clone?.drip_enabled !== false,
  };
}

// paywall_hits_since_credits drives the "first hit only" quirk (src/handler.ts:
// paywallExhausted() + sendPaywall()): hit 1 gets the AI-composed personal line
// (only when smart_paywall_enabled), hit 2 gets the fixed static default
// message, and hit 3+ is silently ignored forever - his message is DELETED, no
// reply, nothing sent - until he tops up, which resets this back to 0.
function paywallStateOf(hits: number) {
  return hits <= 0
    ? { label: "Never hit", tone: "bg-muted/10 text-muted", loud: false }
    : hits === 1
      ? { label: "First hit used", tone: "bg-accent/15 text-accent", loud: false }
      : hits === 2
        ? { label: "Static hit used", tone: "bg-warn/15 text-warn", loud: true }
        : { label: "Exhausted, ignored", tone: "bg-crit/15 text-crit", loud: true };
}
const PAYWALL_HINT =
  "By design, not a bug: only his FIRST hit of an out-of-credits episode gets the personalized/smart line. " +
  "His 2nd hit gets the fixed static default message. Every hit after that (3rd+) is silently ignored entirely " +
  "- his message is deleted, no reply, nothing sent at all. Resets to 0 the moment he tops up.";

// What the router last picked for this fan. handler.ts writes one system_logs
// row per turn with source="routing". CLASSIC mode records detail.route (one of
// the Route union values below); SMART mode records no route at all, only
// detail.actions, so a smart clone renders its action list instead.
const ROUTE_CHIP: Record<string, { emoji: string; label: string; tone: string }> = {
  TEXT_FLOW: { emoji: "💬", label: "text", tone: "bg-muted/15 text-muted" },
  VOICE_FLOW: { emoji: "🎙", label: "voice", tone: "bg-accent/15 text-accent" },
  IMAGE_FLOW: { emoji: "📷", label: "photo", tone: "bg-purple-500/15 text-purple-400" },
  VIDEO_FLOW: { emoji: "🎥", label: "video", tone: "bg-purple-500/15 text-purple-400" },
  BUNDLE_FLOW: { emoji: "🎁", label: "bundle", tone: "bg-warn/15 text-warn" },
  SPOIL_FLOW: { emoji: "💸", label: "spoil", tone: "bg-good/15 text-good" },
  VISION_FLOW: { emoji: "👁", label: "vision", tone: "bg-accent/15 text-accent" },
};

const normalizeProfileKey = (key: string) =>
  key
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const profileValueText = (value: unknown): string => {
  const emptyValues = new Set(["not provided", "not known", "not stated", "unknown", "n/a", "na"]);
  const values = (Array.isArray(value) ? value : [value])
    .map((item) => String(item ?? "").trim())
    .filter((item) => item && !emptyValues.has(item.toLowerCase()));
  return values.join(", ");
};

// Visible quick filters. Additional status filters remain supported by the
// query logic, but stay out of the compact Fans toolbar.
const FILTERS = [
  { key: "all", label: "All", on: "border-line bg-muted/20 text-ink", off: "border-line text-ink/70" },
  { key: "active", label: "Active", on: "border-good/50 bg-good/15 text-good", off: "border-good/20 text-good/70" },
  { key: "paying", label: "Paid", on: "border-accent/50 bg-accent/15 text-accent", off: "border-line text-ink/70" },
  { key: "flagged", label: "Flagged", on: "border-crit/50 bg-crit/15 text-crit", off: "border-crit/20 text-crit/70" }, // = users.blocked
];

// Sort chips: click again to flip direction (default = descending, "live view").
const SORTS = [
  { key: "last_message_received", label: "Live" },
  { key: "total_spent_stars", label: "Spent" },
  { key: "total_messages_sent", label: "Messages" },
  { key: "first_seen_at", label: "Joined" },
];

// How many fans one screen of the list holds. The list is a scrolling column
// with a "Load more" at the bottom, not a numbered pager, so this is a chunk
// size rather than a page size.
const FAN_PAGE = 100;

// Rows-per-load ceiling. "Load more" raises the window rather than stepping it
// (the list is one scroll and losing your place is worse than a bigger read),
// so this is what stops that from walking back to the unbounded read this page
// used to do.
const FAN_MAX = 1000;

// The 24h Telegram messaging window, the only "active" that matters here.
const REACHABLE_MS = 24 * 3600 * 1000;

export default async function FansPage({
  searchParams,
}: {
  searchParams: Promise<{ fan?: string; q?: string; status?: string; sort?: string; dir?: string; show?: string; relationship?: string; creator?: string; platform?: string; source?: string; workspace?: string; before?: string; after?: string }>;
}) {
  const params = await searchParams;
  const awaitedWorkspace = params.workspace;
  // Old presentation links must never render invented conversations.
  if (params.relationship !== undefined) redirect("/users");
  const cloneId = await getCloneScope();
  const {
    fan: fanParam,
    q = "",
    status = "all",
    sort = "last_message_received",
    dir = "",
    show = "",
  } = params;
  const sortKey = SORTS.some((s) => s.key === sort) ? sort : "last_message_received";
  const asc = dir === "asc";
  const showCount = Math.min(Math.max(Number(show) || FAN_PAGE, FAN_PAGE), FAN_MAX);

  const qLower = q.trim().toLowerCase();
  const cutoffIso = new Date(Date.now() - REACHABLE_MS).toISOString();

  // WHY THIS IS A DATABASE FILTER AND NOT A .filter() ANYMORE: this page used to
  // read `users` with select("*") and no range at all, then count and search the
  // whole table in memory. That was written when the fleet was 39 fans. After
  // the 2026-08-09/10 cutover it is tens of thousands, and an unranged select
  // does not just get slow, it silently stops at PostgREST's 1000-row cap
  // (lib/select-all.ts explains that failure in full) so the counts above the
  // list were wrong and no fan past the first 1000 could be found at all.
  const scoped = <T extends { eq: (c: string, v: unknown) => T }>(query: T): T =>
    cloneId ? query.eq("clone_id", cloneId) : query;

  // Status + search, applied server side. Every branch here mirrors the
  // in-memory predicate it replaced.
  const applyFilters = (query: any) => {
    let out = scoped(query);
    if (status === "active") out = out.gte("last_message_received", cutoffIso);
    else if (status === "unreachable")
      out = out.or(`last_message_received.is.null,last_message_received.lt.${cutoffIso}`);
    else if (status === "paying") out = out.or("purchase_count.gt.0,total_spent_stars.gt.0");
    else if (status === "credits") out = out.gt("message_credits", 0);
    else if (status === "flagged") out = out.eq("blocked", true);
    else if (status === "new") out = out.gte("first_seen_at", cutoffIso);

    if (qLower) {
      // telegram_id is numeric, and PostgREST cannot cast a column mid-filter,
      // so an all-digits search matches the id EXACTLY here where the old
      // in-memory version matched a substring of it. Names still match on
      // substring, which is what the box is actually used for.
      const like = `*${qLower.replace(/[,()*]/g, "")}*`;
      // Every identifier the operator might have in front of him, not just the
      // two names: he is as likely to be pasting a telegram id or a business
      // connection id out of a log as typing a name.
      const clauses = [
        `name.ilike.${like}`,
        `stated_name.ilike.${like}`,
        `username.ilike.${like}`,
        `business_connection_id.ilike.${like}`,
      ];
      if (/^\d+$/.test(qLower)) clauses.push(`telegram_id.eq.${qLower}`);
      out = out.or(clauses.join(","));
    }
    return out;
  };

  // Counts come back as counts. Four head:true queries return no rows at all,
  // so these stay correct and cheap at any fleet size, which is exactly what
  // counting a truncated select() in memory could not do.
  const countOf = (build: (q: any) => any) =>
    build(scoped(supabaseAdmin.from("users").select("id", { count: "exact", head: true })));

  const clonesTask = Promise.resolve(
    supabaseAdmin
      .from("clones")
      .select("id,name,slug,engine,onboarding_steps,onboarding_free_preview_enabled,photos_enabled,drip_steps,drip_enabled")
  );
  const v2Task = clonesTask.then(result => {
    if (result.error) throw new Error("Could not load Telegram conversations. Please retry.");
    return loadV2Fans((result.data ?? []) as CloneRow[], cloneId);
  });

  const [clonesRes, usersRes, totalRes, activeRes, payingRes, flaggedRes, v2] = await Promise.all([
    // id/name for the fan-list "via X" line; the rest reconstructs every fan's
    // exact onboarding position, campaign position and credit-freeze state (see
    // onboardingActive() in bot/src/onboarding-state.ts and the step walk in
    // bot/src/campaign.ts, mirrored here the same way lib/persona-facts.ts
    // mirrors prompt.ts). Both step lists are per-CLONE, so they are fetched
    // once here and joined to each fan row, never queried per fan.
    clonesTask,
    // The visible slice, ordered and ranged in the database. `id` is the tie
    // breaker: paging an unstable order can show the same fan twice and skip
    // another, and every sort key here has ties (a whole clone can share a null
    // last_message_received).
    applyFilters(supabaseAdmin.from("users").select("*"))
      .order(sortKey, { ascending: asc, nullsFirst: asc })
      .order("id", { ascending: true })
      // One row past the slice, trimmed off below. That extra row is the only
      // honest answer to "is there more": a slice that comes back exactly full
      // could be the end of the set or the middle of it, and guessing shows a
      // "Load more" that loads nothing.
      .range(0, showCount),
    // Counts, unaffected by search/status so they always read as the true
    // totals for the current clone scope.
    countOf((q: any) => q),
    countOf((q: any) => q.gte("last_message_received", cutoffIso)),
    countOf((q: any) => q.or("purchase_count.gt.0,total_spent_stars.gt.0")),
    countOf((q: any) => q.eq("blocked", true)),
    v2Task,
  ]);

  if (clonesRes.error || usersRes.error) throw new Error("Could not load Telegram conversations. Please retry.");
  const clones = (clonesRes.data ?? []) as CloneRow[];
  const cloneById = new Map(clones.map((c) => [c.id, c]));
  const fetchedFans = (usersRes.data ?? []) as any[];
  const mergedFans = new Map(fetchedFans.map(fan => [fanKey(fan), fan]));
  for (const fan of v2.fans) mergedFans.set(fanKey(fan), fan);
  let matchingFans = sortFans([...mergedFans.values()].filter(fan => fanMatches(fan, status, q, cutoffIso)), sortKey, asc);
  // A now-active V2 fan can leave the legacy 'unreachable' result. Refill the
  // slice rather than hiding the remaining matching legacy conversations.
  let legacyHasMore = fetchedFans.length > showCount;
  let offset = fetchedFans.length;
  while (matchingFans.length <= showCount && legacyHasMore) {
    const next = await applyFilters(supabaseAdmin.from("users").select("*")).order(sortKey, { ascending: asc, nullsFirst: asc }).order("id", { ascending: true }).range(offset, offset + FAN_PAGE - 1);
    if (next.error) throw new Error("Could not load Telegram fans. Please retry.");
    const rows = next.data ?? [];
    offset += rows.length; legacyHasMore = rows.length === FAN_PAGE;
    for (const fan of rows) if (!mergedFans.has(fanKey(fan))) mergedFans.set(fanKey(fan), fan);
    matchingFans = sortFans([...mergedFans.values()].filter(fan => fanMatches(fan, status, q, cutoffIso)), sortKey, asc);
  }
  const filtered = matchingFans.slice(0, showCount);

  // Last route per fan, for the chips on each row. Scoped to the fans actually
  // on screen (`.in`) rather than "the last 1000 routing rows fleet-wide" as
  // before: that older window was ordered by time, so on a busy fleet the fans
  // in the list were frequently not in it and simply got no chip.
  const pageTelegramIds = Array.from(new Set(filtered.map((u) => u.telegram_id))).slice(0, 300);
  const routeLogsQuery = pageTelegramIds.length
    ? scoped(
        supabaseAdmin
          .from("system_logs")
          .select("clone_id,telegram_id,detail")
          .eq("source", "routing")
          .in("telegram_id", pageTelegramIds)
          .order("ts", { ascending: false })
          .limit(2000),
      )
    : { data: [] as any[] };

  // Paid media unlocks per fan, for the chip beside his name. Ronan, 2026-08-18:
  // "cant see what pics fans puchased in chat logs + next too name". This is the
  // "next to name" half and it needs no new column: a kind='media' row IS an
  // unlock. Which item it was needs migration 121 and is answered in the thread,
  // not here. Same `.in` scoping as the routing read above, one query for the
  // whole visible page rather than one per row.
  //
  // PAGED AND CHUNKED, not a plain select, and both halves matter.
  //
  // PAGED: an unpaged read stops at PostgREST's 1000-row cap without erroring,
  // so one whale on screen would silently truncate the set and every chip built
  // from it would be low. lib/select-all.ts exists for exactly that and its
  // header explains the failure in full. Ordered by id so paging cannot repeat
  // or skip a row.
  //
  // CHUNKED: "Load more" raises this list to FAN_MAX=1000 rows, and 1000 uuids
  // in one `.in(...)` is a ~37KB query string, past what a URL can carry. The
  // obvious fix, `.slice(0, 300)`, is the same silent undercount in a different
  // place: fan 301 would show no unlock chip and nothing would say why. So the
  // ids are chunked and every visible fan is covered.
  const ID_CHUNK = 150;
  const pageUserIds = filtered.map((u) => u.id).filter(isStoredFan);
  const idChunks: string[][] = [];
  for (let i = 0; i < pageUserIds.length; i += ID_CHUNK) idChunks.push(pageUserIds.slice(i, i + ID_CHUNK));
  // Conversation, routing chips and unlock chips have independent inputs.
  // Waiting together keeps all existing data while removing two serial waits.
  const [conversation, routeLogsRes, mediaPages] = await Promise.all([
    (async () => {
      // The fan in ?fan= is normally on the current slice. When he is not (a deep
      // link, or he sorted off the end of it) he is fetched on his own rather than
      // silently swapped for whoever is at the top, which is what falling back to
      // filtered[0] alone would do.
      let selected = (fanParam && [...mergedFans.values()].find((u) => u.id === fanParam || u._v2 && virtualFanId(u.clone_id, u.telegram_id) === fanParam)) || null;
      if (!selected && fanParam && isStoredFan(fanParam)) {
        const { data } = await supabaseAdmin.from("users").select("*").eq("id", fanParam).maybeSingle();
        selected = (data as any) ?? null;
      }
      if (!selected) selected = filtered[0] || null;

      let history: any[] = [];
      let historyHasMore = false;
      const historyBefore = parseInboxCursor(params.before);
      const historyAfter = historyBefore ? null : parseHistoryCursor(params.after);
      let combinedHistory = false;
      let historyUnavailable = false;
      const selectedV2 = !!selected && cloneById.get(selected.clone_id)?.engine === "v2";
      let purchases: any[] = [];
      let profile: any = null;
      // Manual takeover (migration 096) photo picker: restricted to this fan's
      // clone's FREE photos only — see manualSendPhoto in ./actions.ts for why
      // paid photos are never offered here. Only fetched when the panel can
      // actually render (fan already paused), to avoid an extra query otherwise.
      let freePhotos: { id: string; storage_path: string; caption: string | null; image_name: string | null }[] = [];
      if (selected) {
        const [historyRes, purchasesRes, profileRes, freePhotosRes] = await Promise.all([
          loadTelegramHistory(cloneById.get(selected.clone_id)!, selected.telegram_id, { before: params.before, after: params.after }),
          supabaseAdmin
            .from("star_transactions")
            // select * (not named columns) for the same reason chat_history does it
            // just above: `media_type`/`media_id` (migration 121, which media he
            // actually unlocked) come along the moment that migration is applied,
            // and nothing breaks in the window before it is.
            .select("*")
            .eq("clone_id", selected.clone_id)
            .or(isStoredFan(selected.id) ? `user_id.eq.${selected.id},telegram_id.eq.${selected.telegram_id}` : `telegram_id.eq.${selected.telegram_id}`)
            .order("paid_at", { ascending: false }),
          isStoredFan(selected.id) ? supabaseAdmin.from("fan_profiles").select("*").eq("user_id", selected.id).maybeSingle() : Promise.resolve({ data: null }),
          selected.paused && !selectedV2
            ? supabaseAdmin
                .from("photos")
                .select("id,storage_path,caption,image_name")
                .eq("clone_id", selected.clone_id)
                .eq("is_free", true)
                .order("created_at", { ascending: false })
            : Promise.resolve({ data: [] as any[] }),
        ]);
        historyHasMore = historyRes.hasMore;
        history = historyRes.rows;
        combinedHistory = historyRes.combined;
        historyUnavailable = historyRes.unavailable;
        // See lib/star-dedupe.ts: collapse double-recorded payments before showing this fan's total.
        purchases = dedupeStarRows((purchasesRes.data ?? []) as any[]);
        profile = (profileRes.data ?? null) as any;
        freePhotos = (freePhotosRes.data ?? []) as any[];
      }
      return { selected, history, purchases, profile, freePhotos, historyHasMore, historyBefore, historyAfter, combinedHistory, historyUnavailable, selectedV2 };
    })(),
    routeLogsQuery,
    Promise.all(
      idChunks.map((chunk) =>
        selectAllRows<{
          id: string;
          user_id: string;
          clone_id: string;
          telegram_id: number | null;
          kind: string | null;
          amount_stars: number | null;
          paid_at: string;
          invoice_payload: string | null;
        }>(
          supabaseAdmin
            .from("star_transactions")
            .select("id,user_id,clone_id,telegram_id,kind,amount_stars,paid_at,invoice_payload")
            .eq("kind", "media")
            .in("user_id", chunk)
            .order("id", { ascending: true }),
          { label: "users:media-unlocks" },
        ),
      ),
    ),
  ]);
  const { selected, history, purchases, profile, freePhotos, historyHasMore, historyBefore, historyAfter, combinedHistory, historyUnavailable, selectedV2 } = conversation;
  const mediaBuyRows = mediaPages.flatMap((r) => r.rows);
  // See lib/star-dedupe.ts: collapse double-recorded payments before counting unlocks.
  const mediaBuysByFan = new Map<string, { count: number; stars: number }>();
  for (const row of dedupeStarRows(mediaBuyRows)) {
    const prev = mediaBuysByFan.get(row.user_id) ?? { count: 0, stars: 0 };
    mediaBuysByFan.set(row.user_id, { count: prev.count + 1, stars: prev.stars + (row.amount_stars ?? 0) });
  }

  // Rows arrive newest-first, so the FIRST row seen for a fan is his last turn.
  // `seen` is tracked separately from the map: a row we cannot render a chip
  // for (an unknown route value) still closes that fan out, so an older turn
  // can never be shown as if it were the latest one.
  const lastRoute = new Map<string, { emoji: string; label: string; tone: string }>();
  const seenRouteKeys = new Set<string>();
  for (const row of (routeLogsRes.data ?? []) as any[]) {
    const key = `${row.clone_id}:${row.telegram_id}`;
    if (seenRouteKeys.has(key)) continue;
    seenRouteKeys.add(key);
    const detail = (row.detail ?? {}) as { route?: string; mode?: string; actions?: unknown; voice?: boolean };
    const chip = detail.route ? ROUTE_CHIP[detail.route] : null;
    if (chip) {
      lastRoute.set(key, chip);
      continue;
    }
    if (detail.mode === "smart") {
      const actions = (Array.isArray(detail.actions) ? detail.actions : []).map(String);
      lastRoute.set(key, {
        emoji: "🤖",
        label: actions.length ? actions.join("+") : detail.voice ? "voice" : "text",
        tone: "bg-accent/15 text-accent",
      });
    }
  }

  // "Active" = messaged in the last 24h (the Telegram messaging window), NOT the manual is_active flag.
  const totalFans = (totalRes.count ?? 0) + v2.fans.filter(fan => fan._virtual).length;
  const activeFans = (activeRes.count ?? 0) + v2.fans.reduce((delta, fan) => {
    const original = v2.originals.get(fanKey(fan));
    return delta + Number(fanMatches(fan, "active", "", cutoffIso)) - Number(!!original && fanMatches(original, "active", "", cutoffIso));
  }, 0);
  const payingFans = payingRes.count ?? 0;
  const flaggedFans = flaggedRes.count ?? 0;

  const hasMore = (matchingFans.length > showCount || legacyHasMore) && showCount < FAN_MAX;

  // ── Rich bubbles (chat_history.meta, migration 030) ───────────────────────
  // Rows written since the meta column landed carry {type, media_id, tg_file_id,
  // paid, stars, count}. Resolve the referenced media to a real thumb + name via
  // the same signed-URL approach the composer's picker uses. Old rows (meta null)
  // render as plain text exactly as before — never fake a player/thumb for them.
  type BubbleMeta = {
    type?: string;
    media_id?: string;
    tg_file_id?: string;
    paid?: boolean;
    stars?: number;
    count?: number;
    // ── THE AUTOMATED CAMPAIGN STAMP (bot/src/campaign.ts, 2026-08-17) ───────
    // Written by the campaign worker on every send it makes, so the operator can
    // see in the scroll where an automated re-engagement went out rather than
    // guessing which lines she never wrote in a live conversation. Key names are
    // the jsonb's own (snake_case); bot/src/dev/check-drip.ts asserts them.
    //
    // FORWARD ONLY. Nothing recorded which historic sends were drip, so every row
    // written before the bot shipped this has no stamp and never will. That is
    // why the marker's absence means "unknown", never "this was live".
    drip?: boolean;
    drip_step?: number;
    drip_kind?: "step" | "winback";
    // ── THE FLOW STAMP (bot/src/types.ts ChatMeta.flow, 2026-08-18) ──────────
    // Which code path produced this send: her live text reply, the router
    // picking a photo, the out-of-credits wall, an onboarding step, the
    // campaign. Same forward-only rule as the drip stamp above: a row without
    // it is UNKNOWN, and lib/flow-labels.ts refuses to invent a label for one.
    // The slug vocabulary is shared with the bot and asserted by
    // scripts/check-flow-labels.ts.
    flow?: string;
    /** onboarding sends only: which configured step fired */
    step_id?: string;
    step_index?: number;
    step_total?: number;
    /** the inline keyboard exactly as the fan saw it, rows preserved. Labels
        only, never the invoice URL, which is a live payment link. */
    buttons?: { text: string }[][];
  };
  const metaOf = (m: any): BubbleMeta | null =>
    m?.meta && typeof m.meta === "object" ? (m.meta as BubbleMeta) : null;
  const mediaInfo = new Map<string, { name: string; thumbUrl: string | null }>();
  if (history.some((m) => metaOf(m)?.media_id)) {
    const idsOf = (t: string) => [
      ...new Set(
        history
          .map(metaOf)
          .filter((x): x is BubbleMeta => !!x && x.type === t && !!x.media_id)
          .map((x) => x.media_id as string),
      ),
    ];
    const [photoIds, videoIds, bundleIds] = [idsOf("photo"), idsOf("video"), idsOf("bundle")];
    const none = Promise.resolve({ data: [] as any[] });
    const [photosRes, videosRes, bundlesRes] = await Promise.all([
      photoIds.length
        ? supabaseAdmin.from("photos").select("id,storage_path,image_name,caption").in("id", photoIds)
        : none,
      videoIds.length ? supabaseAdmin.from("videos").select("id,storage_path,caption").in("id", videoIds) : none,
      bundleIds.length
        ? supabaseAdmin.from("photo_bundles").select("id,name,photo_bundle_items(storage_path,sort_order)").in("id", bundleIds)
        : none,
    ]);
    const entries: { id: string; name: string; path: string | null }[] = [
      ...((photosRes.data ?? []) as any[]).map((p) => ({
        id: p.id,
        name: p.image_name || p.caption || "Photo",
        path: p.storage_path ?? null,
      })),
      ...((videosRes.data ?? []) as any[]).map((v) => ({ id: v.id, name: v.caption || "Video", path: v.storage_path ?? null })),
      ...((bundlesRes.data ?? []) as any[]).map((b) => {
        const first = (b.photo_bundle_items ?? [])
          .slice()
          .sort((a: any, z: any) => (a.sort_order ?? 0) - (z.sort_order ?? 0))[0];
        return { id: b.id, name: b.name || "Bundle", path: first?.storage_path ?? null };
      }),
    ];
    const paths = entries.map((e) => e.path).filter((p): p is string => !!p);
    const { data: signed } = paths.length
      ? await supabaseAdmin.storage.from("media").createSignedUrls(paths, 3600)
      : { data: [] as { signedUrl: string | null }[] };
    const urlByPath = new Map(paths.map((p, i) => [p, signed?.[i]?.signedUrl ?? null]));
    for (const e of entries) mediaInfo.set(e.id, { name: e.name, thumbUrl: e.path ? urlByPath.get(e.path) ?? null : null });
  }
  // Transcript from the memory line "[sent a voice note saying: "…"]".
  const voiceWords = (c: string) => c.match(/saying: "([\s\S]*)"\]$/)?.[1] ?? null;
  // Parse the runtime's media memory-line convention so OLD rows (no meta) and
  // unresolvable media still render a decent generic bubble: icon + price + caption.
  // Formats (src/flows/media.ts + bundle.ts):
  //   [sent a FREE (unlocked, no charge) photo · shows: X · caption: "Y"]
  //   [sent a locked paid video (not unlocked yet) · 25⭐ · shows: X · caption: "Y"]
  //   [sent a locked paid photo bundle "name" (8 pics, not unlocked yet) · 25⭐ · caption: "Y"]
  const mediaText = (c: string) => {
    const head = c.match(/^\[sent a (FREE \(unlocked, no charge\)|locked paid) (photo|video)( bundle "([^"]*)")?/);
    if (!head) return null;
    return {
      paid: head[1] === "locked paid",
      kind: head[3] ? "bundle" : head[2],
      bundleName: head[4] ?? null,
      stars: Number(c.match(/· (\d+)⭐/)?.[1] ?? 0),
      caption: c.match(/caption: "([^"]*)"/)?.[1] ?? c.match(/shows: ([^·\]]+)/)?.[1]?.trim() ?? null,
    };
  };

  const totalSpent = purchases.reduce((s, p) => s + (p.amount_stars ?? 0), 0);
  const isPaying = purchases.length > 0 || (selected?.total_messages_purchased ?? 0) > 0;

  // ── WHO THIS FAN IS, IN THE ORDER THE OPERATOR NEEDS IT ────────────────────
  // Ronan, 2026-08-18: the fan list led with `stated_name` — the name the fan
  // TYPED at her in chat. That is the one field here he does not control and
  // cannot verify: it is whatever he felt like calling himself, it is often a
  // joke, and two fans can trivially share one. Telegram's own name, his
  // @handle, his telegram id and the business connection he arrived on are the
  // identifiers that actually resolve to a person, so they lead now and the
  // stated name trails as a note.
  //
  // stated_name is still SOURCE OF TRUTH for what SHE calls him (see the users
  // table comment and bot/src/prompt.ts) — that has not changed, and this is
  // only about what the operator reads on a row.
  const displayName = (u: any) => u.name?.trim() || `Fan ${u.telegram_id}`;
  const statedAlias = (u: any) => {
    const stated = u.stated_name?.trim();
    if (!stated) return null;
    // Only worth a line when it actually differs from the Telegram name.
    return stated.toLowerCase() === (u.name?.trim() ?? "").toLowerCase() ? null : stated;
  };
  // "number" in the brief: Telegram never gives a bot the fan's phone number, so
  // the telegram id is the number that exists. Not relabelled as a phone.
  const identityBits = (u: any): string[] => {
    const bits: string[] = [];
    if (u.username) bits.push(`@${u.username}`);
    bits.push(`id ${u.telegram_id}`);
    if (u.business_connection_id) bits.push(`biz ${String(u.business_connection_id).slice(0, 10)}`);
    return bits;
  };

  // ── What he actually BOUGHT ────────────────────────────────────────────────
  // Two different questions, and the old panel answered neither. "Which media
  // did she OFFER him at a price" is meta.paid on the send. "Which of those did
  // he PAY for" is a star_transactions row of kind 'media', and until migration
  // 121 lands nothing on that row says which item it was.
  //
  // So: a purchase with a media_id resolves to that exact bubble. A purchase
  // without one (every row written before 121) counts toward the totals but is
  // NEVER attached to a guess of a bubble. Matching an unlabelled purchase to
  // the nearest locked send by timestamp would be right most of the time and
  // wrong silently, which on this project is the more expensive outcome.
  const mediaPurchases = purchases.filter((p) => p.kind === "media");
  const purchasedByMediaId = new Map<string, { stars: number; at: string }>();
  for (const p of mediaPurchases) {
    if (!p.media_id) continue;
    const prev = purchasedByMediaId.get(p.media_id);
    if (!prev || p.paid_at > prev.at) purchasedByMediaId.set(p.media_id, { stars: p.amount_stars ?? 0, at: p.paid_at });
  }
  const mediaPurchaseCount = mediaPurchases.length;
  const unlinkedMediaPurchases = mediaPurchases.filter((p) => !p.media_id).length;
  // WHEN "NOT BOUGHT" IS A FACT AND WHEN IT IS AN ASSUMPTION. Drawing a padlock
  // on a message says he did not pay for it. That is only safe when every media
  // purchase this fan has made names the item it bought. Two cases where one
  // does not, and the second never resolves with time:
  //   - anything charged before migration 121, which recorded no item at all
  //   - EVERY bundle, ever: a bundle's Star charge carries no uuid to record
  // With any such purchase on his record, an absent link means "not recorded",
  // not "not bought", and the bubble falls back to showing the price it was
  // offered at, which is exactly what this panel showed before.
  const lockStateKnown = unlinkedMediaPurchases === 0;

  // ── The thread, decided here and rendered by ChatThread ────────────────────
  // Every per-message question (what kind of bubble, which thumb, was it bought,
  // which flow produced it) is answered on the server so the client component
  // stays a pure renderer. See components/users/ChatThread.tsx for why that one
  // has to be a client component at all.
  // Telegram groups consecutive same-side messages sent close together into one
  // run: tight spacing, tail on the last one only. Computed here rather than in
  // the client component so no Date work happens after hydration (see the
  // hydration note in ChatThread.tsx).
  const RUN_GAP_MS = 5 * 60_000;
  const dayKeyOf = (iso: string) => new Date(iso).toDateString();
  const todayKey = new Date().toDateString();
  const yesterdayKey = new Date(Date.now() - 86_400_000).toDateString();
  const dayLabelOf = (iso: string) => {
    const key = dayKeyOf(iso);
    if (key === todayKey) return "Today";
    if (key === yesterdayKey) return "Yesterday";
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      day: "numeric",
      month: "long",
      ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }),
    });
  };
  // hour12 pinned rather than left to the locale: an undefined locale resolves
  // differently under Node and in a browser, which is exactly the mismatch that
  // broke the first build of this panel.
  const timeLabelOf = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });

  const threadMessages: ThreadMessage[] = history.map((m, i) => {
    const prevRow = i > 0 ? history[i - 1] : null;
    const nextRow = i < history.length - 1 ? history[i + 1] : null;
    const fanSide = m.role === "human";
    const newDay = !prevRow || dayKeyOf(prevRow.created_at) !== dayKeyOf(m.created_at);
    const startsRun =
      !prevRow ||
      (prevRow.role === "human") !== fanSide ||
      newDay ||
      new Date(m.created_at).getTime() - new Date(prevRow.created_at).getTime() > RUN_GAP_MS;
    const endsRun =
      !nextRow ||
      (nextRow.role === "human") !== fanSide ||
      dayKeyOf(nextRow.created_at) !== dayKeyOf(m.created_at) ||
      new Date(nextRow.created_at).getTime() - new Date(m.created_at).getTime() > RUN_GAP_MS;

    const meta = metaOf(m);
    const info = meta?.media_id ? mediaInfo.get(meta.media_id) : undefined;
    const transcript = voiceWords(m.content);
    const parsed = mediaText(m.content);
    const fan = m.role === "human";

    // Kind, preferring the recorded meta and falling back to what the memory
    // line says. A fan's own message is always text: she is the only side that
    // can send media here.
    const kind: ThreadMessage["kind"] = fan
      ? "text"
      : meta?.type === "voice" || (transcript != null && !meta?.type)
        ? "voice"
        : meta?.type === "photo" || meta?.type === "video" || meta?.type === "bundle"
          ? meta.type
          : parsed
            ? (parsed.kind as ThreadMessage["kind"])
            : "text";

    // ── INLINE DRIP MARKER (Jesse, 2026-08-17, preserved through the 08-18
    //    Telegram rebuild) ────────────────────────────────────────────────────
    // One marker per campaign step, not per row: a win-back fires a media send
    // and a text send under the SAME step number, so an unconditional marker
    // draws the same rule twice. Compared against the previous row rather than
    // tracked across the map, which a server component re-render would not
    // preserve anyway.
    const dripMeta = meta?.drip ? meta : null;
    const prevMeta = prevRow ? metaOf(prevRow) : null;
    const sameStepAsPrev =
      !!dripMeta &&
      !!prevMeta?.drip &&
      prevMeta.drip_step === dripMeta.drip_step &&
      prevMeta.drip_kind === dripMeta.drip_kind;
    const dripMarker =
      dripMeta && !sameStepAsPrev
        ? {
            label:
              (dripMeta.drip_kind === "winback" ? "Win-back" : "Automated drip") +
              (dripMeta.drip_step ? ` · step ${dripMeta.drip_step}` : ""),
            hint:
              dripMeta.drip_kind === "winback"
                ? "Sent automatically to pull a lapsed spender back, replacing this campaign step. Nobody typed it."
                : "Sent automatically by the campaign, not typed in a live conversation.",
          }
        : null;

    const bought = meta?.media_id ? purchasedByMediaId.get(meta.media_id) : undefined;
    const flow = flowLabelOf(meta?.flow);
    // Onboarding carries its step; the campaign carries its step number. Both
    // sharpen the same one-line label rather than adding a second chip.
    const stepSuffix =
      meta?.flow === "onboarding" && typeof meta.step_index === "number"
        ? ` · step ${meta.step_index + 1}${meta.step_total ? `/${meta.step_total}` : ""}`
        : (meta?.flow === "drip_step" || meta?.flow === "winback") && meta.drip_step
          ? ` · step ${meta.drip_step}`
          : "";

    return {
      id: `${m.source ?? "v1"}:${m.id ?? `${m.created_at}-${i}`}`,
      fan,
      content: m.content,
      deliveryUnverified: m.delivery === "unverified",
      timeLabel: timeLabelOf(m.created_at),
      dayLabel: newDay ? dayLabelOf(m.created_at) : null,
      startsRun,
      endsRun,
      kind,
      voiceUrl:
        meta?.type === "voice" && meta.tg_file_id && selected
          ? `/api/voice?clone=${selected.clone_id}&file=${encodeURIComponent(meta.tg_file_id)}`
          : null,
      transcript,
      mediaUrl: info?.thumbUrl ?? null,
      mediaName: info?.name ?? parsed?.bundleName ?? null,
      mediaCount: meta?.count ?? null,
      paid: meta?.paid ?? parsed?.paid ?? false,
      stars: meta?.stars ?? parsed?.stars ?? null,
      caption: parsed?.caption ?? null,
      purchased: !!bought,
      purchasedStars: bought?.stars ?? null,
      lockKnown: !!meta?.media_id && lockStateKnown,
      flowLabel: flow ? flow.label + stepSuffix : null,
      flowEmoji: flow?.emoji ?? null,
      flowHint: flow?.hint ?? null,
      buttons: Array.isArray(meta?.buttons) ? (meta.buttons as { text: string }[][]) : null,
      dripMarker,
    };
  });
  const baseQs = (extra: Record<string, string>) => {
    const params = new URLSearchParams();
    if (awaitedWorkspace === "telegram") params.set("workspace", "telegram");
    if (q) params.set("q", q);
    if (status !== "all") params.set("status", status);
    if (sortKey !== "last_message_received") params.set("sort", sortKey);
    if (asc) params.set("dir", "asc");
    // Kept across clicks so picking a fan (or re-sorting) does not collapse a
    // list you just expanded.
    if (showCount !== FAN_PAGE) params.set("show", String(showCount));
    Object.entries(extra).forEach(([k, v]) => (v ? params.set(k, v) : params.delete(k)));
    return `/users?${params.toString()}`;
  };
  const qs = (id: string) => baseQs({ fan: id });

  // ── Onboarding / paywall journey state (PART 3, 3a; T8 rebuild 2026-07-29) ──
  // Display only, no writes. Same journeyOf() the fan-list chips above run
  // through, so the list and this panel cannot disagree about where a fan is.
  const paywallHits: number = selected?.paywall_hits_since_credits ?? 0;
  const paywallState = paywallStateOf(paywallHits);
  const paywallHint = PAYWALL_HINT;

  const selectedJourney = selected ? journeyOf(selected, cloneById.get(selected.clone_id)) : null;
  const onboardingSteps = selectedJourney?.onboardingSteps ?? [];
  // First paint for the campaign strip. campaign.ts measures every step from
  // the fan's last inbound message at tick time, so this is derived the same
  // way the runtime derives it, never read from users.next_send_at (dead since
  // migration 032).
  const selectedDripDue = selectedJourney
    ? nextDripDueAt(selectedJourney.campaignSteps, selectedJourney.campaignStep, selected?.last_message_received ?? null)
    : null;
  const nextStep = selectedJourney?.nextStep ?? null;
  const firedSteps = selectedJourney?.firedSteps ?? [];
  const creditsFrozen = !!selectedJourney?.creditsFrozen;
  const creditsFrozenHint =
    "Operator decision D3: a fan in onboarding NEVER runs out of messages. His credits are frozen (not " +
    "decremented) and the paywall cannot fire for the whole of onboarding. Onboarding ends when he pays for " +
    "something, or he receives the free preview pic, whichever comes first.";

  const interests: string[] = Array.isArray(profile?.interests) ? profile.interests : [];
  const details: [string, any][] =
    profile?.details && typeof profile.details === "object"
      ? Object.entries(profile.details).filter(([, value]) => profileValueText(value) !== "")
      : [];
  const usedDetailKeys = new Set<string>();
  const takeProfileDetails = (aliases: string[]): string[] => {
    const normalizedAliases = aliases.map(normalizeProfileKey);
    return details.flatMap(([key, value]) => {
      const normalizedKey = normalizeProfileKey(key);
      const matches = normalizedAliases.some(
        (alias) => normalizedKey === alias || normalizedKey.startsWith(`${alias}_`),
      );
      if (!matches) return [];
      usedDetailKeys.add(key);
      const text = profileValueText(value);
      return text ? [text] : [];
    });
  };
  const uniqueProfileValues = (values: string[]): string => {
    const seen = new Set<string>();
    return values
      .flatMap((value) => value.split(/\s*[|;]\s*/))
      .map((value) => value.trim())
      .filter((value) => {
        const normalized = value.toLowerCase();
        if (!normalized || seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
      })
      .join(", ");
  };
  const profileCategory = (label: string, aliases: string[], extra: string[] = []) => ({
    label,
    value: uniqueProfileValues([...extra, ...takeProfileDetails(aliases)]),
  });

  // Canonical manager-facing dossier. The extractor stores flexible key/value
  // details, so aliases keep older profiles useful while future extractions use
  // the canonical keys listed in profile-extractor.ts.
  const personalProfileCategories = [
    // Hobbies and Interests are separate rows, and Hobbies no longer swallows
    // the whole `interests` array. That array was the bot's dumping ground —
    // ten entries of "valuing real identity over commercial personas" printed
    // into one cell (Jesse, 2026-08-17). The bot now writes one short line to
    // details.hobbies and leaves the array empty; `interests` stays in the
    // extra list only so legacy rows still render until they re-extract.
    profileCategory("Hobbies", ["hobbies", "hobby"], interests),
    profileCategory("Interests", ["interests", "interest"]),
    profileCategory("Siblings", ["siblings", "sibling", "brothers", "sisters"]),
    profileCategory("Location", ["location", "city", "country", "lives_in", "hometown"]),
    profileCategory("Timezone", ["timezone", "time_zone", "utc_offset"]),
    profileCategory("Ethnicity", ["ethnicity", "cultural_background", "heritage"]),
    profileCategory("Language", ["language", "languages", "preferred_language"]),
    profileCategory("Occupation", ["occupation", "job", "work", "career"]),
    profileCategory("Relationship", ["relationship_status", "relationship", "dating_status"]),
    profileCategory("Family / children", ["family_children", "family", "children", "kids", "parents"]),
    profileCategory("Education", ["education", "school", "university", "studies"]),
    profileCategory("Pets", ["pets", "pet"]),
    profileCategory("Birthday / age", ["birthday_age", "birthday", "date_of_birth", "age"]),
  ];
  const contextProfileCategories = [
    profileCategory("Upcoming events", ["upcoming_events", "upcoming_event", "upcoming_plans"]),
    profileCategory("Recent events", ["recent_events", "recent_event", "past_recent_events"]),
    profileCategory("Goals / plans", ["goals_plans", "goals", "ambitions", "plans"]),
    profileCategory("Routine / availability", ["routine_availability", "routine", "schedule", "availability"]),
    profileCategory("Likes / favourites", ["likes_favorites", "likes", "favorites", "favourites", "favorite", "favourite"]),
    profileCategory("Dislikes / boundaries", ["dislikes_boundaries", "dislikes", "boundaries", "dealbreakers"]),
    profileCategory("Communication style", ["communication_style", "chat_style"]),
    profileCategory("How they found us", ["how_found", "acquisition_source", "referral_source"]),
    {
      label: "Chat / content preferences",
      value: uniqueProfileValues([profile?.preferences?.trim() ?? "", ...takeProfileDetails(["content_preferences", "chat_preferences"])]),
    },
  ];
  const uncategorizedProfileDetails = details.filter(([key]) => !usedDetailKeys.has(key));

  // Dossier presentation. Split into rows, capitalised and (for the two event
  // categories) date sorted HERE rather than in FanDossier.tsx: that component
  // is a client component, and parsing "next week" on both sides of hydration
  // is a mismatch. See lib/fan-dossier.ts.
  const dossierNow = Date.now();
  const eventLabels = new Set(["Upcoming events", "Recent events"]);
  const valueOf = (label: string) =>
    contextProfileCategories.find((c) => c.label === label)?.value ?? "";
  const personalRows = toRows(personalProfileCategories);
  const contextRows = toRows(contextProfileCategories.filter((c) => !eventLabels.has(c.label)));
  const upcomingEvents = parseEvents(valueOf("Upcoming events"), dossierNow, "upcoming");
  const recentEvents = parseEvents(valueOf("Recent events"), dossierNow, "past");
  const otherRows = toRows(
    uncategorizedProfileDetails.map(([key, value]) => ({
      label: prettyKey(key),
      value: profileValueText(value),
    })),
  );

  // The shell owns the viewport; the heading and panels share its remaining height.
  // <main> in app/layout.tsx already accounts for the fixed shell and TopBar,
  // so h-full here fills the remaining space
  // exactly. Only applied at lg+ though: below that the 3 columns stack into one
  // scrolling page (see layout.tsx's overflow-y-auto lg:overflow-hidden) —
  // forcing h-full there too used to squash 3 fixed-height panes into one
  // viewport with no way to reach the bottom two.
  const colHeight = "lg:h-full";

  return (
    <div className="users-workspace telegram-live-page lg:h-full">
      <header className="telegram-live-heading">
        <div><h1>Live Telegram</h1><p>Your conversations, with context.</p></div>
        <div className="telegram-inbox-totals" aria-label="Telegram fan counts">
          <span><strong>{fmtNum(totalFans)}</strong> fans</span>
          <span><strong>{fmtNum(activeFans)}</strong> active</span>
          <span><strong>{fmtNum(payingFans)}</strong> paying</span>
        </div>
      </header>
      {/* The ONE live connection for this page, and the toast stack it feeds.
          Both mounted here rather than in the layout: they are the Fans
          inbox's, and a stream open on every page in the app would be a poll
          loop per tab for a screen nobody is looking at. */}
      <LiveFeed scopeKey={cloneId ?? "all"} />
      <PurchaseToasts />
      {/* Middle column capped narrow (~400px, iPhone-width) instead of 1fr - 
          reads like a phone thread, not a stretched-out desktop panel. Left
          gets the extra room for data/filters, right takes whatever's left. */}
      <MessagesWorkspace key={selected?.id ?? "none"} selected={!!selected}>
        {/* ── Left: fan list (data above, bigger search, filters) ───────── */}
        <Card size="sm" className={`users-panel users-panel-list flex h-[34rem] ${colHeight} flex-col overflow-hidden p-0`}>
          {v2.unavailable.length > 0 && <p role="status" className="border-b border-line px-3 py-2 text-xs text-warn">Could not refresh {v2.unavailable.join(", ")}. Retrying automatically.</p>}
          <div className="telegram-list-toolbar border-b border-line p-3">
            {/* Bigger search */}
            <form className="relative mb-2.5">
              <svg
                viewBox="0 0 24 24"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" strokeLinecap="round" />
              </svg>
              <input type="hidden" name="status" value={status !== "all" ? status : ""} />
              <input type="hidden" name="sort" value={sortKey !== "last_message_received" ? sortKey : ""} />
              <input type="hidden" name="dir" value={asc ? "asc" : ""} />
              <Input
                name="q"
                defaultValue={q}
                placeholder="Search conversations…"
                aria-label="Search conversations"
                className="h-11 pl-9 text-sm"
              />
            </form>

            {/* Quick filters. `min-h-9` on a phone and 7 from sm up (Jesse,
                2026-08-17): these chips and the sort row below were 26px tall,
                well under the 44px touch minimum, and stacked 4px apart, so on
                a phone they read as one grey band and mis-taps were routine.
                Desktop keeps the tight row - a mouse does not need the room. */}
            <div className="telegram-list-filters mb-2 flex flex-wrap gap-1.5 sm:gap-1">
              {FILTERS.map((s) => {
                // Flagged is the "needs attention" chip: always fully lit when any
                // exist, with a count badge, so it never fades into the row.
                const hot = s.key === "flagged" && flaggedFans > 0;
                return (
                  <Link
                    key={s.key}
                    aria-current={status === s.key ? "page" : undefined}
                    href={baseQs({ status: s.key === "all" ? "" : s.key })}
                    className={
                      "flex min-h-9 items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition hover:brightness-125 sm:min-h-7 sm:px-2.5 " +
                      (status === s.key || hot ? s.on : s.off) +
                      (hot ? " font-semibold" : "")
                    }
                  >
                    {s.label}
                    {s.key === "flagged" && flaggedFans > 0 && (
                      <span className="rounded-full bg-crit px-1.5 text-[10px] font-bold tabular-nums text-white">
                        {flaggedFans}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>

            <details className="telegram-sort">
              <summary><SlidersHorizontal size={14} aria-hidden="true" /> Sort: {SORTS.find(item => item.key === sortKey)?.label} {asc ? "↑" : "↓"}</summary>
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-1">
              <span className="text-[10px] text-muted">Sort:</span>
              {SORTS.map((s) => {
                const on = sortKey === s.key;
                // Second click on the active sort flips direction.
                const nextDir = on && !asc ? "asc" : "";
                return (
                  <Link
                    key={s.key}
                    href={baseQs({ sort: s.key === "last_message_received" ? "" : s.key, dir: nextDir })}
                    className={
                      "inline-flex min-h-9 items-center rounded-full border px-3 py-1 text-xs font-medium transition sm:min-h-7 sm:px-2.5 " +
                      (on ? "border-line bg-muted/20 text-ink" : "border-line text-muted hover:text-ink")
                    }
                  >
                    {s.label}
                    {on ? (asc ? " ↑" : " ↓") : ""}
                  </Link>
                );
              })}
            </div>
            </details>
          </div>
          <div className="telegram-conversation-list flex-1 divide-y divide-line overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-muted">
                {q ? `No fans match "${q}".` : "No fans yet."}
              </div>
            ) : (
              filtered.map((u) => {
                // Stage line. Everything here was already in this page's data
                // (or one extra indexed log read) but was only ever visible
                // AFTER clicking a fan, one at a time - so "who is stuck where"
                // was unanswerable by looking at the list.
                const j = journeyOf(u, cloneById.get(u.clone_id));
                const route = lastRoute.get(`${u.clone_id}:${u.telegram_id}`);
                const paywall = paywallStateOf(u.paywall_hits_since_credits ?? 0);
                const nextLabel = j.nextStep ? ONBOARDING_STEP_LABEL[j.nextStep.type] : null;
                // One stage per fan, most-blocking first: a hard gate outranks
                // his onboarding position, which outranks "done". `stripe` is
                // the row's left edge, so the whole list is scannable by colour
                // without reading a single chip.
                const stage =
                  !!u.minor_flagged_at || u.blocked_reason === "minor"
                    ? { emoji: "🚫", label: "minor gate", tone: "bg-crit/15 text-crit", stripe: "border-crit" }
                    : u.blocked_reason === "us_location"
                      ? { emoji: "🌍", label: "US fan blocked", tone: "bg-crit/15 text-crit", stripe: "border-crit" }
                      : u.blocked
                      ? { emoji: "🚫", label: "blocked", tone: "bg-crit/15 text-crit", stripe: "border-crit" }
                      : u.onboarding_complete
                        ? { emoji: "✅", label: "onboarded", tone: "bg-good/15 text-good", stripe: "border-good" }
                        : j.nextStep
                          ? {
                              emoji: nextLabel?.emoji ?? "🚶",
                              label: `step ${j.nextStepIndex + 1}/${j.onboardingSteps.length} ${nextLabel?.label ?? j.nextStep.type}`,
                              tone: "bg-warn/15 text-warn",
                              stripe: "border-warn",
                            }
                          : j.onboardingSteps.length === 0
                            ? { emoji: "🚶", label: "no onboarding", tone: "bg-muted/10 text-muted", stripe: "border-line" }
                            : { emoji: "🏁", label: "steps done", tone: "bg-accent/15 text-accent", stripe: "border-accent" };
                const chip = "shrink-0 rounded-full px-1.5 py-px text-[9px] font-medium leading-[14px]";
                return (
                  <Link
                    key={u.id}
                    href={qs(u.id)}
                    aria-current={selected?.id === u.id ? "true" : undefined}
                    className={
                      "telegram-conversation-row flex items-center gap-2.5 border-l-2 px-3.5 py-3 text-left transition sm:px-3 sm:py-2.5 " +
                      stage.stripe +
                      " " +
                      (selected?.id === u.id ? "bg-accent/10" : "hover:bg-muted/10")
                    }
                  >
                    <FanAvatar
                      cloneId={u.clone_id}
                      telegramId={u.telegram_id}
                      name={displayName(u)}
                      className="telegram-fan-avatar h-9 w-9 text-xs"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className={"min-w-0 flex-1 truncate text-sm font-medium " + (u.blocked ? "text-crit" : "text-ink")}>
                          {displayName(u)}
                        </span>
                        {/* What he has BOUGHT, right beside the name. */}
                        {(mediaBuysByFan.get(u.id)?.count ?? 0) > 0 && (
                          <span
                            className="shrink-0 rounded-full bg-good/15 px-1.5 text-[9px] font-semibold leading-[14px] text-good"
                            title={`${mediaBuysByFan.get(u.id)!.count} paid media unlocks, ${fmtNum(mediaBuysByFan.get(u.id)!.stars)}★. Open him to see which messages they were.`}
                          >
                            🔓 {mediaBuysByFan.get(u.id)!.count}
                          </span>
                        )}
                        {/* Lifetime spend right after the name - the number that matters. */}
                        {(u.total_spent_stars ?? 0) > 0 && (
                          <span className="shrink-0 font-mono text-[11px] font-semibold tabular-nums text-good">
                            {fmtNum(u.total_spent_stars)}★
                          </span>
                        )}
                        {u.blocked && (
                          <span className="shrink-0 rounded-full bg-crit/15 px-1.5 text-[9px] font-semibold uppercase text-crit">
                            flag
                          </span>
                        )}
                        {/* users.paused - one fan paused, distinct from a safety block
                            and from the whole-clone Active/Paused status. */}
                        {u.paused && (
                          <span className="shrink-0 rounded-full bg-warn/15 px-1.5 text-[9px] font-semibold uppercase text-warn">
                            paused
                          </span>
                        )}
                      </span>
                      {/* Telegram identifiers first, stated name after. The
                          handle, the id and the business connection are what
                          resolve to a person; the name he typed at her does not. */}
                      <span className="block truncate font-mono text-[10px] text-muted">
                        {identityBits(u).join(" · ")}
                      </span>
                      <span className="block truncate text-[11px] text-muted">
                        {statedAlias(u) ? (
                          <>
                            says <span className="text-ink">{statedAlias(u)}</span> ·{" "}
                          </>
                        ) : null}
                        <span className="creator-name">{cloneById.get(u.clone_id)?.name ?? "-"}</span>
                      </span>
                      <span className="telegram-conversation-flags mt-1 flex flex-wrap items-center gap-1">
                        <span
                          className={"telegram-journey-chip " + chip + " " + stage.tone}
                          title={
                            j.nextStep
                              ? `Next onboarding step: ${nextLabel?.label ?? j.nextStep.type} at ${j.nextStep.after_messages ?? "?"} messages. ${j.firedSteps.length} of ${j.onboardingSteps.length} already sent.`
                              : "Onboarding stage for this fan."
                          }
                        >
                          {stage.emoji} {stage.label}
                        </span>
                        {/* Credits frozen is the single most surprising behaviour
                            in the product (operator decision D3) and the usual
                            answer to "why is this fan never hitting the paywall". */}
                        {j.creditsFrozen && (
                          <span
                            className={chip + " bg-crit/15 font-semibold text-crit"}
                            title={creditsFrozenHint}
                          >
                            🧊 frozen
                          </span>
                        )}
                        {/* Typing dots and the drip chip are the live pair. The
                            server values are passed in and shown until the feed
                            says otherwise, so the row is right before the stream
                            connects and stays right if it never does. */}
                        <FanLive
                          fanId={u.id}
                          initialStep={j.campaignStep}
                          initialTotal={j.campaignSteps.length}
                          initialEnabled={j.campaignEnabled}
                        />
                        {/* Only the two states an operator has to act on. "Never
                            hit" and "first hit used" are the healthy majority. */}
                        {paywall.loud && (
                          <span className={chip + " " + paywall.tone} title={PAYWALL_HINT}>
                            💳 {paywall.label}
                          </span>
                        )}
                        {route && (
                          <span className={chip + " " + route.tone} title="What the router picked on this fan's most recent turn.">
                            {route.emoji} {route.label}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="shrink-0 self-start text-[10px] text-muted">{ago(u.last_message_received)}</span>
                  </Link>
                );
              })
            )}
            {hasMore && (
              <Link
                href={baseQs({ show: String(Math.min(showCount + FAN_PAGE, FAN_MAX)) })}
                className="block px-3 py-3 text-center text-xs font-medium text-accent transition hover:bg-muted/10"
              >
                Load more ({fmtNum(filtered.length)} of {fmtNum(totalFans)})
              </Link>
            )}
          </div>
        </Card>

        {/* ── Middle: real chat thread, Telegram 1:1 ─────────────────────── */}
        <Card size="sm" className={`users-panel users-panel-chat flex h-[42rem] ${colHeight} flex-col overflow-hidden p-0`}>
          {!selected ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted">Pick a fan to view messages.</div>
          ) : (
            <>
              {/* Header. Telegram's own order: who he is, then his handle and
                  ids. The name he TYPED at her sits under those as a note, not
                  as the headline — see the identity comment above. */}
              <div className="telegram-chat-header flex items-center gap-2.5 border-b border-line px-3.5 py-2.5 sm:px-3 sm:py-2">
                <FanAvatar
                  cloneId={selected.clone_id}
                  telegramId={selected.telegram_id}
                  name={displayName(selected)}
                  className="telegram-fan-avatar h-9 w-9 text-[11px]"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-ink">{displayName(selected)}</span>
                    {mediaPurchaseCount > 0 && (
                      <span
                        className="shrink-0 rounded-full bg-good/15 px-1.5 py-px text-[10px] font-semibold text-good"
                        title={
                          unlinkedMediaPurchases > 0
                            ? `${mediaPurchaseCount} paid media unlocks. ${unlinkedMediaPurchases} of them were recorded before the purchase started naming the item, so they are counted here but cannot be attached to a specific message in the thread.`
                            : `${mediaPurchaseCount} paid media unlocks, each marked on its own message in the thread.`
                        }
                      >
                        🔓 {mediaPurchaseCount} bought
                      </span>
                    )}
                  </div>
                  <div className="truncate text-[11px] text-muted">
                    {identityBits(selected).join(" · ")} · via{" "}
                    <span className="creator-name">{cloneById.get(selected.clone_id)?.name ?? "-"}</span>
                  </div>
                  {statedAlias(selected) && (
                    <div
                      className="truncate text-[11px] text-muted"
                      title="The name this fan typed at her in chat. She calls him this; it is not verified and two fans can share one."
                    >
                      says his name is <span className="font-medium text-ink">{statedAlias(selected)}</span>
                    </div>
                  )}
                </div>
                <div className="telegram-chat-actions">
                  <span className="telegram-history-badge"><Sparkles size={14} aria-hidden="true" />{selected.paused ? "Paused" : "Live history"}</span>
                  {!selectedV2 && isStoredFan(selected.id) && <MutationForm action={setPaused}>
                    <input type="hidden" name="userId" value={selected.id} />
                    <input type="hidden" name="paused" value={selected.paused ? "false" : "true"} />
                    <ConfirmSubmit className="telegram-takeover" message={selected.paused ? "Resume automated replies for this fan?" : "Take over this fan's conversation? Automated replies and campaigns for this fan pause until you resume them."}>
                      <UserRound size={16} aria-hidden="true" />{selected.paused ? "Resume AI" : "Take over"}
                    </ConfirmSubmit>
                  </MutationForm>}
                </div>
              </div>

              <ChatThread
                key={`${selected.id}:${params.before ?? ""}:${params.after ?? ""}`}
                historyNavigation={
                  <nav aria-label="Conversation history" className="telegram-history-nav flex flex-wrap items-center justify-center gap-3 border-b border-line px-3 py-2 text-xs">
                    <span className="text-muted">All stored history</span>
                    {historyUnavailable && <span role="status" className="text-warn">Some stored messages could not refresh. Retrying automatically.</span>}
                    {history.length > 0 && (historyHasMore || !combinedHistory && historyAfter) && (
                      <Link scroll={false} className="rounded-md border border-blue-600 px-3 py-1 font-medium text-blue-600 hover:underline" href={baseQs({ fan: selected.id, before: combinedHistory ? inboxCursor(history[0]) : historyCursor(history[0]) })}>Load older messages</Link>
                    )}
                    {!historyUnavailable && !historyHasMore && !historyAfter && history.length > 0 && <span className="text-muted">Start of stored conversation</span>}
                    {!combinedHistory && history.length > 0 && (historyBefore || historyAfter && historyHasMore) && (
                      <Link scroll={false} className="text-blue-600 hover:underline" href={baseQs({ fan: selected.id, after: historyCursor(history[history.length - 1]) })}>Newer messages</Link>
                    )}
                    {(historyBefore || historyAfter) && <Link scroll={false} className="text-blue-600 hover:underline" href={qs(selected.id)}>Latest messages</Link>}
                    <span className="text-muted">{history.length} messages on this page</span>
                  </nav>
                }
                fanId={selected.id}
                messages={threadMessages}
                lastActiveLabel={ago(selected.last_message_received)}
                spentStars={totalSpent}
                purchasedCount={mediaPurchaseCount}
              />
              <div className="telegram-live-composer">
                {selected.paused && !selectedV2 && isStoredFan(selected.id) ? (
                  <ManualTakeover userId={selected.id} freePhotos={freePhotos} />
                ) : (
                  <div className="telegram-composer-status"><MessageCircle size={18} aria-hidden="true" /><span>{selectedV2 || !isStoredFan(selected.id) ? "Live conversation. New messages appear automatically." : "Take over to send a message."}</span></div>
                )}
              </div>
            </>
          )}
        </Card>

        {/* ── Right: complete user data + profile ───────────────────────── */}
        <Card size="sm" className={`users-panel users-panel-profile ${colHeight} overflow-y-auto p-4`}>
          {!selected ? (
            <div className="flex h-full items-center justify-center text-center text-xs text-muted">
              Pick a fan to see their data.
            </div>
          ) : (
            <div className="telegram-profile-content flex flex-col gap-5">
              <div>
                {/* Who this panel is about - name up top, same as the chat header. */}
                <div className="telegram-profile-header mb-2.5 flex items-center gap-2.5">
                  <FanAvatar
                    cloneId={selected.clone_id}
                    telegramId={selected.telegram_id}
                    name={displayName(selected)}
                    className="telegram-fan-avatar h-9 w-9 text-xs"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-ink">{displayName(selected)}</div>
                    {selected.username && <div className="truncate text-[11px] text-muted">@{selected.username}</div>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-[10px] font-medium " +
                      (isPaying ? "bg-good/15 text-good" : "bg-muted/10 text-muted")
                    }
                  >
                    {isPaying ? "Paying fan" : "Free user"}
                  </span>
                  {selected.spend_tier && selected.spend_tier !== "none" && <SpendTierChip tier={selected.spend_tier} />}
                  {selected.is_high_spender && (
                    <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[10px] font-medium text-warn">
                      ⚡ Power spender
                    </span>
                  )}
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-[10px] " +
                      (selected.is_active ? "bg-good/15 text-good" : "bg-muted/10 text-muted")
                    }
                  >
                    {selected.is_active ? "active" : "inactive"}
                  </span>
                  {selected.blocked && (
                    <span className="rounded-full bg-crit/15 px-2 py-0.5 text-[10px] font-medium text-crit">
                      {selected.blocked_reason === "us_location"
                        ? "Blocked (US fan, location gate)"
                        : "Blocked (safety)"}
                    </span>
                  )}
                  {/* The minor gate had NO indicator at all, which is half of why
                      it was undiagnosable: a gated fan looked completely normal
                      while silently receiving no media on any path. */}
                  {(!!selected.minor_flagged_at || selected.blocked_reason === "minor") && (
                    <span
                      className="rounded-full bg-crit/15 px-2 py-0.5 text-[10px] font-medium text-crit"
                      title="This fan stated an age under 18, so every photo, video, bundle, free preview, paid send, onboarding media step, drip and voice note is permanently blocked for him. Unblocking alone does NOT lift this."
                    >
                      Minor gate (no media, ever)
                    </span>
                  )}
                  {selected.paused && (
                    <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[10px] font-medium text-warn">
                      Paused (this fan)
                    </span>
                  )}
                  {selected.subscription_status === "active" && (
                    <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent">
                      VIP{selected.subscription_tier ? ` · ${selected.subscription_tier}` : ""}
                    </span>
                  )}
                </div>
                {/* Agent logs (item 8): a per-fan filtered view of the existing
                    /logs page (system_logs errors/warnings + usage_events AI
                    calls), scoped to exactly this fan's clone + telegram id.
                    Not a new logging system - reuses the same infrastructure
                    every other "why did X happen" question already goes through. */}
                <Link
                  href={`/logs?clone=${selected.clone_id}&fan=${selected.telegram_id}&fanUser=${selected.id}&fanLabel=${encodeURIComponent(displayName(selected))}`}
                  className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline"
                >
                  🧾 View logs for this fan →
                </Link>
              </div>

              <dl className="telegram-fan-meta">
                <div><dt><UserRound size={16} aria-hidden="true" />Fan since</dt><dd>{dateTime(selected.first_seen_at)}</dd></div>
                {personalProfileCategories.find(row => row.label === "Location")?.value && <div><dt><MapPin size={16} aria-hidden="true" />Location</dt><dd>{personalProfileCategories.find(row => row.label === "Location")?.value}</dd></div>}
                <div><dt><Clock3 size={16} aria-hidden="true" />Last message</dt><dd>{dateTime(selected.last_message_received)}</dd></div>
              </dl>

              <section className="telegram-context-section" aria-labelledby="telegram-saved-facts">
                <h2 id="telegram-saved-facts"><Sparkles size={18} aria-hidden="true" />Saved facts</h2>
                {[...personalRows, ...contextRows, ...otherRows].some(row => row.items.length > 0) ? (
                  <ul className="telegram-saved-facts">{[...personalRows, ...contextRows, ...otherRows].filter(row => row.items.length > 0).slice(0, 2).map(row => <li key={row.label}><span aria-hidden="true">{row.emoji}</span><div><small>{row.label}</small><span>{row.items.join(" · ")}</span></div></li>)}</ul>
                ) : <p className="telegram-context-empty">No saved facts yet.</p>}
              </section>

              <section className="telegram-context-section" aria-labelledby="telegram-conversation-summary">
                <h2 id="telegram-conversation-summary"><FileText size={18} aria-hidden="true" />Conversation summary</h2>
                <p className="telegram-summary">{sentenceCase(profile?.summary?.trim() ?? "") || "No conversation summary recorded yet."}</p>
              </section>

              <section className="telegram-context-section" aria-labelledby="telegram-purchase-history">
                <h2 id="telegram-purchase-history"><ShoppingCart size={18} aria-hidden="true" />Purchase history</h2>
                <div className="telegram-spend-card"><TelegramSpendSummary stars={totalSpent} cloneId={selected.clone_id} /><span>Total recorded spend · {fmtNum(purchases.length)} purchases</span></div>
                <details className="telegram-purchase-records"><summary>View purchases ({fmtNum(purchases.length)})</summary>
                  {purchases.length === 0 ? <p className="telegram-context-empty">No purchases recorded yet.</p> : <div className="telegram-purchase-list">{purchases.map((purchase, index) => <div key={index}><span>{purchase.kind === "credits" ? "messages" : purchase.kind}<small>{dateTime(purchase.paid_at)}</small></span><StarAmount stars={purchase.amount_stars} cloneId={selected.clone_id} /></div>)}</div>}
                </details>
              </section>

              <details className="telegram-fan-details"><summary>More fan details & controls</summary><div className="telegram-fan-details-body">
              <div className="grid grid-cols-2 gap-2">
                {[
                  {
                    label: "Credits",
                    value: (
                      <span
                        className={
                          selected.message_credits <= 0 ? "text-crit" : selected.message_credits <= 5 ? "text-warn" : ""
                        }
                      >
                        {selected.message_credits == null ? "—" : fmtNum(selected.message_credits)}
                      </span>
                    ),
                  },
                  { label: "Total spent", value: totalSpent > 0 ? <StarAmount stars={totalSpent} cloneId={selected.clone_id} /> : "-" },
                  { label: "Purchases", value: fmtNum(purchases.length) },
                  { label: "Msgs sent", value: selected.total_messages_sent == null ? "—" : fmtNum(selected.total_messages_sent) },
                  { label: "Msgs bought", value: fmtNum(selected.total_messages_purchased ?? 0) },
                  { label: "First seen", value: <span title={dateTime(selected.first_seen_at)}>{ago(selected.first_seen_at)}</span> },
                  { label: "Last active", value: <span title={dateTime(selected.last_message_received)}>{ago(selected.last_message_received)}</span> },
                  { label: "Telegram ID", value: <span className="font-mono text-xs">{selected.telegram_id}</span> },
                ].map((s) => (
                  <div key={s.label} className="users-stat rounded-md border border-line bg-bg p-2">
                    <div className="text-[10px] text-muted">{s.label}</div>
                    <div className="mt-0.5 text-sm font-semibold text-ink">{s.value}</div>
                  </div>
                ))}
              </div>

              {/* Identity - Telegram vs stated, language etc. */}
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Identity</div>
                <dl className="flex flex-col gap-1">
                  {(
                    [
                      ["Telegram name", selected.name],
                      ["Stated name", selected.stated_name],
                      ["Username", selected.username ? `@${selected.username}` : null],
                      ["Language", selected.language_code],
                      ["Telegram ID", selected.telegram_id],
                      ["Bot", cloneById.get(selected.clone_id)?.name],
                    ] as [string, any][]
                  ).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3 border-b border-line pb-1 text-xs">
                      <dt className="text-muted">{k}</dt>
                      <dd className={(k === "Bot" ? "creator-name " : "") + "text-right font-medium text-ink"}>{v ?? "-"}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {/* Onboarding / paywall journey (PART 3, 3a; T8 rebuild) - display
                  only, driven entirely by columns app/users/page.tsx already
                  fetched via select("*") (plus clones.onboarding_steps, added
                  above) but never fully rendered. Shows exact POSITION, not a
                  bare count: which step is next, which already fired, and the
                  credit freeze - the single most surprising behaviour in the
                  product and previously invisible on this page. */}
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Journey</div>
                {/* At-a-glance campaign status: what has fired, what is next,
                    when it is due. Live, and computed rather than read, since
                    users.next_send_at is a dead column (migration 032). */}
                <div className="mb-2">
                  <DripStrip
                    fanId={selected.id}
                    labels={(selectedJourney?.campaignSteps ?? []).map((s) => s.type)}
                    initial={{
                      step: selectedJourney?.campaignStep ?? 0,
                      total: selectedJourney?.campaignSteps.length ?? 0,
                      enabled: selectedJourney?.campaignEnabled !== false,
                      nextType: selectedDripDue?.step.type ?? null,
                      nextDueAt: selectedDripDue?.at ?? null,
                    }}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-[10px] font-medium " +
                      (selected.onboarding_complete ? "bg-good/15 text-good" : "bg-warn/15 text-warn")
                    }
                  >
                    {selected.onboarding_complete
                      ? "✅ Onboarded"
                      : nextStep
                        ? `🚶 Onboarding · step ${(selectedJourney?.nextStepIndex ?? 0) + 1}/${onboardingSteps.length} next: ${ONBOARDING_STEP_LABEL[nextStep.type]?.emoji ?? ""} ${ONBOARDING_STEP_LABEL[nextStep.type]?.label ?? nextStep.type} at ${nextStep.after_messages ?? "?"} msgs`
                        : onboardingSteps.length === 0
                          ? "🚶 Onboarding (no steps configured)"
                          : "🚶 Onboarding · all steps sent"}
                  </span>
                  {/* The campaign chip that used to sit here is now the status
                      strip above: same fact, plus what is next and when. */}
                  {(() => {
                    const r = lastRoute.get(`${selected.clone_id}:${selected.telegram_id}`);
                    return r ? (
                      <span
                        className={"rounded-full px-2 py-0.5 text-[10px] font-medium " + r.tone}
                        title="What the router picked on this fan's most recent turn. Full history is on the logs page linked above."
                      >
                        {r.emoji} last route: {r.label}
                      </span>
                    ) : null;
                  })()}
                  {!selected.onboarding_complete && creditsFrozen && (
                    <span className="flex items-center gap-1 rounded-full bg-crit/15 px-2 py-0.5 text-[10px] font-semibold text-crit">
                      🧊 CREDITS FROZEN
                      <Info text={creditsFrozenHint} />
                    </span>
                  )}
                  {!selected.onboarding_complete && firedSteps.length > 0 && (
                    <span
                      className="rounded-full bg-muted/10 px-2 py-0.5 text-[10px] text-muted"
                      title={`Already sent, in order: ${firedSteps.map((s) => ONBOARDING_STEP_LABEL[s.type]?.label ?? s.type).join(", ")}`}
                    >
                      fired: {firedSteps.map((s) => ONBOARDING_STEP_LABEL[s.type]?.emoji ?? "").join(" ")} ({firedSteps.length}/{onboardingSteps.length})
                    </span>
                  )}
                  <span className={"flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium " + paywallState.tone}>
                    💳 {paywallState.label}
                    <Info text={paywallHint} />
                  </span>
                  {selected.paywall_primed && (
                    <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent" title="Pre-lock warmup has already fired for this episode.">
                      🔥 Primed
                    </span>
                  )}
                  {selected.paywall_prime_sent && (
                    <span className="rounded-full bg-muted/10 px-2 py-0.5 text-[10px] text-muted" title="Warmup line sent at least once, ever (fire-once flag).">
                      prime sent
                    </span>
                  )}
                  {selected.paywall_resume_sent && (
                    <span className="rounded-full bg-muted/10 px-2 py-0.5 text-[10px] text-muted" title="Post-purchase resume line already sent, ever (fire-once flag).">
                      resume sent
                    </span>
                  )}
                  {(selected.postlock_stage ?? 0) > 0 && (
                    <span
                      className="rounded-full bg-muted/10 px-2 py-0.5 text-[10px] text-muted"
                      title="Proactive re-engagement stage after locking (0 = just locked, stops trying once it reaches 2)."
                    >
                      postlock stage {selected.postlock_stage}
                    </span>
                  )}
                </div>
              </div>

              {/* Credits - live adjust */}
              {!selectedV2 && isStoredFan(selected.id) && <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Credits</div>
                <MutationForm action={setCredits} className="flex items-center gap-2">
                  <input type="hidden" name="userId" value={selected.id} />
                  <Input
                    name="credits"
                    type="number"
                    min={0}
                    defaultValue={selected.message_credits}
                    className="h-8 w-24 text-sm"
                  />
                  <button
                    type="submit"
                    className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-ink transition hover:bg-accent-deep"
                  >
                    Save
                  </button>
                </MutationForm>
              </div>}

              {/* Knowledge / profile dossier - what the bot has learned. Built by
                  services/profile-extractor.ts from the fan's own messages;
                  read only here, she updates it herself as the conversation
                  grows. */}
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span
                    className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted"
                    title="What she's picked up about him from the conversation so far: a running summary, interests, remembered details and preferences. Updates automatically as he talks; nothing here is editable."
                  >
                    Knowledge / profile
                    <span className="cursor-help text-[10px] normal-case text-muted/70">ⓘ</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] text-muted">
                    {profile?.extracted_msg_count != null && <span>from {fmtNum(profile.extracted_msg_count)} msgs</span>}
                    {profile?.updated_at && (
                      <span title={`Last updated ${dateTime(profile.updated_at)}`}>· updated {ago(profile.updated_at)}</span>
                    )}
                  </span>
                </div>
                <FanDossier
                  summary={sentenceCase(profile?.summary?.trim() ?? "")}
                  personal={personalRows}
                  contextRows={contextRows}
                  upcomingEvents={upcomingEvents}
                  recentEvents={recentEvents}
                  other={otherRows}
                />
              </div>

              {/* Controls - the destructive/rare ops, tucked away but all here */}
              {!selectedV2 && isStoredFan(selected.id) && <details className="mt-auto rounded-md border border-line bg-bg">
                <summary className="cursor-pointer select-none px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted hover:text-ink">
                  Controls
                </summary>
                <div className="flex flex-col gap-1.5 border-t border-line p-2.5">
                  <MutationForm action={setCredits}>
                    <input type="hidden" name="userId" value={selected.id} />
                    <input type="hidden" name="credits" value="0" />
                    <ConfirmSubmit
                      message="Set this fan's message credits to 0?"
                      className="w-full rounded-md border border-line px-3 py-1.5 text-left text-xs text-ink transition hover:bg-elev"
                    >
                      Reset credits to 0
                    </ConfirmSubmit>
                  </MutationForm>

                  <MutationForm action={resetCounters}>
                    <input type="hidden" name="userId" value={selected.id} />
                    <ConfirmSubmit
                      message="Reset lifetime counters (messages sent + bought) to 0? This does not change credits or purchase history."
                      className="w-full rounded-md border border-line px-3 py-1.5 text-left text-xs text-ink transition hover:bg-elev"
                    >
                      Reset counters
                    </ConfirmSubmit>
                  </MutationForm>


                  <MutationForm adminOnly action={setTestTraffic}>
                    <input type="hidden" name="telegramId" value={selected.telegram_id} />
                    <input type="hidden" name="isTest" value={selected.is_test ? "false" : "true"} />
                    <ConfirmSubmit
                      message={
                        selected.is_test
                          ? "Count this Telegram account as real traffic again across every creator?"
                          : "Mark this Telegram account as TEST traffic across every creator? Conversation-led sales analytics will exclude it. Bot behaviour and purchase records are not deleted."
                      }
                      className="w-full rounded-md border border-line px-3 py-1.5 text-left text-xs text-ink transition hover:bg-elev"
                    >
                      {selected.is_test ? "Remove test-traffic flag" : "Mark as test traffic"}
                    </ConfirmSubmit>
                  </MutationForm>

                  <MutationForm action={toggleActive}>
                    <input type="hidden" name="userId" value={selected.id} />
                    <input type="hidden" name="active" value={selected.is_active ? "false" : "true"} />
                    <button
                      type="submit"
                      className="w-full rounded-md border border-line px-3 py-1.5 text-left text-xs text-ink transition hover:bg-elev"
                    >
                      {selected.is_active ? "Mark inactive" : "Mark active"}
                    </button>
                  </MutationForm>

                  <MutationForm action={setBlocked}>
                    <input type="hidden" name="userId" value={selected.id} />
                    <input type="hidden" name="blocked" value={selected.blocked ? "false" : "true"} />
                    <ConfirmSubmit
                      message={
                        selected.blocked
                          ? !!selected.minor_flagged_at || selected.blocked_reason === "minor"
                            ? "Unblock this fan? She will start replying to him again, BUT he stays under the minor gate, so he still gets no photos, videos, bundles or voice notes. Use 'Clear minor gate' below if that flag is wrong."
                            : "Unblock this fan? The bot will start replying to him again."
                          : "Block this fan? The bot will never reply to him again (same switch the safety guard uses)."
                      }
                      className="w-full rounded-md border border-line px-3 py-1.5 text-left text-xs text-ink transition hover:bg-elev"
                    >
                      {selected.blocked ? "Unblock (safety)" : "Block (safety)"}
                    </ConfirmSubmit>
                  </MutationForm>

                  {/* Only rendered for an actually-gated fan. There is no reason
                      to offer "clear the minor gate" on a fan who does not have
                      one, and an always-visible button invites a misclick on the
                      single safety verdict with a real-world cost if reversed. */}
                  {(!!selected.minor_flagged_at || selected.blocked_reason === "minor") && (
                    <MutationForm adminOnly action={clearMinorFlag}>
                      <input type="hidden" name="userId" value={selected.id} />
                      <ConfirmSubmit
                        message="Clear the minor gate for this fan? Only do this if you have READ THE CONVERSATION and are satisfied he is an adult who was flagged by mistake. This restores all photos, videos, bundles and voice notes for him permanently."
                        className="w-full rounded-md border border-crit/40 px-3 py-1.5 text-left text-xs text-crit transition hover:bg-crit/10"
                      >
                        Clear minor gate
                      </ConfirmSubmit>
                    </MutationForm>
                  )}

                  {/* users.paused - pauses just this one fan (no replies, no drip)
                      without blocking him and without touching the clone's own
                      Active/Paused status. */}
                  <MutationForm action={setPaused}>
                    <input type="hidden" name="userId" value={selected.id} />
                    <input type="hidden" name="paused" value={selected.paused ? "false" : "true"} />
                    <ConfirmSubmit
                      message={
                        selected.paused
                          ? "Resume this fan? The bot will reply to him again."
                          : "Pause this fan? He gets no replies until resumed. He is not blocked, and no other fan is affected."
                      }
                      className="w-full rounded-md border border-line px-3 py-1.5 text-left text-xs text-ink transition hover:bg-elev"
                    >
                      {selected.paused ? "Resume this fan" : "Pause this fan"}
                    </ConfirmSubmit>
                  </MutationForm>

                  <MutationForm adminOnly action={deleteUser}>
                    <input type="hidden" name="userId" value={selected.id} />
                    <input type="hidden" name="cloneId" value={selected.clone_id} />
                    <input type="hidden" name="telegramId" value={selected.telegram_id} />
                    <ConfirmSubmit
                      message={`Permanently delete ${displayName(selected)}? This removes the user, their purchase records and entire chat history. This cannot be undone.`}
                      className="w-full rounded-md border border-crit/30 bg-crit/10 px-3 py-1.5 text-left text-xs font-medium text-crit transition hover:bg-crit/20"
                    >
                      Delete user
                    </ConfirmSubmit>
                  </MutationForm>
                </div>
              </details>}
              </div></details>
            </div>
          )}
        </Card>
      </MessagesWorkspace>
    </div>
  );
}

