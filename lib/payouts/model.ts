export const PAYOUT_CURRENCIES = ["USD", "AUD"] as const;
export type PayoutCurrency = typeof PAYOUT_CURRENCIES[number];
export type PayoutTotals = Record<PayoutCurrency, number>;
export type PayoutCreator = { id: string; name: string; earnedUsdCents: number | null; paid: PayoutTotals; lastPaidOn: string | null };
export type PayoutRecord = { id: string; cloneId: string; creatorName: string; amountCents: number; currency: PayoutCurrency; paidOn: string; reference: string; method: string; voided: boolean };
export type PayoutSnapshot = { audience: "admin" | "creator"; canManage: boolean; brand: "twin" | "moxy" | "flirt"; creators: PayoutCreator[]; history: PayoutRecord[]; historyCount: number; page: number; pageSize: number; checkedAt: string };
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class PayoutError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function todayBrisbane(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Brisbane", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = (type: string) => parts.find(part => part.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}
export function parseAmount(value: unknown): number {
  if (typeof value !== "string" || !/^\d{1,9}(?:\.\d{1,2})?$/.test(value.trim())) throw new PayoutError("Enter an amount with up to two decimal places.");
  const [whole, fraction = ""] = value.trim().split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 99_999_999_999) throw new PayoutError("Enter a payout amount greater than zero.");
  return cents;
}
function shortText(value: unknown, max: number): string {
  if (value == null) return "";
  if (typeof value !== "string" || value.trim().length > max || /[\u0000-\u001f]/.test(value)) throw new PayoutError("The payment reference or method is invalid.");
  return value.trim();
}
export function parsePayout(value: unknown, today = todayBrisbane()) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PayoutError("Invalid payout.");
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(key => !["cloneId", "amount", "currency", "paidOn", "reference", "method", "requestId"].includes(key))) throw new PayoutError("Unsupported payout field.");
  if (typeof row.cloneId !== "string" || !UUID.test(row.cloneId)) throw new PayoutError("Choose a creator.");
  if (typeof row.requestId !== "string" || !UUID.test(row.requestId)) throw new PayoutError("Invalid payment request. Please reload the page.");
  if (!PAYOUT_CURRENCIES.includes(row.currency as PayoutCurrency)) throw new PayoutError("Choose USD or AUD.");
  if (typeof row.paidOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.paidOn) || row.paidOn < "2000-01-01" || row.paidOn > today) throw new PayoutError("Enter the date this payment was made.");
  const date = new Date(`${row.paidOn}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== row.paidOn) throw new PayoutError("Enter a valid payment date.");
  return { cloneId: row.cloneId, amountCents: parseAmount(row.amount), currency: row.currency as PayoutCurrency, paidOn: row.paidOn, reference: shortText(row.reference, 240), method: shortText(row.method, 80), requestId: row.requestId };
}
export function payoutBrand(name?: string | null): PayoutSnapshot["brand"] {
  const value = name?.trim().toLowerCase();
  return value === "moxy" ? "moxy" : value === "flirt" ? "flirt" : "twin";
}
export function safeCents(value: unknown): number {
  const cents = Number(value);
  if (!Number.isSafeInteger(cents) || cents < 0) throw new PayoutError("Payment totals are unavailable.", 503);
  return cents;
}
