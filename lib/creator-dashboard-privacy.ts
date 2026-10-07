type RevenuePayload = {
  recent: unknown[];
  analytics: {
    whaleFans: unknown[];
    topWeeklySpenders: unknown[];
  };
};

/**
 * Creator dashboards show aggregate performance without individual purchases
 * or buyer identities. Project after reading the shared revenue cache, without
 * mutating it or changing any aggregate revenue, count or conversion measure.
 */
export function withoutCreatorPurchaseHistory<T extends RevenuePayload>(payload: T, access: unknown): T {
  const isCreator = !!access && typeof access === "object" && (access as { kind?: string }).kind === "creator";
  if (!isCreator) return payload;
  return {
    ...payload,
    recent: [],
    analytics: {
      ...payload.analytics,
      whaleFans: [],
      topWeeklySpenders: [],
    },
  };
}
