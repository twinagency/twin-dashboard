// Temporary, presentation-only earnings mode for the exact Cat clone.
//
// The query switch is deliberately explicit: merely selecting Cat must keep
// showing live data. The exact UUID matters too; never match a production demo
// by a mutable display name or slug.
export const CAT_DEMO_CLONE_ID = "046fd9b0-7771-49ef-a7df-9d2c518575cc";
export const CAT_PRESENTATION_QUERY_KEY = "view";
export const CAT_DEMO_QUERY_VALUE = "cat";
// Stars are the source of truth. At the dashboard's fixed fallback rate
// (1 Star = US$0.013, US$1 = A$1.40), these render as A$129,384.00 for 30 days
// and A$129,384.00 since launch. The presentation represents month one, so
// the 30-day and since-launch totals intentionally match.
export const CAT_DEMO_30D_STARS = 7_109_011;
export const CAT_DEMO_LIFETIME_STARS = CAT_DEMO_30D_STARS;

type Access = { cloneIds: readonly string[] } | null | undefined;

export function isCatDemoRequest(
  searchParams: URLSearchParams,
  access: Access,
  cloneId: string | null | undefined,
): boolean {
  const modes = searchParams.getAll(CAT_PRESENTATION_QUERY_KEY);
  if (modes.length !== 1 || modes[0] !== CAT_DEMO_QUERY_VALUE) return false;
  if (cloneId !== CAT_DEMO_CLONE_ID) return false;

  // null is the independently authenticated Twin-admin audience. Never show
  // fabricated presentation figures inside an agency or creator workspace,
  // even when that scoped identity legitimately owns Cat.
  return access === null;
}
