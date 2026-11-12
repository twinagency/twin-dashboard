/** Campaign fixtures for CampaignManager tests (W3 ui-onlyfans-preview-1). Synthetic ids only; shapes pass lib/onlyfans/campaigns.ts parsers. */
import { CAMPAIGN_SCHEMA, RECIPIENT_STATUSES } from "../../lib/onlyfans/campaigns";
import type { Call } from "./w3-preview1-dom";
import { json, routeFailure } from "./w3-preview1-dom";

export const OTHER = "of-b";
export const CAMPAIGN = "0a1b2c3d-1111-4222-8333-444455556661";
const at = "2026-11-01T10:00:00.000Z";
export const campaign = (accountId: string, campaignId = CAMPAIGN) => ({
  campaignId, accountId, name: "Running campaign", body: "Already queued text", audience: { kind: "explicit", count: 2, snapshotHash: "a".repeat(64) },
  scheduledAt: at, createdAt: at, updatedAt: at, status: "running", revision: 3,
  counts: Object.fromEntries(RECIPIENT_STATUSES.map(name => [name, name === "pending" ? 2 : 0])), recipientCount: 2, deliveryMode: "individual_messages",
  reporting: { replies: null, replyWindowHours: 24, purchases: null, refundedPurchases: null, revenueCents: null, currency: null, ledgerAsOf: null, revenueStatus: "ledger_unavailable" },
  offer: null,
});
export const recipients = (accountId: string) => [1, 2].map(n => ({ conversationId: `${accountId}:${n}`, status: "pending", reason: null, intentId: null, providerMessageId: null, updatedAt: at }));
export type Item = { itemId: string; readiness: "disabled" | "free_teaser" | "needs_review" | "terms_checked"; priceCents: number | null; label: string };
const workspace = (accountId: string, items: Item[]) => ({ schemaVersion: "of-workspace.v2", section: "content", accountId, asOf: at, lastCompleteSyncAt: null,
  historyRecoveryRequired: false, providerConnectionVerified: true, nextCursor: null,
  items: items.map(item => ({ ...item, kind: "bundle", description: "", descriptionTruncated: false, mediaCount: 1, previewCount: 0, currency: "USD", updatedAt: null })) });

/**
 * Answers every campaign-page read for any account. `create` answers the create POST, `change` a pause/resume/cancel POST.
 * The list holds one running campaign when `withCampaign`.
 */
export function campaignBackend(opts: { create?: (call: Call, n: number) => Response | Promise<Response>; change?: (call: Call) => Response; withCampaign?: boolean; items?: Item[] }) {
  let creates = 0;
  return (call: Call): Response | Promise<Response> => {
    const m = /^\/api\/onlyfans-campaigns\/accounts\/([^/]+)\/campaigns(?:\/([^/?]+))?/.exec(call.url);
    const content = /^\/api\/onlyfans\/accounts\/([^/]+)\/workspace\/content/.exec(call.url);
    const conversations = /^\/api\/onlyfans\/accounts\/([^/]+)\/conversations/.exec(call.url);
    if (content) return json({ workspace: workspace(decodeURIComponent(content[1]), opts.items ?? []) });
    if (conversations) return json({ page: { items: [], nextCursor: null } });
    if (!m) return new Response(null, { status: 404 });
    const accountId = decodeURIComponent(m[1]), id = m[2] && decodeURIComponent(m[2]);
    if (call.method === "POST") {
      if (id) return opts.change ? opts.change(call) : routeFailure(503, "unconfirmed");
      return opts.create ? opts.create(call, creates++) : routeFailure(503, "unconfirmed");
    }
    const list = opts.withCampaign ? [campaign(accountId)] : [];
    if (id) return json({ schemaVersion: CAMPAIGN_SCHEMA, ok: true, accountId, campaign: campaign(accountId, id), recipients: recipients(accountId) });
    return json({ schemaVersion: CAMPAIGN_SCHEMA, ok: true, accountId, campaigns: list, truncated: false });
  };
}
export const createAck = (accountId: string) => json({ schemaVersion: CAMPAIGN_SCHEMA, ok: true, commandKey: "c".repeat(64), accountId, campaignId: "0a1b2c3d-1111-4222-8333-444455556699", recordedRevision: 1 });
/** The route's own failure shape (lib/onlyfans/campaign-route.ts campaignRefuse) with outcome "unconfirmed" on a 503. */
export const unconfirmed503 = () => routeFailure(503, "unconfirmed", { schemaVersion: CAMPAIGN_SCHEMA });
export const SENDER = { creatorName: "Fixture Creator", handle: "fixture" };
export const createPosts = (calls: Call[]) => calls.filter(call => call.method === "POST" && /\/campaigns$/.test(call.url));
