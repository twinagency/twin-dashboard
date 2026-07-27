import { supabaseAdmin } from "@/lib/supabase";
import { getCloneScope } from "@/lib/clone-scope";
import { setCloneScope } from "@/app/actions/clone-scope";
import DripForm from "./DripForm";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

// Campaigns: win quiet fans back on autopilot. The automated campaign is a list
// of timed steps that fire while a fan goes quiet, always inside Telegram's
// hard 24h messaging window (a business bot can only message a fan within 24h
// of his last activity). "All clones" is a read-only summary with a link into
// each bot's editor; scoped to one clone it's the full step builder.
export default async function CampaignsPage() {
  const cloneId = await getCloneScope();
  if (cloneId) return <CloneCampaigns cloneId={cloneId} />;
  return <FleetCampaigns />;
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
  type: "text" | "voice" | "photo" | "video" | "bundle" | "collect" | "tease";
  after_messages: number;
  media_id?: string;
  free?: boolean;
  collect_field?: string;
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

async function FleetCampaigns() {
  const { data } = await supabaseAdmin
    .from("clones")
    .select("*")
    .order("created_at", { ascending: true });
  const rows = (data ?? []) as FleetRow[];
  const enabledCount = rows.filter((r) => r.drip_enabled).length;

  return (
    <div className="text-ink">
      <h1 className="mb-1 text-2xl font-semibold">Campaigns</h1>
      <p className="mb-5 max-w-2xl text-sm text-muted">
        Automated re-engagement for fans who've gone quiet: a list of timed steps that fires on
        each clone's own schedule, always inside Telegram's 24h messaging window.
      </p>

      <div className="mb-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs text-muted">Clones</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums">{rows.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted">Campaign on</div>
          <div className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${enabledCount > 0 ? "text-good" : ""}`}>{enabledCount}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted">Campaign off</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums">{rows.length - enabledCount}</div>
        </Card>
      </div>

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bot</TableHead>
              <TableHead>Campaign</TableHead>
              <TableHead className="text-right">Steps</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => {
              const steps = validSteps(c.drip_steps);
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name} <span className="text-muted">/ {c.slug}</span></TableCell>
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
              <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted">No clones yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

async function CloneCampaigns({ cloneId }: { cloneId: string }) {
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
  if (!cloneRes.data) return <div className="text-muted">Clone not found.</div>;

  const clone = cloneRes.data as {
    id: string;
    name: string;
    photos_enabled: boolean;
    videos_enabled: boolean;
    bundles_enabled: boolean;
    drip_enabled: boolean;
    winback_lapse_days: number;
    drip_media_ids: { type: "photo" | "video" | "bundle"; id: string }[] | null;
    // absent pre-migration-029, so read defensively
    drip_steps?: unknown[] | null;
    // absent pre-migration-068, so read defensively
    onboarding_steps?: unknown[] | null;
    // Onboarding + follow-up, moved off Configure's Engagement tab.
    welcome_instruction: string | null;
    welcome_bundle_after: number | null;
    welcome_bundle_after_minutes: number | null;
    welcome_bundle_teased: boolean | null;
    onboarding_voice_after: number | null;
    onboarding_voice_instruction: string | null;
    onboarding_collect_fields: unknown;
    onboarding_length: number | null;
    followup_after_minutes: number | null;
  };

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="mb-1 text-2xl font-semibold">Campaigns · {clone.name}</h1>
          <p className="max-w-2xl text-sm text-muted">
            Automated re-engagement steps that fire while {clone.name} goes quiet, always timed
            inside Telegram's 24h messaging window.
          </p>
        </div>
        <form action={setCloneScope.bind(null, null)} className="shrink-0">
          <Button type="submit" variant="ghost" size="sm">← All bots</Button>
        </form>
      </div>

      <DripForm
        cloneId={cloneId}
        photosEnabled={!!clone.photos_enabled}
        videosEnabled={!!clone.videos_enabled}
        bundlesEnabled={!!clone.bundles_enabled}
        photos={(photosRes.data ?? []) as MediaRow[]}
        videos={(videosRes.data ?? []) as MediaRow[]}
        bundles={(bundlesRes.data ?? []) as BundleRow[]}
        initial={{
          enabled: clone.drip_enabled ?? true,
          steps: validSteps(clone.drip_steps).map((s) => ({
            type: s.type,
            afterHours: s.after_hours,
            mediaId: typeof s.media_id === "string" && s.media_id.trim() ? s.media_id.trim() : null,
          })),
          // Onboarding (trimmed to two triggers) + follow-up.
          welcomeInstruction: clone.welcome_instruction ?? null,
          welcomeBundleAfter: clone.welcome_bundle_after ?? 10,
          welcomeBundleTeased: clone.welcome_bundle_teased ?? false,
          onboardingVoiceAfter: clone.onboarding_voice_after ?? null,
          onboardingCollectFields: Array.isArray(clone.onboarding_collect_fields)
            ? (clone.onboarding_collect_fields as unknown[]).filter((s): s is string => typeof s === "string")
            : [],
          onboardingLength: clone.onboarding_length ?? 8,
          followupAfterMinutes: clone.followup_after_minutes ?? 0,
          // Ordered onboarding step list (migration 068) — see validOnboardingSteps above.
          onboardingSteps: validOnboardingSteps(clone.onboarding_steps).map((s) => ({
            type: s.type,
            afterMessages: s.after_messages,
            mediaId: typeof s.media_id === "string" && s.media_id.trim() ? s.media_id.trim() : null,
            free: s.free === true,
            collectField: typeof s.collect_field === "string" && s.collect_field.trim() ? s.collect_field.trim() : null,
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
