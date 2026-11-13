import { withAdmin, ok, jsonError, fromQueryError, logActAs } from "@/lib/api-route";
import { parseRevenueWindow, isQueryError, resolveClone } from "@/lib/api-read";
import type { Period } from "@/lib/dashboard-data";
import { parseActAs } from "@/lib/api-auth";
import { publicRevenue, agencyCloneRevenue } from "@/lib/api-public";
import { agencyIdentityById } from "@/lib/agency-identity";

export const dynamic = "force-dynamic";

// "act as" for the admin API: x-twin-act-as: clone:<uuid> | agency:<uuid>.
// clone: the exact response that clone's own /api/v1 key would get (creator
// net, both cuts). agency: no agency key scope exists, so this is the agency's
// own view instead, platform cut only, summed over the clones it owns. Same
// projection either way, our cost/margin never included. This is an
// admin-API-only feature: withAdmin() below is the SAME gate every other
// route in app/api/admin/v1 uses (admin key + network), so acting-as never
// widens who can call this, only what shape they get back. Never mount this
// under /api/v1 or read x-twin-act-as from anything wrapped in withModelKey.
export const GET = withAdmin(async (req) => {
  const url = new URL(req.url);
  const actAs = parseActAs(req.headers);
  if (!actAs) {
    return jsonError('missing or malformed x-twin-act-as header, expected "clone:<uuid>" or "agency:<uuid>"', 400);
  }

  const window = parseRevenueWindow(url.searchParams);
  if (isQueryError(window)) return fromQueryError(window);
  const period = window.period as Period;

  logActAs(actAs, req);

  if (actAs.kind === "clone") {
    const clone = await resolveClone(actAs.id);
    if (!clone) return jsonError(`no clone matching "${actAs.id}"`, 404);
    const revenue = await publicRevenue(clone.id, period, window.range);
    return ok({ actingAs: { kind: "clone", id: clone.id, name: clone.name }, revenue });
  }

  const agency = await agencyIdentityById(actAs.id);
  if (!agency) return jsonError(`no agency matching "${actAs.id}"`, 404);

  // No fleet-scoped-to-a-subset-of-clones projection exists yet (the fleet key
  // shape in lib/api-public.ts is whole-fleet only), so this builds the same
  // PublicFleetModel[] shape by calling the per-clone projection once per
  // assigned clone and summing. Agency mode, not publicRevenue's creator mode:
  // the agency-creator cut is what the agency keeps, not a cost to it (G16).
  // Cost/margin are never computed (includeCost:false).
  const perClone = await Promise.all(
    agency.cloneIds.map(async (id) => {
      const clone = await resolveClone(id);
      const revenue = await agencyCloneRevenue(id, period, window.range);
      return { id, name: clone?.name ?? id, revenue };
    }),
  );
  const models = perClone.map(({ id, name, revenue }) => ({
    id,
    name,
    revenueStars: revenue.totals.revenueStars,
    revenueUsd: revenue.totals.revenueUsd,
    revenueAud: revenue.totals.revenueAud,
    sales: revenue.totals.sales,
  }));
  const totals = perClone.reduce(
    (acc, { revenue }) => ({
      revenueStars: acc.revenueStars + revenue.totals.revenueStars,
      revenueUsd: acc.revenueUsd + revenue.totals.revenueUsd,
      revenueAud: acc.revenueAud + revenue.totals.revenueAud,
      sales: acc.sales + revenue.totals.sales,
      fans: acc.fans + revenue.totals.fans,
      buyers: acc.buyers + revenue.totals.buyers,
    }),
    { revenueStars: 0, revenueUsd: 0, revenueAud: 0, sales: 0, fans: 0, buyers: 0 },
  );

  return ok({
    actingAs: { kind: "agency", id: agency.id, name: agency.name },
    revenue: { scope: "fleet" as const, period, range: window.range ?? null, totals, models },
  });
});
