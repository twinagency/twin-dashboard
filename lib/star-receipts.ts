// Shared reader rule for the Stage 3 individual-offer receipt namespace.
// Legacy rows predate receipt_status and keep their established ownership
// behaviour. A claimed v2i1 payload is stricter: only the settlement writer's
// verified result may unlock or rank media. Quarantined/malformed/mismatched
// receipts remain in the money ledger but carry no entitlement.

export type ReceiptStatusFields = {
  receipt_namespace?: string | null;
  receipt_status?: string | null;
};

type ReceiptSchemaDb = {
  from(table: string): {
    select(columns: string): { limit(count: number): PromiseLike<{ error: { code?: string; message?: string } | null }> };
  };
};

function isMissingReceiptSchema(error: { code?: string; message?: string }): boolean {
  const message = String(error.message ?? "");
  const namesReceiptColumn = /receipt_(namespace|status)/i.test(message);
  const describesMissingColumn = /(does not exist|not found|schema cache)/i.test(message);
  return namesReceiptColumn && describesMissingColumn && (error.code === "42703" || error.code === "PGRST204" || !error.code);
}

/**
 * Probe before a named-column read. The additive migration can land before old
 * readers; new readers can also be deployed before it and keep legacy results.
 * Only a confirmed missing-column response falls back. An outage or permission
 * error is surfaced so a money view cannot silently publish partial totals.
 */
export async function hasIndividualReceiptSchema(db: ReceiptSchemaDb): Promise<boolean> {
  const result = await db.from("star_transactions").select("receipt_namespace,receipt_status").limit(1);
  if (!result.error) return true;
  if (isMissingReceiptSchema(result.error)) return false;
  throw new Error(`Could not verify individual receipt schema: ${result.error.message ?? result.error.code ?? "unknown error"}`);
}

export function withReceiptColumns(columns: string, available: boolean, includeStatus = false): string {
  if (!available) return columns;
  return `${columns},receipt_namespace${includeStatus ? ",receipt_status" : ""}`;
}

export function receiptMayGrantMedia(row: ReceiptStatusFields): boolean {
  return row.receipt_namespace !== "v2i1" || row.receipt_status === "verified";
}

export function receiptMayRevokeMedia(row: ReceiptStatusFields): boolean {
  return row.receipt_namespace !== "v2i1" || row.receipt_status === "refunded";
}
