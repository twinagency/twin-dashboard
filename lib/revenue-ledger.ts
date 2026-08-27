// Shared, deliberately small ledger rules. Revenue reports need two different
// views of the same rows:
//
// - net Stars: every signed ledger row, including refunds/adjustments;
// - paid orders: only an actual incoming, positive payment.
//
// Keeping that distinction here prevents a refund from becoming an "order",
// a "buyer", or a repeat purchase just because it exists in the ledger.

/** The minimal fields needed to decide whether a ledger row is a paid order. */
export type RevenueLedgerClassificationInput = {
  amount_stars: number | string | null;
  invoice_payload?: string | null;
};

/** Extra fields the dashboard's per-creator and fleet rollup needs. */
export type RevenueLedgerRow = RevenueLedgerClassificationInput & {
  clone_id: string;
  telegram_id: number | null;
};

export type RevenueLedgerClassification = {
  /** Signed value used for net revenue and the revenue chart. */
  stars: number;
  /** A refund/adjustment stays in net revenue, but is never a paid order. */
  adjustment: boolean;
  /** A positive, non-adjustment incoming payment. */
  paidOrder: boolean;
};

export type ClassifiedRevenueLedgerRow<T extends RevenueLedgerClassificationInput> = T & RevenueLedgerClassification;

/**
 * Classify a raw Star ledger row without changing its signed value. `refund` is
 * Telegram's adjustment invoice payload; a negative amount is also an
 * adjustment even when an older row has no payload. Both remain part of net
 * proceeds, but neither can create an order or buyer.
 */
export function classifyRevenueLedgerRow<T extends RevenueLedgerClassificationInput>(row: T): ClassifiedRevenueLedgerRow<T> {
  const parsedStars = Number(row.amount_stars);
  const stars = Number.isFinite(parsedStars) ? parsedStars : 0;
  const payload = typeof row.invoice_payload === "string" ? row.invoice_payload.trim().toLowerCase() : "";
  const adjustment = payload === "refund" || stars < 0;
  return { ...row, stars, adjustment, paidOrder: stars > 0 && !adjustment };
}

export type RevenueLedgerRollup<T extends RevenueLedgerRow> = {
  rows: ClassifiedRevenueLedgerRow<T>[];
  /** Signed net proceeds, including refunds/adjustments. */
  netStars: number;
  /** Positive payment volume only; use this for average paid order value. */
  grossPaymentStars: number;
  /** Count of positive, non-adjustment payments. */
  sales: number;
  cloneNetStars: Map<string, number>;
  cloneGrossPaymentStars: Map<string, number>;
  cloneSales: Map<string, number>;
  /** Paid orders per attributable buyer, scoped to each creator. */
  clonePaidOrdersPerFan: Map<string, Map<number, number>>;
  /** Paid orders per Telegram account across all creators. */
  fleetPaidOrdersPerFan: Map<number, number>;
};

/**
 * Roll up the dashboard ledger once, using the exact same paid-order predicate
 * for order count, buyer count, and repeat rate. Charts/revenue retain signed
 * rows through `netStars` and `cloneNetStars`.
 */
export function rollupRevenueLedger<T extends RevenueLedgerRow>(rawRows: readonly T[]): RevenueLedgerRollup<T> {
  const rows = rawRows.map(classifyRevenueLedgerRow);
  const cloneNetStars = new Map<string, number>();
  const cloneGrossPaymentStars = new Map<string, number>();
  const cloneSales = new Map<string, number>();
  const clonePaidOrdersPerFan = new Map<string, Map<number, number>>();
  const fleetPaidOrdersPerFan = new Map<number, number>();
  let netStars = 0;
  let grossPaymentStars = 0;
  let sales = 0;

  for (const row of rows) {
    netStars += row.stars;
    cloneNetStars.set(row.clone_id, (cloneNetStars.get(row.clone_id) ?? 0) + row.stars);

    if (!row.paidOrder) continue;

    grossPaymentStars += row.stars;
    sales += 1;
    cloneGrossPaymentStars.set(row.clone_id, (cloneGrossPaymentStars.get(row.clone_id) ?? 0) + row.stars);
    cloneSales.set(row.clone_id, (cloneSales.get(row.clone_id) ?? 0) + 1);

    if (row.telegram_id == null) continue;
    let perCreator = clonePaidOrdersPerFan.get(row.clone_id);
    if (!perCreator) {
      perCreator = new Map();
      clonePaidOrdersPerFan.set(row.clone_id, perCreator);
    }
    perCreator.set(row.telegram_id, (perCreator.get(row.telegram_id) ?? 0) + 1);
    fleetPaidOrdersPerFan.set(row.telegram_id, (fleetPaidOrdersPerFan.get(row.telegram_id) ?? 0) + 1);
  }

  return {
    rows,
    netStars,
    grossPaymentStars,
    sales,
    cloneNetStars,
    cloneGrossPaymentStars,
    cloneSales,
    clonePaidOrdersPerFan,
    fleetPaidOrdersPerFan,
  };
}

export function repeatBuyerCount(paidOrdersPerFan: ReadonlyMap<number, number>): number {
  let repeats = 0;
  for (const orders of paidOrdersPerFan.values()) if (orders > 1) repeats += 1;
  return repeats;
}
