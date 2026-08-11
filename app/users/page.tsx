import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { fmtNum } from "@/lib/money";
import { getCloneScope } from "@/lib/clone-scope";
import StarAmount from "@/components/StarAmount";
import { SpendTierChip } from "@/components/SpendTierBadge";
import { Card } from "@/components/ui/card";
import FanAvatar from "@/components/FanAvatar";
import { Input } from "@/components/ui/input";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { Info } from "@/components/clone/fields";
import { setCredits, resetCounters, toggleActive, setBlocked, setPaused, deleteUser, clearMinorFlag } from "./actions";
import ManualTakeover from "@/components/ManualTakeover";

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
type CampaignStepRow = { type: "text" | "voice" | "photo" | "video" | "bundle"; after_hours: number };
type CloneRow = {
  id: string;
  name: string;
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

// Mirrors mapClone's campaignSteps in bot/src/data/supabase-store.ts: a row
// without a type the runtime knows, or an OLD-shape row ({type,text} with no
// valid after_hours), is dropped exactly as the runtime drops it. Sorted by
// after_hours because that is the order bot/src/campaign.ts walks, and
// users.campaign_step indexes into THAT list, not into raw jsonb order.
const CAMPAIGN_STEP_TYPES = ["text", "voice", "photo", "video", "bundle"];
function campaignStepsOf(raw: unknown[] | null | undefined): CampaignStepRow[] {
  return (Array.isArray(raw) ? raw : [])
    .filter((s): s is { type: string; after_hours?: unknown } => !!s && typeof s === "object" && "type" in s)
    .filter((s) => CAMPAIGN_STEP_TYPES.includes(s.type))
    .map((s) => ({ type: s.type as CampaignStepRow["type"], after_hours: Number(s.after_hours) }))
    .filter((s) => Number.isFinite(s.after_hours) && s.after_hours >= 1 && s.after_hours <= 23)
    .sort((a, b) => a.after_hours - b.after_hours);
}

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

// Colored filter chips. "Active"/"Unreachable" split on the Telegram 24h
// messaging window (active = we can still message them, see memory rule).
const FILTERS = [
  { key: "all", label: "👥 All", on: "border-line bg-muted/20 text-ink", off: "border-line text-ink/70" },
  { key: "active", label: "🟢 Active", on: "border-good/50 bg-good/15 text-good", off: "border-good/20 text-good/70" },
  { key: "unreachable", label: "💤 Unreachable", on: "border-line bg-muted/20 text-muted", off: "border-line text-muted/70" },
  { key: "paying", label: "💰 Paying", on: "border-warn/50 bg-warn/15 text-warn", off: "border-warn/20 text-warn/70" },
  { key: "credits", label: "🪙 Credits", on: "border-accent/50 bg-accent/15 text-accent", off: "border-accent/20 text-accent/70" },
  { key: "new", label: "✨ New", on: "border-love/55 bg-love/15 text-love-ink", off: "border-love/25 text-love-ink/75" },
  { key: "flagged", label: "🚩 Flagged", on: "border-crit/50 bg-crit/15 text-crit", off: "border-crit/20 text-crit/70" }, // = users.blocked
];

// Sort chips: click again to flip direction (default = descending, "live view").
const SORTS = [
  { key: "last_message_received", label: "Live" },
  { key: "total_spent_stars", label: "Spent" },
  { key: "total_messages_sent", label: "Messages" },
  { key: "first_seen_at", label: "Joined" },
];

export default async function FansPage({
  searchParams,
}: {
  searchParams: Promise<{ fan?: string; q?: string; status?: string; sort?: string; dir?: string }>;
}) {
  const cloneId = await getCloneScope();
  const { fan: fanParam, q = "", status = "all", sort = "last_message_received", dir = "" } = await searchParams;
  const sortKey = SORTS.some((s) => s.key === sort) ? sort : "last_message_received";
  const asc = dir === "asc";

  const [clonesRes, usersRes, routeLogsRes] = await Promise.all([
    // id/name for the fan-list "via X" line; the rest reconstructs every fan's
    // exact onboarding position, campaign position and credit-freeze state (see
    // onboardingActive() in bot/src/onboarding-state.ts and the step walk in
    // bot/src/campaign.ts, mirrored here the same way lib/persona-facts.ts
    // mirrors prompt.ts). Both step lists are per-CLONE, so they are fetched
    // once here and joined to each fan row, never queried per fan.
    supabaseAdmin
      .from("clones")
      .select("id,name,onboarding_steps,onboarding_free_preview_enabled,photos_enabled,drip_steps,drip_enabled"),
    (() => {
      let query = supabaseAdmin
        .from("users")
        .select("*")
        .order(sortKey, { ascending: asc, nullsFirst: asc });
      if (cloneId) query = query.eq("clone_id", cloneId);
      return query;
    })(),
    // Last route per fan. One indexed read of the most recent routing rows
    // (system_logs_source_ts_idx covers exactly this (source, ts desc) shape),
    // then newest-per-fan in memory, rather than a query per row. PostgREST
    // caps every response at 1000 rows on this project, so on a busy fleet this
    // window only reaches back so far: a fan outside it gets NO route chip,
    // which is the intended failure - never a stale one presented as current.
    (() => {
      let query = supabaseAdmin
        .from("system_logs")
        .select("clone_id,telegram_id,detail")
        .eq("source", "routing")
        .order("ts", { ascending: false })
        .limit(1000);
      if (cloneId) query = query.eq("clone_id", cloneId);
      return query;
    })(),
  ]);

  const clones = (clonesRes.data ?? []) as CloneRow[];
  const cloneById = new Map(clones.map((c) => [c.id, c]));
  const allUsers = (usersRes.data ?? []) as any[];

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

  // Data above the list: fleet/clone-scoped counts, unaffected by search/status
  // so they always read as the true totals for the current clone scope.
  const totalFans = allUsers.length;
  // "Active" = messaged in the last 24h (the Telegram messaging window), NOT the manual is_active flag.
  const activeFans = allUsers.filter(
    (u) => u.last_message_received && Date.now() - new Date(u.last_message_received).getTime() < 24 * 3600 * 1000,
  ).length;
  const payingFans = allUsers.filter((u) => (u.purchase_count ?? 0) > 0 || (u.total_spent_stars ?? 0) > 0).length;
  const flaggedFans = allUsers.filter((u) => !!u.blocked).length;

  const isPayingRow = (u: any) => (u.purchase_count ?? 0) > 0 || (u.total_spent_stars ?? 0) > 0;
  const qLower = q.trim().toLowerCase();
  const now = Date.now();
  const filtered = allUsers
    .filter((u) => {
      const reachable =
        u.last_message_received && now - new Date(u.last_message_received).getTime() < 24 * 3600_000;
      if (status === "active") return reachable; // inside the 24h window = we can message them
      if (status === "unreachable") return !reachable; // outside it = bot can't initiate
      if (status === "paying") return isPayingRow(u);
      if (status === "credits") return (u.message_credits ?? 0) > 0;
      if (status === "flagged") return !!u.blocked;
      if (status === "new") return u.first_seen_at && now - new Date(u.first_seen_at).getTime() <= 24 * 3600_000;
      return true;
    })
    .filter(
      (u) =>
        !qLower ||
        u.name?.toLowerCase().includes(qLower) ||
        u.stated_name?.toLowerCase().includes(qLower) ||
        u.username?.toLowerCase().includes(qLower) ||
        String(u.telegram_id).includes(qLower),
    );

  const selected = (fanParam && filtered.find((u) => u.id === fanParam)) || filtered[0] || null;

  let history: any[] = [];
  let purchases: any[] = [];
  let profile: any = null;
  // Manual takeover (migration 096) photo picker: restricted to this fan's
  // clone's FREE photos only — see manualSendPhoto in ./actions.ts for why
  // paid photos are never offered here. Only fetched when the panel can
  // actually render (fan already paused), to avoid an extra query otherwise.
  let freePhotos: { id: string; storage_path: string; caption: string | null; image_name: string | null }[] = [];
  if (selected) {
    const [historyRes, purchasesRes, profileRes, freePhotosRes] = await Promise.all([
      supabaseAdmin
        .from("chat_history")
        // select * (not named columns) so the additive `meta` column (migration
        // 030, rich bubbles) comes along when applied and nothing breaks before.
        .select("*")
        .eq("clone_id", selected.clone_id)
        .eq("telegram_id", selected.telegram_id)
        .order("created_at", { ascending: false })
        .limit(60),
      supabaseAdmin
        .from("star_transactions")
        .select("amount_stars,kind,paid_at")
        .eq("user_id", selected.id)
        .order("paid_at", { ascending: false }),
      supabaseAdmin.from("fan_profiles").select("*").eq("user_id", selected.id).maybeSingle(),
      selected.paused
        ? supabaseAdmin
            .from("photos")
            .select("id,storage_path,caption,image_name")
            .eq("clone_id", selected.clone_id)
            .eq("is_free", true)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as any[] }),
    ]);
    history = ((historyRes.data ?? []) as any[]).slice().reverse();
    purchases = (purchasesRes.data ?? []) as any[];
    profile = (profileRes.data ?? null) as any;
    freePhotos = (freePhotosRes.data ?? []) as any[];
  }

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
  const displayName = (u: any) => u.stated_name || u.name || `Fan ${u.telegram_id}`;
  const baseQs = (extra: Record<string, string>) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status !== "all") params.set("status", status);
    if (sortKey !== "last_message_received") params.set("sort", sortKey);
    if (asc) params.set("dir", "asc");
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
    profileCategory("Hobbies", ["hobbies", "hobby", "interests"], interests),
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

  // No heading, no vh-calc guessing — <main> in app/layout.tsx is already
  // pinned to exactly the remaining viewport height for every page (fixed
  // shell, TopBar included in that budget), so h-full here just flex-fills it
  // exactly. Only applied at lg+ though: below that the 3 columns stack into one
  // scrolling page (see layout.tsx's overflow-y-auto lg:overflow-hidden) —
  // forcing h-full there too used to squash 3 fixed-height panes into one
  // viewport with no way to reach the bottom two.
  const colHeight = "lg:h-full";

  return (
    <div className="users-workspace lg:h-full">
      {/* Middle column capped narrow (~400px, iPhone-width) instead of 1fr - 
          reads like a phone thread, not a stretched-out desktop panel. Left
          gets the extra room for data/filters, right takes whatever's left. */}
      <div className="grid gap-3 lg:h-full lg:grid-cols-3">
        {/* ── Left: fan list (data above, bigger search, filters) ───────── */}
        <Card size="sm" className={`users-panel users-panel-list flex h-[34rem] ${colHeight} flex-col overflow-hidden p-0`}>
          <div className="border-b border-line p-3">
            {/* Data above the list */}
            <div className="mb-3 grid grid-cols-3 gap-2">
              {[
                { label: "Fans", value: fmtNum(totalFans) },
                { label: "Active", value: fmtNum(activeFans) },
                { label: "Paying", value: fmtNum(payingFans) },
              ].map((s) => (
                <div key={s.label} className="users-stat rounded-md border border-line bg-bg px-2 py-1.5 text-center">
                  <div className="text-sm font-semibold tabular-nums text-ink">{s.value}</div>
                  <div className="text-[10px] text-muted">{s.label}</div>
                </div>
              ))}
            </div>

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
                placeholder="Search fans…"
                className="h-11 pl-9 text-sm"
              />
            </form>

            {/* Quick filters */}
            <div className="mb-2 flex flex-wrap gap-1">
              {FILTERS.map((s) => {
                // Flagged is the "needs attention" chip: always fully lit when any
                // exist, with a count badge, so it never fades into the row.
                const hot = s.key === "flagged" && flaggedFans > 0;
                return (
                  <Link
                    key={s.key}
                    href={baseQs({ status: s.key === "all" ? "" : s.key })}
                    className={
                      "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition hover:brightness-125 " +
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

            {/* Sort */}
            <div className="flex flex-wrap items-center gap-1">
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
                      "rounded-full border px-2.5 py-1 text-xs font-medium transition " +
                      (on ? "border-line bg-muted/20 text-ink" : "border-line text-muted hover:text-ink")
                    }
                  >
                    {s.label}
                    {on ? (asc ? " ↑" : " ↓") : ""}
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="flex-1 divide-y divide-line overflow-y-auto">
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
                    className={
                      "flex items-center gap-2.5 border-l-2 px-3 py-2.5 text-left transition " +
                      stage.stripe +
                      " " +
                      (selected?.id === u.id ? "bg-accent/10" : "hover:bg-muted/10")
                    }
                  >
                    <FanAvatar
                      cloneId={u.clone_id}
                      telegramId={u.telegram_id}
                      name={displayName(u)}
                      className="h-9 w-9 text-xs"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className={"min-w-0 flex-1 truncate text-sm font-medium " + (u.blocked ? "text-crit" : "text-ink")}>
                          {displayName(u)}
                        </span>
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
                      <span className="block truncate text-[11px] text-muted">
                        {u.username ? `@${u.username}` : cloneById.get(u.clone_id)?.name ?? "-"}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1">
                        <span
                          className={chip + " " + stage.tone}
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
                        {/* Campaign steps fired in his CURRENT quiet episode. Zero
                            is not shown: it is the normal state of a fan who just
                            messaged, not information. */}
                        {j.campaignStep > 0 && j.campaignSteps.length > 0 && (
                          <span
                            className={chip + " bg-purple-500/15 text-purple-400"}
                            title={`Automated campaign: ${j.campaignStep} of ${j.campaignSteps.length} steps sent this quiet episode. Resets to 0 the moment he messages.${j.campaignEnabled ? "" : " The campaign is currently OFF for this clone."}`}
                          >
                            💧 drip {j.campaignStep}/{j.campaignSteps.length}
                          </span>
                        )}
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
          </div>
        </Card>

        {/* ── Middle: real chat thread ──────────────────────────────────── */}
        <Card size="sm" className={`users-panel users-panel-chat flex h-[42rem] ${colHeight} flex-col overflow-hidden p-0`}>
          {!selected ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted">Pick a fan to view messages.</div>
          ) : (
            <>
              <div className="flex items-center gap-2.5 border-b border-line px-3 py-2.5">
                <FanAvatar
                  cloneId={selected.clone_id}
                  telegramId={selected.telegram_id}
                  name={displayName(selected)}
                  className="h-8 w-8 text-[11px]"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink">{displayName(selected)}</div>
                  <div className="text-[11px] text-muted">
                    {selected.username ? `@${selected.username} · ` : ""}
                    via {cloneById.get(selected.clone_id)?.name ?? "-"}
                  </div>
                </div>
                {/* Telegram paper-plane, Telegram blue */}
                <span className="flex shrink-0 items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[10px] font-medium text-muted">
                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="#2AABEE">
                    <path d="M21.9 3.4c.3-1.2-.9-2.2-2-1.7L2.5 9.1c-1.3.5-1.2 2.3.1 2.7l4.4 1.4 1.7 5.5c.4 1.2 1.9 1.5 2.7.6l2.4-2.6 4.5 3.3c1 .7 2.4.2 2.7-1l3-15.6zM8.5 12.6l9.5-6.2c.2-.2.5.2.3.4l-7.6 7.2-.3 3.2-1.9-4.6z" />
                  </svg>
                  via Telegram
                </span>
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto bg-bg px-3 py-3">
                {history.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted">No messages yet.</div>
                ) : (
                  history.map((m, i) => {
                    // Bot (her) = blue, RIGHT. Fan = grey, left. (Per Ronan 2026-07-17.)
                    const fan = m.role === "human";
                    // Rich bubbles for rows carrying meta (migration 030); anything
                    // without it — every old row — stays the plain text bubble.
    	            const meta = metaOf(m);
                    const info = meta?.media_id ? mediaInfo.get(meta.media_id) : undefined;
                    const isVoice = meta?.type === "voice" && !!meta.tg_file_id;
                    const isMedia = !!info && (meta?.type === "photo" || meta?.type === "video" || meta?.type === "bundle");
                    const transcript = voiceWords(m.content);
                    // Generic fallbacks for rows we can't fully resolve: old voice
                    // rows (no file to play) still show 🎙 + transcript; old/unmatched
                    // media rows show an icon + price + caption parsed from the text.
                    const legacyVoice = !isVoice && !fan && transcript != null;
                    const legacyMedia = !isVoice && !isMedia && !legacyVoice && !fan ? mediaText(m.content) : null;
                    const caption = mediaText(m.content)?.caption ?? null;
                    return (
                      <div key={i} className={"flex " + (fan ? "justify-start" : "justify-end")}>
                        <div
                          className={
                            "max-w-[75%] rounded-2xl px-3 py-2 text-sm " +
                            (fan ? "rounded-bl-sm bg-elev text-ink" : "rounded-br-sm bg-accent text-white")
                          }
                        >
                          {isVoice ? (
                            <>
                              {/* Playable voice note, streamed via /api/voice (Telegram getFile proxy) */}
                              <audio
                                controls
                                preload="none"
                                className="h-9 w-60 max-w-full"
                                src={`/api/voice?clone=${selected.clone_id}&file=${encodeURIComponent(meta!.tg_file_id!)}`}
                              />
                              {transcript && (
                                <div className="mt-1 whitespace-pre-wrap break-words text-xs italic opacity-80">
                                  “{transcript}”
                                </div>
                              )}
                            </>
                          ) : legacyVoice ? (
                            <div className="flex items-start gap-2">
                              <span className="text-xl">🎙</span>
                              <span className="min-w-0">
                                <span className="block text-xs font-medium opacity-90">Voice message</span>
                                <span className="block whitespace-pre-wrap break-words text-xs italic opacity-80">“{transcript}”</span>
                              </span>
                            </div>
                          ) : legacyMedia ? (
                            <div className="flex items-start gap-2">
                              <span className="text-2xl">
                                {legacyMedia.kind === "video" ? "🎥" : legacyMedia.kind === "bundle" ? "🎁" : "📷"}
                              </span>
                              <span className="min-w-0">
                                <span className="flex items-center gap-1.5">
                                  <span className="text-xs font-medium capitalize">
                                    {legacyMedia.bundleName ?? legacyMedia.kind}
                                  </span>
                                  {legacyMedia.paid ? (
                                    <span className="shrink-0 rounded-full bg-love-tint px-1.5 py-0.5 text-[10px] font-semibold text-love-ink">
                                      PAID {legacyMedia.stars}★
                                    </span>
                                  ) : (
                                    <span className={"shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium " + (fan ? "bg-muted/15 text-muted" : "bg-white/20 text-white/90")}>
                                      FREE
                                    </span>
                                  )}
                                </span>
                                {legacyMedia.caption && (
                                  <span className="block whitespace-pre-wrap break-words text-xs italic opacity-80">{legacyMedia.caption}</span>
                                )}
                              </span>
                            </div>
                          ) : isMedia ? (
                            <>
                              {info!.thumbUrl &&
                                (meta!.type === "video" ? (
                                  <video
                                    src={info!.thumbUrl}
                                    muted
                                    playsInline
                                    preload="metadata"
                                    className="h-44 w-52 max-w-full rounded-lg object-cover"
                                  />
                                ) : (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={info!.thumbUrl}
                                    alt={info!.name}
                                    className="h-44 w-52 max-w-full rounded-lg object-cover"
                                  />
                                ))}
                              <div className="mt-1.5 flex items-center gap-1.5">
                                <span className="min-w-0 truncate text-xs font-medium">
                                  {info!.name}
                                  {meta!.type === "bundle" && meta!.count ? ` · ${meta!.count} pics` : ""}
                                </span>
                                {meta!.paid ? (
                                  <span className="shrink-0 rounded-full bg-love-tint px-1.5 py-0.5 text-[10px] font-semibold text-love-ink">
                                    PAID {meta!.stars ?? 0}★
                                  </span>
                                ) : (
                                  <span
                                    className={
                                      "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium " +
                                      (fan ? "bg-muted/15 text-muted" : "bg-white/20 text-white/90")
                                    }
                                  >
                                    FREE
                                  </span>
                                )}
                              </div>
                              {caption && (
                                <div className="mt-0.5 whitespace-pre-wrap break-words text-xs italic opacity-80">{caption}</div>
                              )}
                            </>
                          ) : (
                            <div className="whitespace-pre-wrap break-words">{m.content}</div>
                          )}
                          <div className={"mt-0.5 text-right text-[10px] " + (fan ? "text-muted" : "text-white/70")}>
                            {dateTime(m.created_at)}
                          </div>
                        </div>
                      </div>
                    );
                  })
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
            <div className="flex flex-col gap-5">
              <div>
                {/* Who this panel is about - name up top, same as the chat header. */}
                <div className="mb-2.5 flex items-center gap-2.5">
                  <FanAvatar
                    cloneId={selected.clone_id}
                    telegramId={selected.telegram_id}
                    name={displayName(selected)}
                    className="h-9 w-9 text-xs"
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
                      Blocked (safety)
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
                        {fmtNum(selected.message_credits)}
                      </span>
                    ),
                  },
                  { label: "Total spent", value: totalSpent > 0 ? <StarAmount stars={totalSpent} /> : "-" },
                  { label: "Purchases", value: fmtNum(purchases.length) },
                  { label: "Msgs sent", value: fmtNum(selected.total_messages_sent ?? 0) },
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
                      <dd className="text-right font-medium text-ink">{v ?? "-"}</dd>
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
                  {/* Campaign position and last route, the same two facts the
                      fan-list chips show, spelled out here. */}
                  {(selectedJourney?.campaignStep ?? 0) > 0 && (selectedJourney?.campaignSteps.length ?? 0) > 0 && (
                    <span
                      className="rounded-full bg-purple-500/15 px-2 py-0.5 text-[10px] font-medium text-purple-400"
                      title={`Automated campaign: ${selectedJourney!.campaignStep} of ${selectedJourney!.campaignSteps.length} steps sent this quiet episode. Resets to 0 the moment he messages.${selectedJourney!.campaignEnabled ? "" : " The campaign is currently OFF for this clone."}`}
                    >
                      💧 drip {selectedJourney!.campaignStep}/{selectedJourney!.campaignSteps.length}
                    </span>
                  )}
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
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Credits</div>
                <form action={setCredits} className="flex items-center gap-2">
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
                </form>
              </div>

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
                <div className="flex flex-col gap-3">
                  <div className="rounded-lg border border-line bg-bg/60 p-2.5">
                    <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.14em] text-muted">
                      Profile summary
                    </div>
                    <p className={`text-xs leading-relaxed ${profile?.summary?.trim() ? "text-ink" : "italic text-muted"}`}>
                      {profile?.summary?.trim() || "Not learned yet"}
                    </p>
                  </div>

                  {[
                    { title: "Personal details", rows: personalProfileCategories },
                    { title: "Context & preferences", rows: contextProfileCategories },
                  ].map((group) => (
                    <div key={group.title}>
                      <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-accent">
                        {group.title}
                      </div>
                      <dl className="overflow-hidden rounded-lg border border-line bg-bg/45">
                        {group.rows.map((item) => (
                          <div
                            key={item.label}
                            className="grid grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)] gap-2 border-b border-line/70 px-2.5 py-2 last:border-b-0"
                          >
                            <dt className="text-[10px] font-semibold leading-snug text-muted">{item.label}</dt>
                            <dd
                              className={`text-right text-[11px] leading-snug ${item.value ? "font-medium text-ink" : "italic text-muted/70"}`}
                            >
                              {item.value || "Not learned yet"}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ))}

                  {uncategorizedProfileDetails.length > 0 && (
                    <div>
                      <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-accent">
                        Other details
                      </div>
                      <dl className="overflow-hidden rounded-lg border border-line bg-bg/45">
                        {uncategorizedProfileDetails.map(([key, value]) => (
                          <div
                            key={key}
                            className="grid grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)] gap-2 border-b border-line/70 px-2.5 py-2 last:border-b-0"
                          >
                            <dt className="text-[10px] font-semibold leading-snug text-muted">{prettyKey(key)}</dt>
                            <dd className="text-right text-[11px] font-medium leading-snug text-ink">
                              {profileValueText(value)}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  )}

                  <p className="text-[9px] leading-relaxed text-muted/75">
                    Sensitive details are shown only when the fan states them directly; they are never inferred.
                  </p>
                </div>
              </div>

              {/* Purchases */}
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Purchases {purchases.length > 0 && `(${purchases.length})`}
                </div>
                {purchases.length === 0 ? (
                  <div className="text-xs text-muted">None yet.</div>
                ) : (
                  <div className="flex flex-col divide-y divide-line">
                    {purchases.map((p, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 py-1.5 text-xs">
                        <span className="text-muted">
                          {p.kind === "credits" ? "messages" : p.kind} · {dateTime(p.paid_at)}
                        </span>
                        <span className="font-mono text-ink">
                          <StarAmount stars={p.amount_stars} />
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Manual fan takeover (migration 096) - only once this fan is
                  paused (see the Pause/Resume control below), an operator can
                  compose a text, a generated voice note, or an existing FREE
                  photo and send it as her. See ManualTakeover.tsx +
                  bot/src/manual-send.ts for the full mechanism. */}
              {selected.paused && (
                <ManualTakeover userId={selected.id} freePhotos={freePhotos} />
              )}

              {/* Controls - the destructive/rare ops, tucked away but all here */}
              <details className="mt-auto rounded-md border border-line bg-bg">
                <summary className="cursor-pointer select-none px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted hover:text-ink">
                  Controls
                </summary>
                <div className="flex flex-col gap-1.5 border-t border-line p-2.5">
                  <form action={setCredits}>
                    <input type="hidden" name="userId" value={selected.id} />
                    <input type="hidden" name="credits" value="0" />
                    <ConfirmSubmit
                      message="Set this fan's message credits to 0?"
                      className="w-full rounded-md border border-line px-3 py-1.5 text-left text-xs text-ink transition hover:bg-elev"
                    >
                      Reset credits to 0
                    </ConfirmSubmit>
                  </form>

                  <form action={resetCounters}>
                    <input type="hidden" name="userId" value={selected.id} />
                    <ConfirmSubmit
                      message="Reset lifetime counters (messages sent + bought) to 0? This does not change credits or purchase history."
                      className="w-full rounded-md border border-line px-3 py-1.5 text-left text-xs text-ink transition hover:bg-elev"
                    >
                      Reset counters
                    </ConfirmSubmit>
                  </form>

                  <form action={toggleActive}>
                    <input type="hidden" name="userId" value={selected.id} />
                    <input type="hidden" name="active" value={selected.is_active ? "false" : "true"} />
                    <button
                      type="submit"
                      className="w-full rounded-md border border-line px-3 py-1.5 text-left text-xs text-ink transition hover:bg-elev"
                    >
                      {selected.is_active ? "Mark inactive" : "Mark active"}
                    </button>
                  </form>

                  <form action={setBlocked}>
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
                  </form>

                  {/* Only rendered for an actually-gated fan. There is no reason
                      to offer "clear the minor gate" on a fan who does not have
                      one, and an always-visible button invites a misclick on the
                      single safety verdict with a real-world cost if reversed. */}
                  {(!!selected.minor_flagged_at || selected.blocked_reason === "minor") && (
                    <form action={clearMinorFlag}>
                      <input type="hidden" name="userId" value={selected.id} />
                      <ConfirmSubmit
                        message="Clear the minor gate for this fan? Only do this if you have READ THE CONVERSATION and are satisfied he is an adult who was flagged by mistake. This restores all photos, videos, bundles and voice notes for him permanently."
                        className="w-full rounded-md border border-crit/40 px-3 py-1.5 text-left text-xs text-crit transition hover:bg-crit/10"
                      >
                        Clear minor gate
                      </ConfirmSubmit>
                    </form>
                  )}

                  {/* users.paused - pauses just this one fan (no replies, no drip)
                      without blocking him and without touching the clone's own
                      Active/Paused status. */}
                  <form action={setPaused}>
                    <input type="hidden" name="userId" value={selected.id} />
                    <input type="hidden" name="paused" value={selected.paused ? "false" : "true"} />
                    <ConfirmSubmit
                      message={
                        selected.paused
                          ? "Resume this fan? The bot will reply to him and resume drip again."
                          : "Pause this fan? He gets no replies and no drip messages until resumed. He is not blocked, and no other fan is affected."
                      }
                      className="w-full rounded-md border border-line px-3 py-1.5 text-left text-xs text-ink transition hover:bg-elev"
                    >
                      {selected.paused ? "Resume this fan" : "Pause this fan"}
                    </ConfirmSubmit>
                  </form>

                  <form action={deleteUser}>
                    <input type="hidden" name="userId" value={selected.id} />
                    <input type="hidden" name="cloneId" value={selected.clone_id} />
                    <input type="hidden" name="telegramId" value={selected.telegram_id} />
                    <ConfirmSubmit
                      message={`Permanently delete ${displayName(selected)}? This removes the user, their purchase records and entire chat history. This cannot be undone.`}
                      className="w-full rounded-md border border-crit/30 bg-crit/10 px-3 py-1.5 text-left text-xs font-medium text-crit transition hover:bg-crit/20"
                    >
                      Delete user
                    </ConfirmSubmit>
                  </form>
                </div>
              </details>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
