import { supabaseAdmin } from "@/lib/supabase";
import { getCloneScope } from "@/lib/clone-scope";
import { setCloneScope } from "@/app/actions/clone-scope";
import FlowsForm from "./FlowsForm";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Info } from "@/components/clone/fields";

export const dynamic = "force-dynamic";

// Flows: win quiet fans back on autopilot. The automated flow is a list
// of timed steps that fire while a fan goes quiet, always inside Telegram's
// hard 24h messaging window (a business bot can only message a fan within 24h
// of his last activity). "All clones" is a read-only summary with a link into
// each bot's editor; scoped to one clone it's the full step builder.
//
// Route renamed from /drip to /flows 2026-07-29 (operator decision, with a
// redirect at app/drip/page.tsx so old links/bookmarks don't 404). DB columns
// stay drip_* (additive-only convention) — only the URL and visible copy moved.
export default async function FlowsPage() {
  const cloneId = await getCloneScope();
  if (cloneId) return <CloneFlows cloneId={cloneId} />;
  return <FleetFlows />;
}

// Valid timed steps only (new shape [{type, after_hours}], migration 031's
// model on the drip_steps column). Old-shape rows without a valid hour offset
// don't count; the runtime drops them too.
const STEP_TYPES = ["text", "voice", "photo", "video", "bundle"];
function validSteps(
  raw: unknown,
): { type: "text" | "voice" | "photo" | "video" | "bundle"; after_hours: number; media_id?: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s: any) => {
    if (!s || typeof s !== "object" || !STEP_TYPES.includes(s.type)) return false;
    const h = Number(s.after_hours);
    return Number.isFinite(h) && h >= 1 && h <= 23;
  });
}

// Valid onboarding steps (migration 068 model [{type, after_messages, ...}]).
// Same defensive-read pattern as validSteps above, message-count bound 1-50.
const ONBOARDING_STEP_TYPES = ["text", "voice", "photo", "video", "bundle", "collect", "tease"];
function validOnboardingSteps(raw: unknown): {
  id?: string;
  type: "text" | "voice" | "photo" | "video" | "bundle" | "collect" | "tease";
  after_messages: number;
  media_id?: string;
  free?: boolean;
  collect_field?: string;
  instruction?: string;
  condition?: "none" | "agreed";
  condition_within_messages?: number;
  condition_lapse?: "send" | "skip";
}[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s: any) => {
    if (!s || typeof s !== "object" || !ONBOARDING_STEP_TYPES.includes(s.type)) return false;
    const n = Number(s.after_messages);
    return Number.isFinite(n) && n >= 1 && n <= 50;
  });
}

type FleetRow = {
  id: string;
  name: string;
  slug: string;
  drip_enabled: boolean | null;
  winback_lapse_days: number | null;
  // absent pre-migration-029, so read defensively
  drip_steps?: unknown[] | null;
};

