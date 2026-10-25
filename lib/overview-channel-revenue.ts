import { earningsStamp, type EarningsWindow, type NativeEarnings, EARNINGS_REASONS } from "./onlyfans/earnings";

export type OverviewOnlyFansRevenue = {
  schemaVersion: "overview-onlyfans-revenue.v1";
  window: EarningsWindow;
  status: "current" | "delayed" | "empty" | "unavailable";
  currency: "USD";
  netCents: number | null;
  asOf: string | null;
  includesPending: boolean;
  reason: string | null;
};

export function unavailableOverviewRevenue(window: EarningsWindow, reason: string): OverviewOnlyFansRevenue {
  return { schemaVersion: "overview-onlyfans-revenue.v1", window, status: "unavailable", currency: "USD", netCents: null, asOf: null, includesPending: false, reason };
}

export function emptyOverviewRevenue(window: EarningsWindow, asOf: string): OverviewOnlyFansRevenue {
  return { schemaVersion: "overview-onlyfans-revenue.v1", window, status: "empty", currency: "USD", netCents: 0, asOf, includesPending: false, reason: null };
}

/** The headline adds net to net. Gross or an incomplete payment sync cannot stand in for net. */
export function overviewOnlyFansRevenue(earnings: NativeEarnings): OverviewOnlyFansRevenue {
  if (earnings.accountCount === 0 && earnings.reasons.length === 1 && earnings.reasons[0] === "no_bound_accounts") {
    return emptyOverviewRevenue(earnings.window, earnings.asOf);
  }
  const recorded = earnings.recorded;
  if (recorded?.netCents != null) {
    return { schemaVersion: "overview-onlyfans-revenue.v1", window: earnings.window,
      status: earnings.status === "current" ? "current" : "delayed", currency: "USD",
      netCents: recorded.netCents, asOf: recorded.lastSuccessfulSyncAt,
      includesPending: recorded.pendingGrossCents > 0, reason: null };
  }
  if (earnings.status === "current" && earnings.pendingCount === 0 && earnings.clearedNetCents !== null) {
    return { schemaVersion: "overview-onlyfans-revenue.v1", window: earnings.window, status: "current", currency: "USD",
      netCents: earnings.clearedNetCents, asOf: earnings.recentLedgerAt, includesPending: false, reason: null };
  }
  return unavailableOverviewRevenue(earnings.window,
    earnings.reasons.map(reason => EARNINGS_REASONS[reason]).join(" ") || "OnlyFans net earnings are not available for every recorded payment.");
}

export function parseOverviewOnlyFansRevenue(value: unknown, window: EarningsWindow): OverviewOnlyFansRevenue | null {
  if (!value || typeof value !== "object") return null;
  const data = value as OverviewOnlyFansRevenue;
  if (data.schemaVersion !== "overview-onlyfans-revenue.v1" || data.window?.start !== window.start || data.window?.end !== window.end ||
      data.currency !== "USD" || !["current", "delayed", "empty", "unavailable"].includes(data.status) ||
      typeof data.includesPending !== "boolean" || !(data.asOf === null || earningsStamp(data.asOf))) return null;
  if (data.status === "unavailable") {
    if (data.netCents !== null || typeof data.reason !== "string" || !data.reason) return null;
  } else if (!Number.isSafeInteger(data.netCents) || data.reason !== null || data.asOf === null ||
      (data.status === "empty" && (data.netCents !== 0 || data.includesPending))) return null;
  return data;
}
