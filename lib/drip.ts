// The drip ("campaign") step list, in ONE place.
//
// Mirrors mapClone's campaignSteps in bot/src/data/supabase-store.ts: a row
// without a type the runtime knows, or an OLD-shape row ({type,text} with no
// valid after_hours), is dropped exactly as the runtime drops it. Sorted by
// after_hours because that is the order bot/src/campaign.ts walks, and
// users.campaign_step indexes into THAT list, not into raw jsonb order.
//
// This used to live inline in app/users/page.tsx. It moved here when the live
// feed (app/api/users/live) needed the same list server side: two copies of a
// filter this fiddly would have drifted, and a drift here means the dashboard
// tells the operator a different step number than the bot will actually send.

export type CampaignStepRow = { type: "text" | "voice" | "photo" | "video" | "bundle"; after_hours: number };

const CAMPAIGN_STEP_TYPES = ["text", "voice", "photo", "video", "bundle"];

export function campaignStepsOf(raw: unknown[] | null | undefined): CampaignStepRow[] {
  return (Array.isArray(raw) ? raw : [])
    .filter((s): s is { type: string; after_hours?: unknown } => !!s && typeof s === "object" && "type" in s)
    .filter((s) => CAMPAIGN_STEP_TYPES.includes(s.type))
    .map((s) => ({ type: s.type as CampaignStepRow["type"], after_hours: Number(s.after_hours) }))
    .filter((s) => Number.isFinite(s.after_hours) && s.after_hours >= 1 && s.after_hours <= 23)
    .sort((a, b) => a.after_hours - b.after_hours);
}

// When the NEXT drip step is due for a fan, or null when there is no next step.
//
// campaign.ts measures every step from the fan's last inbound message, not from
// the previous step, so this is last_message_received + that step's after_hours
// and NOT a running total. campaign_step counts how many have fired in the
// fan's current quiet episode, so it indexes straight into the sorted list.
export function nextDripDueAt(
  steps: CampaignStepRow[],
  campaignStep: number,
  lastMessageReceived: string | null,
): { at: string; step: CampaignStepRow; index: number } | null {
  const step = steps[campaignStep];
  if (!step || !lastMessageReceived) return null;
  const base = new Date(lastMessageReceived).getTime();
  if (!Number.isFinite(base)) return null;
  return { at: new Date(base + step.after_hours * 3600_000).toISOString(), step, index: campaignStep };
}

// "in 3h", "in 12m", "due now". Deliberately coarse: this is a status strip,
// not a countdown, and a per-second tick would re-render the fan list forever.
export function untilLabel(iso: string | null, now = Date.now()): string {
  if (!iso) return "-";
  const ms = new Date(iso).getTime() - now;
  if (!Number.isFinite(ms)) return "-";
  if (ms <= 0) return "due now";
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem ? `in ${hours}h ${rem}m` : `in ${hours}h`;
}