async function FleetFlows() {
  const { data } = await supabaseAdmin
    .from("clones")
    .select("*")
    .order("created_at", { ascending: true });
  const rows = (data ?? []) as FleetRow[];
  const enabledCount = rows.filter((r) => r.drip_enabled).length;

  return (
    <div className="dashboard-page text-ink">
      <h1 className="mb-1 flex items-center gap-1.5 text-2xl font-semibold">
        Flows
        <Info
          className="text-xs"
          text="Automated re-engagement for fans who've gone quiet: a list of timed steps that fires on each creator's own schedule, always inside Telegram's 24h messaging window."
        />
      </h1>

      <div className="mb-5 mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs text-muted">Creators</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums">{rows.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted">Flow on</div>
          <div className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${enabledCount > 0 ? "text-good" : ""}`}>{enabledCount}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted">Flow off</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums">{rows.length - enabledCount}</div>
        </Card>
      </div>

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bot</TableHead>
              <TableHead>Flow</TableHead>
              <TableHead className="text-right">Steps</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => {
              const steps = validSteps(c.drip_steps);
              return (
                <TableRow key={c.id}>
                  <TableCell className="creator-name font-medium">{c.name} <span className="text-muted">/ {c.slug}</span></TableCell>
                  <TableCell>
                    <Badge variant="outline" className={c.drip_enabled ? "border-good/30 text-good" : "text-muted"}>{c.drip_enabled ? "on" : "off"}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{steps.length}</TableCell>
                  <TableCell className="text-right">
                    <form action={setCloneScope.bind(null, c.id)}>
                      <Button type="submit" variant="link" size="sm" className="h-auto p-0 text-accent">Manage →</Button>
                    </form>
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted">No creators yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

async function CloneFlows({ cloneId }: { cloneId: string }) {
  const [cloneRes, photosRes, videosRes, bundlesRes] = await Promise.all([
    supabaseAdmin.from("clones").select("*").eq("id", cloneId).maybeSingle(),
    supabaseAdmin
      .from("photos")
      .select("id,storage_path,caption,teaser_caption,star_value,is_free")
      .eq("clone_id", cloneId)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("videos")
      .select("id,storage_path,caption,teaser_caption,star_value,is_free")
      .eq("clone_id", cloneId)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("photo_bundles")
      .select("id,name,caption,star_price,photo_bundle_items(id,storage_path,sort_order)")
      .eq("clone_id", cloneId)
      .order("created_at", { ascending: true }),
  ]);

  if (cloneRes.error) throw new Error(cloneRes.error.message);
  if (!cloneRes.data) return <div className="text-muted">Creator not found.</div>;

  const clone = cloneRes.data as {
    id: string;
    name: string;
    photos_enabled: boolean;
    videos_enabled: boolean;
    bundles_enabled: boolean;
    drip_enabled: boolean;
    winback_lapse_days: number | null;
    drip_media_ids: { type: "photo" | "video" | "bundle"; id: string }[] | null;
    // absent pre-migration-029, so read defensively
    drip_steps?: unknown[] | null;
    // absent pre-migration-068, so read defensively
    onboarding_steps?: unknown[] | null;
    // Onboarding greeting steer + free-preview fallback (migration 069). The
    // legacy loose onboarding fields were retired 2026-07-28.
    welcome_instruction: string | null;
    onboarding_free_preview_enabled?: boolean | null;
    onboarding_free_preview_after_minutes?: number | null;
    onboarding_free_preview_after_messages?: number | null;
    onboarding_free_preview_media_id?: string | null;
    onboarding_free_preview_instruction?: string | null;
    followup_after_minutes: number | null;
    // Per-flow caption kill switch (migration 071) — absent pre-migration, so read defensively.
    onboarding_captions_off?: boolean | null;
    campaign_captions_off?: boolean | null;
    // Funnel engine + its two dials (migration 130) — absent pre-migration, so
    // read defensively like every additive column above.
    funnel_policy?: string | null;
    intent_rejection_cooldown_messages?: number | null;
    intent_post_purchase_cooldown_minutes?: number | null;
    // Migration 131, the phase-2 trigger redesign.
    intent_natural_triggers?: boolean | null;
    intent_direct_purchase_override?: boolean | null;
    intent_fallback_offer_after_messages?: number | null;
    intent_max_ignored_offers?: number | null;
  };

  return (
    <div className="dashboard-page">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="mb-1 flex items-center gap-1.5 text-2xl font-semibold">
            Flows · <span className="creator-name">{clone.name}</span>
            <Info
              className="text-xs"
              // No clone name in here. Info renders a plain string, so there is
              // no element to hang .creator-name on, and privacy mode cannot
              // blur it. "She" says the same thing and leaks nothing.
              text="Automated re-engagement steps that fire while she goes quiet, always timed inside Telegram's 24h messaging window."
            />
          </h1>
        </div>
        <form action={setCloneScope.bind(null, null)} className="shrink-0">
          <Button type="submit" variant="ghost" size="sm">← All bots</Button>
        </form>
      </div>

      <FlowsForm
        cloneId={cloneId}
        photosEnabled={!!clone.photos_enabled}
        videosEnabled={!!clone.videos_enabled}
        bundlesEnabled={!!clone.bundles_enabled}
        photos={(photosRes.data ?? []) as MediaRow[]}
        videos={(videosRes.data ?? []) as MediaRow[]}
        bundles={(bundlesRes.data ?? []) as BundleRow[]}
        initial={{
          enabled: clone.drip_enabled ?? true,
          campaignCaptionsOff: clone.campaign_captions_off ?? false,
          onboardingCaptionsOff: clone.onboarding_captions_off ?? false,
          steps: validSteps(clone.drip_steps).map((s) => ({
            type: s.type,
            afterHours: s.after_hours,
            mediaId: typeof s.media_id === "string" && s.media_id.trim() ? s.media_id.trim() : null,
          })),
          // Onboarding greeting steer + free-preview fallback + follow-up.
          welcomeInstruction: clone.welcome_instruction ?? null,
          freePreviewEnabled: clone.onboarding_free_preview_enabled ?? false,
          freePreviewAfterMinutes: clone.onboarding_free_preview_after_minutes ?? null,
          freePreviewAfterMessages: clone.onboarding_free_preview_after_messages ?? null,
          freePreviewMediaId:
            typeof clone.onboarding_free_preview_media_id === "string" && clone.onboarding_free_preview_media_id.trim()
              ? clone.onboarding_free_preview_media_id.trim()
              : null,
          freePreviewInstruction: clone.onboarding_free_preview_instruction ?? null,
          followupAfterMinutes: clone.followup_after_minutes ?? 0,
          // NEW FLOWS (migration 130). Anything that is not the exact string
          // 'intent_v1' shows as Standard — the same direction funnelPolicyFor()
          // fails in the bot (bot/src/intent/state.ts), so the page can never
          // show a clone as switched over when the runtime reads it as legacy.
          // The two dial fallbacks are the migration's own DEFAULTs, so an
          // unset clone shows exactly what the runtime will do.
          funnelPolicy: clone.funnel_policy === "intent_v1" ? "intent_v1" : "legacy",
          intentRejectionCooldownMessages: clone.intent_rejection_cooldown_messages ?? 8,
          intentPostPurchaseCooldownMinutes: clone.intent_post_purchase_cooldown_minutes ?? 45,
          // Migration 131. Each fallback MUST equal the column DEFAULT or the
          // form renders one value, saves another, and the operator sees a
          // setting silently change itself.
          intentNaturalTriggers: clone.intent_natural_triggers ?? true,
          intentDirectPurchaseOverride: clone.intent_direct_purchase_override ?? true,
          intentFallbackOfferAfterMessages: clone.intent_fallback_offer_after_messages ?? 8,
          intentMaxIgnoredOffers: clone.intent_max_ignored_offers ?? 2,
          // Win-back lapse threshold, read for real by the bot as of 2026-07-29.
          // Falls back to 7 (the same fallback mapClone uses) so an unset clone
          // shows exactly what the runtime will do.
          winbackLapseDays: clone.winback_lapse_days ?? 7,
          // Ordered onboarding step list (migration 068) — see validOnboardingSteps above.
          onboardingSteps: validOnboardingSteps(clone.onboarding_steps).map((s) => ({
            // The stable id (migration 087) MUST round-trip through the form.
            // If it is dropped here the save mints a fresh one, every live fan
            // sees the step as brand new, and the desync bug is back.
            id: typeof s.id === "string" && s.id.trim() ? s.id.trim() : null,
            type: s.type,
            afterMessages: s.after_messages,
            mediaId: typeof s.media_id === "string" && s.media_id.trim() ? s.media_id.trim() : null,
            free: s.free === true,
            collectField: typeof s.collect_field === "string" && s.collect_field.trim() ? s.collect_field.trim() : null,
            instruction: typeof s.instruction === "string" && s.instruction.trim() ? s.instruction.trim() : null,
            condition: s.condition === "agreed" ? ("agreed" as const) : ("none" as const),
            conditionWithinMessages:
              Number.isFinite(Number(s.condition_within_messages)) && Number(s.condition_within_messages) >= 1
                ? Math.round(Number(s.condition_within_messages))
                : null,
            conditionLapse: s.condition_lapse === "skip" ? ("skip" as const) : ("send" as const),
          })),
        }}
      />
    </div>
  );
}

type MediaRow = {
  id: string;
  storage_path: string;
  caption: string | null;
  teaser_caption: string | null;
  star_value: number;
  is_free: boolean | null;
};

type BundleRow = {
  id: string;
  name: string;
  caption: string | null;
  star_price: number;
  photo_bundle_items: { id: string; storage_path: string; sort_order: number }[];
};
