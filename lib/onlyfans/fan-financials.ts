export type FanFinancials = { version: "of-fan-financials.v1"; totals: { currency: string; status: string; transactions: number; grossCents: number; netCents: number | null; lastTransactionAt: string }[]; coverageComplete: boolean; coverageAt: string | null; commerceHeld: boolean };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const money = (v: unknown) => Number.isSafeInteger(v);
const stamp = (v: unknown) => typeof v === "string" && Number.isFinite(Date.parse(v));
export function parseFanFinancials(v: unknown): FanFinancials | null {
  if (!object(v) || v.version !== "of-fan-financials.v1" || !Array.isArray(v.totals) || v.totals.length > 200 ||
      typeof v.coverageComplete !== "boolean" || typeof v.commerceHeld !== "boolean" || !(v.coverageAt === null || stamp(v.coverageAt))) return null;
  const keys = new Set<string>();
  for (const row of v.totals) {
    if (!object(row) || typeof row.currency !== "string" || !/^[A-Z]{3}$/.test(row.currency) || typeof row.status !== "string" ||
        !["pending", "cleared", "refund_pending", "refunded", "chargedback", "unknown"].includes(row.status) ||
        !Number.isSafeInteger(row.transactions) || Number(row.transactions) < 1 || !money(row.grossCents) ||
        !(row.netCents === null || money(row.netCents)) || !stamp(row.lastTransactionAt)) return null;
    const key = `${row.currency}:${row.status}`; if (keys.has(key)) return null; keys.add(key);
  }
  // A completeness claim with no cutoff behind it is narrowed to incomplete; the totals still show, as unverified.
  return (v.coverageComplete && v.coverageAt === null ? { ...v, coverageComplete: false } : v) as FanFinancials;
}
