import type { AnalyticsData } from "./analytics-data";
import type { DashboardData } from "./dashboard-data";

export type RevenueSections = {
  dashboard: DashboardData;
  analytics: AnalyticsData | null;
  analyticsError: string | null;
};

/** A secondary analysis failure must not discard a successful earnings ledger.
 * Earnings failures still reject; unavailable values are never reported as zero. */
export async function readRevenueSections(
  dashboardRead: Promise<DashboardData>,
  analyticsRead: Promise<AnalyticsData>,
): Promise<RevenueSections> {
  const [dashboard, analysis] = await Promise.all([
    dashboardRead,
    analyticsRead.then(
      analytics => ({ analytics, analyticsError: null }),
      () => ({ analytics: null, analyticsError: "Performance analysis temporarily unavailable" }),
    ),
  ]);
  return { dashboard, ...analysis };
}
