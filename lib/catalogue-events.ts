import type { SupabaseClient } from "@supabase/supabase-js";

// Owner/test accounts (memory: rcy07 = 6814483810) are still logged, just
// flagged, so funnel numbers can exclude them without losing the row.
export const TEST_TELEGRAM_IDS = new Set<number>([6814483810, 6322723817]);

// Events the client may report through the 'event' action. 'open' is logged
// server-side when 'catalogue' loads; pay_success/pay_fail are written where
// the server itself confirms or rejects a payment. Never let the client claim
// either of those two, or amounts.
export const CLIENT_EVENT_NAMES = [
  "view_item",
  "view_bundle",
  "tap_pay_stars",
  "tap_pay_ton",
  "wallet_connected",
  "pay_cancel",
] as const;
export type ClientEventName = (typeof CLIENT_EVENT_NAMES)[number];

export const ALL_EVENT_NAMES = [
  "open",
  "view_item",
  "view_bundle",
  "tap_pay_stars",
  "tap_pay_ton",
  "wallet_connected",
  "pay_success",
  "pay_cancel",
  "pay_fail",
] as const;
export type CatalogueEventName = (typeof ALL_EVENT_NAMES)[number];

export function isClientEventName(value: unknown): value is ClientEventName {
  return typeof value === "string" && (CLIENT_EVENT_NAMES as readonly string[]).includes(value);
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validEventUuid(value: unknown): value is string {
  return typeof value === "string" && uuid.test(value);
}

const MEDIA_TYPES = ["photo", "video", "bundle"] as const;
export function validEventMediaType(value: unknown): value is (typeof MEDIA_TYPES)[number] {
  return typeof value === "string" && (MEDIA_TYPES as readonly string[]).includes(value);
}

export function validEventRail(value: unknown): value is "stars" | "ton" {
  return value === "stars" || value === "ton";
}

export type LogEventInput = {
  cloneId: string;
  telegramId?: number | null;
  event: CatalogueEventName;
  rail?: "stars" | "ton" | null;
  mediaType?: "photo" | "video" | "bundle" | null;
  mediaId?: string | null;
  startParam?: string | null;
  amountStars?: number | null;
  amountNanoton?: number | null;
  detail?: Record<string, unknown> | null;
};

// Funnel logging must never break the catalogue for a fan, so this never throws.
export async function logCatalogueEvent(db: SupabaseClient, input: LogEventInput): Promise<void> {
  try {
    const test = typeof input.telegramId === "number" && TEST_TELEGRAM_IDS.has(input.telegramId);
    const detail = test ? { ...(input.detail ?? {}), test: true } : input.detail ?? null;
    await db.from("catalogue_events").insert({
      clone_id: input.cloneId,
      telegram_id: input.telegramId ?? null,
      event: input.event,
      rail: input.rail ?? null,
      media_type: input.mediaType ?? null,
      media_id: input.mediaId ?? null,
      start_param: input.startParam ?? null,
      amount_stars: input.amountStars ?? null,
      amount_nanoton: input.amountNanoton ?? null,
      detail,
    });
  } catch {
    /* logging must never block the catalogue */
  }
}

// Guards a payment-confirmation event against firing twice for the same order
// across repeated status polls. The order id lives in detail.order_id.
export async function catalogueEventLoggedForOrder(
  db: SupabaseClient,
  cloneId: string,
  event: CatalogueEventName,
  orderId: string,
): Promise<boolean> {
  try {
    const { data } = await db
      .from("catalogue_events")
      .select("id")
      .eq("clone_id", cloneId)
      .eq("event", event)
      .contains("detail", { order_id: orderId })
      .limit(1);
    return !!data?.length;
  } catch {
    return false;
  }
}
