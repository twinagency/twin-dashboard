export const INTENT_OFFER_EVENT_TYPES = ["attempted", "blocked", "delivered", "purchased"] as const;
export const INTENT_OFFER_VARIANTS = ["v2", "control"] as const;

export type IntentOfferEventType = (typeof INTENT_OFFER_EVENT_TYPES)[number];
export type IntentOfferVariant = (typeof INTENT_OFFER_VARIANTS)[number];

export type IntentOfferEventRow = {
  id: string;
  attempt_id: string;
  clone_id: string;
  event_type: IntentOfferEventType;
  variant: IntentOfferVariant;
  price_stars: number | null;
  block_reason: string | null;
  created_at: string;
};

export type IntentExperimentAssignmentRow = {
  clone_id: string;
  user_id: string;
  variant: IntentOfferVariant;
  assigned_at: string;
};

export type IntentOfferVariantSummary = {
  variant: IntentOfferVariant;
  attempted: number;
  blocked: number;
  delivered: number;
  purchased: number;
  deliveryRate: number | null;
  purchaseRate: number | null;
  stars: number;
  blockReasons: { reason: string; count: number }[];
};

export function countIntentExperimentAssignments(
  assignments: readonly IntentExperimentAssignmentRow[],
  variant: IntentOfferVariant,
): number {
  return new Set(
    assignments
      .filter((assignment) => assignment.variant === variant)
      .map((assignment) => `${assignment.clone_id}:${assignment.user_id}`),
  ).size;
}

function positiveStars(value: number | null): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

/**
 * Roll up the append-only lifecycle ledger. Counts are distinct per
 * attempt/event stage so a retried write cannot inflate the visible funnel.
 * Purchase rate is purchases / actually delivered offers; delivery rate is
 * delivered / attempts. Stars only come from purchased rows.
 */
export function summarizeIntentOfferEvents(
  events: readonly IntentOfferEventRow[],
  variant: IntentOfferVariant,
): IntentOfferVariantSummary {
  const byType = new Map<IntentOfferEventType, Set<string>>(
    INTENT_OFFER_EVENT_TYPES.map((type) => [type, new Set<string>()]),
  );
  const blockReasons = new Map<string, Set<string>>();
  let stars = 0;

  for (const event of events) {
    if (event.variant !== variant || !INTENT_OFFER_EVENT_TYPES.includes(event.event_type)) continue;
    const stageAttempts = byType.get(event.event_type)!;
    const duplicate = stageAttempts.has(event.attempt_id);
    stageAttempts.add(event.attempt_id);

    if (event.event_type === "purchased" && !duplicate) stars += positiveStars(event.price_stars);
    if (event.event_type === "blocked" && !duplicate) {
      const reason = event.block_reason?.trim() || "unspecified";
      const attempts = blockReasons.get(reason) ?? new Set<string>();
      attempts.add(event.attempt_id);
      blockReasons.set(reason, attempts);
    }
  }

  const attempted = byType.get("attempted")!.size;
  const blocked = byType.get("blocked")!.size;
  const delivered = byType.get("delivered")!.size;
  const purchased = byType.get("purchased")!.size;

  return {
    variant,
    attempted,
    blocked,
    delivered,
    purchased,
    deliveryRate: attempted > 0 ? (delivered / attempted) * 100 : null,
    purchaseRate: delivered > 0 ? (purchased / delivered) * 100 : null,
    stars,
    blockReasons: [...blockReasons.entries()]
      .map(([reason, attempts]) => ({ reason, count: attempts.size }))
      .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
  };
}
