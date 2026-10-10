import { withModelKey, publicOk, publicError } from "@/lib/api-public-route";
import { publicPayments, publicFleetPayments } from "@/lib/api-public-v2";
import { parsePaymentQuery, isQueryError, MAX_PAYMENT_LIMIT, MAX_PAYMENT_WINDOW_DAYS } from "@/lib/api-public-query";

export const dynamic = "force-dynamic";

// Every Star payment in a window, newest first, one row per payment.
//
// SCOPED BY THE KEY, like the other two. A clone key sees that clone's
// payments; a fleet key sees every clone's, with `cloneId` on each row. The
// scope is read from the key row and nothing in the query string can change it
// (withModelKey rejects ?clone= for both scopes).
//
// Options (all optional, all bounded): since, until (an ISO date, or 30m / 6h /
// 7d), limit, cursor, feature, kind, min_stars, refunds=0. Page with
// `nextCursor`; it stays valid as new payments arrive because it is a keyset,
// not an offset.
//
// MONEY AGREES WITH /api/v1/revenue: same duplicate collapse, same cuts, so the
// sum of a window here is that window's revenue there. No invoice payload, no
// attempt ids and no message content is on a row.
export const GET = withModelKey(async ({ tenant, params }) => {
  const query = parsePaymentQuery(params);
  if (isQueryError(query)) return publicError(query.error, 400);

  const fleet = tenant.scope === "fleet";
  const result = fleet ? await publicFleetPayments(query) : await publicPayments(tenant.cloneId as string, query);

  return publicOk({
    ...result,
    scope: tenant.scope,
    order: "newest first",
    maxLimit: MAX_PAYMENT_LIMIT,
    maxWindowDays: MAX_PAYMENT_WINDOW_DAYS,
    generatedAt: new Date().toISOString(),
  });
});
