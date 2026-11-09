import { payoutClient, type PayoutViewer } from "./access";
import { PayoutError, UUID } from "./model";

const ADDRESS_LIMITS = { street: 160, unit: 100, city: 100, region: 100, postalCode: 24, country: 80 } as const;
export type RecipientAddress = Record<keyof typeof ADDRESS_LIMITS, string>;

export type BankDetails = { cloneId: string; country: string; swiftBic: string; branchNumber: string; accountNumber: string; accountName: string; recipientAddress: RecipientAddress | null; updatedAt: string | null };
const COUNTRY = /^[A-Za-z .,'()-]{2,80}$/;
const SWIFT = /^[A-Za-z]{4}[A-Za-z]{2}[A-Za-z0-9]{2}(?:[A-Za-z0-9]{3})?$/;
const BRANCH = /^[0-9A-Za-z -]{3,20}$/;
const ACCOUNT = /^[0-9A-Za-z ]{4,34}$/;
const NAME = /^[\p{L}\p{M}0-9 .,'&()/-]{2,140}$/u;

function parseRecipientAddress(input: unknown): RecipientAddress | null | undefined {
  if (input === undefined) return undefined;
  if (input === null) return null;
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new PayoutError("Invalid recipient address.");

  const fields = input as Record<string, unknown>;
  if (Object.keys(fields).some(key => !Object.hasOwn(ADDRESS_LIMITS, key))) throw new PayoutError("Invalid recipient address.");
  const address = {} as RecipientAddress;
  for (const key of Object.keys(ADDRESS_LIMITS) as (keyof RecipientAddress)[]) {
    const value = fields[key] ?? "";
    if (typeof value !== "string" || value.length > ADDRESS_LIMITS[key] || /[\x00-\x1f\x7f]/.test(value)) {
      throw new PayoutError("Enter a valid recipient address.");
    }
    address[key] = value.trim();
  }
  if (Object.values(address).every(value => !value)) return null;
  if (!address.street || !address.city || !address.country) {
    throw new PayoutError("Enter the recipient's street address, city and country.");
  }
  return address;
}

export function parseBank(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new PayoutError("Invalid bank details.");
  const v = input as Record<string, unknown>;
  const allowed = ["cloneId", "country", "useBranch", "swiftBic", "branchNumber", "accountNumber", "accountName", "recipientAddress"];
  if (Object.keys(v).some(k => !allowed.includes(k))) throw new PayoutError("Unsupported bank field.");
  const text = (x: unknown) => (typeof x === "string" ? x.trim() : "");
  const country = text(v.country), accountNumber = text(v.accountNumber).replace(/\s+/g, " "), accountName = text(v.accountName);
  const useBranch = v.useBranch === true;
  const swiftBic = useBranch ? "" : text(v.swiftBic).toUpperCase().replace(/\s+/g, "");
  const branchNumber = useBranch ? text(v.branchNumber) : "";
  if (!COUNTRY.test(country)) throw new PayoutError("Choose the destination country.");
  if (useBranch ? !BRANCH.test(branchNumber) : !SWIFT.test(swiftBic)) throw new PayoutError(useBranch ? "Enter a valid branch number." : "Enter a valid SWIFT / BIC code (8 or 11 characters).");
  if (!ACCOUNT.test(accountNumber)) throw new PayoutError("Enter a valid account number or IBAN.");
  if (!NAME.test(accountName) || accountName.split(/\s+/).length < 2) throw new PayoutError("Enter the full legal name on the account.");
  const cloneId = typeof v.cloneId === "string" && v.cloneId ? v.cloneId : null;
  if (cloneId && !UUID.test(cloneId)) throw new PayoutError("Choose a creator.");
  return { cloneId, country, swiftBic, branchNumber, accountNumber, accountName, recipientAddress: parseRecipientAddress(v.recipientAddress) };
}

function targetClone(viewer: PayoutViewer, requested: string | null): string {
  if (viewer.audience === "creator") {
    const own = viewer.cloneIds?.[0];
    if (!own || (requested && requested !== own)) throw new PayoutError("Creator access denied.", 403);
    return own;
  }
  if (!requested) throw new PayoutError("Choose a creator.");
  if (viewer.cloneIds && !viewer.cloneIds.includes(requested)) throw new PayoutError("Creator access denied.", 403);
  return requested;
}

export async function readBank(viewer: PayoutViewer, requested: string | null): Promise<BankDetails | null> {
  if (viewer.audience === "creator" && !viewer.cloneIds?.[0]) return null;
  const cloneId = targetClone(viewer, requested);
  const { data, error } = await payoutClient(viewer).from("creator_bank_details").select("clone_id,country,swift_bic,branch_number,account_number,account_name,recipient_address,updated_at").eq("clone_id", cloneId).maybeSingle();
  if (error) throw new PayoutError("Bank details are temporarily unavailable.", 503);
  return data ? { cloneId: data.clone_id, country: data.country, swiftBic: data.swift_bic, branchNumber: data.branch_number, accountNumber: data.account_number, accountName: data.account_name, recipientAddress: data.recipient_address, updatedAt: data.updated_at } : null;
}

export async function saveBank(viewer: PayoutViewer, input: unknown) {
  const value = parseBank(input);
  const cloneId = targetClone(viewer, value.cloneId);
  const row = { clone_id: cloneId, country: value.country, swift_bic: value.swiftBic, branch_number: value.branchNumber, account_number: value.accountNumber, account_name: value.accountName, ...(value.recipientAddress === undefined ? {} : { recipient_address: value.recipientAddress }), updated_by: viewer.actor, updated_at: new Date().toISOString() };
  const { error } = await payoutClient(viewer).from("creator_bank_details").upsert(row, { onConflict: "clone_id" });
  if (error) throw new PayoutError("Bank details could not be saved. Please try again.", 503);
  return { ok: true };
}
