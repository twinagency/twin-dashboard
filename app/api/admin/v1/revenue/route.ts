import { withAdmin, ok, jsonError, fromQueryError } from "@/lib/api-route";
import { getDashboard, type Period } from "@/lib/dashboard-data";
import { getAnalytics } from "@/lib/analytics-data";
import { resolveClone, parseRevenueWindow, isQueryError } from "@/lib/api-read";

export const dynamic = "force-dynamic";

// Revenue, through the SAME getDashboard()/getAnalytics() the Revenue page
// renders from. Not a reimplementation: two pieces of code summing
// star_transactions their own way produce two answers to "how much did we make"
// and no way to tell which is right.
//
// This is also the endpoint a future public/tenant API would sit on top of —
// but it is NOT that API. There is no tenant model in this database (no owner,
// agency or org column exists on any of the 22 tables), so this returns the
// WHOLE FLEET unless ?clone= narrows it, and it must not be exposed to an
// agency as-is.
export const GET = withAdmin(async (req) => {
  const params = new URL(req.url).searchParams;

  // Window parsing lives in lib/api-read.ts so check-admin-api.ts can drive it.
  const window = parseRevenueWindow(params);
  if (isQueryError(window)) return fromQueryError(window);

  const cloneKey = params.get("clone");
  let cloneId: string | null = null;
  let clone: { id: string; slug: string; name: string } | null = null;
  if (cloneKey) {
    clone = await resolveClone(cloneKey);
    if (!clone) return jsonError(`no clone matching "${cloneKey}"`, 404);
    cloneId = clone.id;
  }

  const period = window.period as Period;
  const [dashboard, analytics] = await Promise.all([
    getDashboard(period, window.range),
    getAnalytics(period, cloneId, window.range),
  ]);

  return ok({
    period,
    range: window.range ?? null,
    clone: clone ? { id: clone.id, slug: clone.slug, name: clone.name } : null,
    scope: cloneId ? "analytics scoped to one clone; headline/chart cover the whole fleet" : "whole fleet",
    dashboard,
    analytics,
    caveats: [
      "Star balance is omitted: it needs a live Telegram call against one bot's token, which this API does not touch.",
      "AI spend (cost_usd, from usage_events) is truncated by the selected window and usage_events has no retention/rollup yet, so long-window spend history is not complete. Known open item.",
    ],
  });
});
