// A 2026-09 bot bug (fixed in twin-bot 8040422) recorded some real Telegram
// payments TWICE, as two star_transactions rows with different `id`s but the
// same (clone_id, telegram_id, kind, amount_stars, paid_at). New duplicates
// are blocked at the source now, but 169 existing duplicate rows (154 groups,
// ~110k Stars) remain in the table, and other rows may reference either id
// (media links, catalogue receipts, etc.), so the duplicate rows themselves
// cannot simply be deleted.
//
// Every place that SUMS or COUNTS star_transactions for revenue, sales, or
// buyers must therefore count each of those business keys once. This is the
// one shared place that rule lives: call it right after paging rows out of
// star_transactions, before any summing/rollup/classification runs, so every
// consumer (dashboard, analytics, agency earnings, public/admin APIs, mtproto
// attribution) sees the same deduplicated set.
//
// Deliberately NOT a rollup table and NOT a query-time GROUP BY (see the "no
// rollup" notes in lib/rollup.ts and mtproto/attribution.ts) - this is a pure,
// in-memory dedupe over rows already read, same spirit as classifyRevenueLedgerRow.
//
// Refunds (`invoice_payload === "refund"` or negative amount_stars) and TON
// rows (`id` starting with `ton:`) are NOT deduplicated against anything: a
// refund is keyed by its own id like any other row (two distinct refunds can
// legitimately share the same amount/timestamp/kind), and a TON row is a
// normal purchase for this purpose. Only rows sharing the exact business key
// are collapsed, and the LOWEST id in each group is kept (arbitrary but
// deterministic, so repeated calls on the same data agree).

export type StarDedupeKeyFields = {
  id: string;
  clone_id: string | null;
  telegram_id: number | string | null;
  kind: string | null;
  amount_stars: number | string | null;
  paid_at: string | null;
};

function isAdjustmentRow<T extends StarDedupeKeyFields & { invoice_payload?: string | null }>(row: T): boolean {
  const stars = Number(row.amount_stars);
  const payload = typeof row.invoice_payload === "string" ? row.invoice_payload.trim().toLowerCase() : "";
  return payload === "refund" || (Number.isFinite(stars) && stars < 0);
}

function businessKey(row: StarDedupeKeyFields): string {
  return [row.clone_id ?? "", row.telegram_id ?? "", row.kind ?? "", row.amount_stars ?? "", row.paid_at ?? ""].join(
    "\u0000",
  );
}

/** The key dedupeStarRows collapses on, or null for a refund/adjustment row (never collapsed). For a reader that pages
 *  rows and so must collapse a group split across pages itself (lib/api-public-v2.ts payments). */
export function starDedupeKey<T extends StarDedupeKeyFields & { invoice_payload?: string | null }>(row: T): string | null {
  return isAdjustmentRow(row) ? null : businessKey(row);
}

/**
 * Collapse duplicate star_transactions rows: rows sharing the same
 * (clone_id, telegram_id, kind, amount_stars, paid_at) collapse to the one
 * with the lowest `id`. Refund/adjustment rows are never collapsed with
 * anything (each keeps its own identity). Order of surviving rows is
 * otherwise preserved. Pure - does not mutate its input.
 */
export function dedupeStarRows<T extends StarDedupeKeyFields & { invoice_payload?: string | null }>(
  rows: readonly T[],
): T[] {
  const bestByKey = new Map<string, T>();

  for (const row of rows) {
    if (isAdjustmentRow(row)) continue;
    const key = businessKey(row);
    const existing = bestByKey.get(key);
    if (!existing || String(row.id) < String(existing.id)) {
      bestByKey.set(key, row);
    }
  }

  // Preserve the input's original relative order: walk the rows once more,
  // emitting adjustments as-is and emitting each key's winning row exactly
  // once, at the first position it appears in the input.
  const out: T[] = [];
  const emitted = new Set<string>();
  for (const row of rows) {
    if (isAdjustmentRow(row)) {
      out.push(row);
      continue;
    }
    const key = businessKey(row);
    const winner = bestByKey.get(key)!;
    if (String(row.id) === String(winner.id) && !emitted.has(key)) {
      out.push(winner);
      emitted.add(key);
    }
  }
  return out;
}
