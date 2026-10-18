/** Strict read models for existing native records. No browser write capability. */
export type NativeSection = "content" | "sales" | "settings";
export const NATIVE_SECTIONS: NativeSection[] = ["content", "sales", "settings"];
export type WorkspaceBase = {
  schemaVersion: "of-workspace.v1"; section: NativeSection; accountId: string; asOf: string;
  lastCompleteSyncAt: string | null; historyRecoveryRequired: boolean; providerConnectionVerified: false;
};
export type CatalogRead = WorkspaceBase & { section: "content"; nextCursor: string | null; items: {
  itemId: string; label: string; kind: string; description: string; descriptionTruncated: boolean;
  mediaCount: number | null; previewCount: number | null; priceCents: number | null; currency: "USD";
  readiness: "disabled" | "free_teaser" | "needs_review" | "terms_checked"; updatedAt: string | null;
}[] };
export type SalesRead = WorkspaceBase & { section: "sales"; nextCursor: string | null; transactions: {
  transactionId: string; fanId: string | null; messageId: string | null; kind: string; status: string;
  grossCents: number; netCents: number | null; currency: string; occurredAt: string;
}[]; totals: { currency: string; status: string; count: number; grossCents: number }[];
  openOffers: { offerId: string; fanId: string; messageId: string | null; mode: string; priceCents: number; tipUnlockCents: number; currency: "USD"; offeredAt: string }[];
  openOfferCount: number; moreOpenOffers: boolean;
};
export const CONFIG_ISSUES = {
  creator_facts_invalid: "Some saved creator facts need review.",
  model_configuration_invalid: "The saved reply model override needs review.",
  sales_configuration_invalid: "The saved sales configuration needs review.",
  persona_missing: "A creator persona has not been saved.",
} as const;
export type SettingsRead = WorkspaceBase & { section: "settings"; runtimeEnabled: boolean;
  deliveryPolicy: { revision: number; enabled: boolean; mediaEnabled: boolean; usedUnits: number; limitUnits: number } | null;
  configuration: { personaExcerpt: string; personaTruncated: boolean; creatorFacts: { label: string; value: string }[];
    language: string | null; savedDefaultModel: string | null; savedReplyModelOverride: string | null;
    dailyModelCapCents: number; salesPermissions: {
      pack_send_enabled: boolean | null; pack_on_ask_enabled: boolean | null; qualification_gate_enabled: boolean | null;
    }; issues: (keyof typeof CONFIG_ISSUES)[] } | null;
};
export type WorkspaceRead = CatalogRead | SalesRead | SettingsRead;
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const keys = (v: unknown, names: string[]) => record(v) && Object.keys(v).length === names.length && names.every(n => Object.hasOwn(v, n));
const text = (v: unknown, max: number) => typeof v === "string" && v.length <= max;
const integer = (v: unknown, signed = false) => typeof v === "number" && Number.isSafeInteger(v) && (signed || v >= 0);
const nullable = (v: unknown, check: (v: unknown) => boolean) => v === null || check(v);
const id = (v: unknown) => typeof v === "string" && /^[1-9][0-9]{0,19}$/.test(v);
const stamp = (v: unknown) => typeof v === "string" && /(?:Z|[+-]\d\d:\d\d)$/.test(v) && Number.isFinite(Date.parse(v));
const currency = (v: unknown) => typeof v === "string" && /^[A-Z]{3}$/.test(v);
const cursor = (v: unknown) => nullable(v, x => typeof x === "string" && /^[A-Za-z0-9_-]{1,256}$/.test(x));
const BASE = ["schemaVersion", "section", "accountId", "asOf", "lastCompleteSyncAt", "historyRecoveryRequired", "providerConnectionVerified"];

export function parseWorkspace(value: unknown, accountId: string, section: NativeSection): WorkspaceRead | null {
  if (!record(value) || value.schemaVersion !== "of-workspace.v1" || value.section !== section || value.accountId !== accountId ||
    !stamp(value.asOf) || !nullable(value.lastCompleteSyncAt, stamp) || typeof value.historyRecoveryRequired !== "boolean" || value.providerConnectionVerified !== false) return null;
  if (section === "content") {
    if (!keys(value, [...BASE, "items", "nextCursor"]) || !cursor(value.nextCursor) || !Array.isArray(value.items) || value.items.length > 100) return null;
    for (const row of value.items) {
      if (!record(row) || !keys(row, ["itemId", "label", "kind", "description", "descriptionTruncated", "mediaCount", "previewCount", "priceCents", "currency", "readiness", "updatedAt"]) ||
        !id(row.itemId) || !text(row.label, 160) || !text(row.kind, 32) || !text(row.description, 2000) || typeof row.descriptionTruncated !== "boolean" ||
        !nullable(row.mediaCount, x => integer(x) && (x as number) <= 35) || !nullable(row.previewCount, x => integer(x) && (x as number) <= 35) ||
        !nullable(row.priceCents, integer) || row.currency !== "USD" || typeof row.readiness !== "string" || !["disabled", "free_teaser", "needs_review", "terms_checked"].includes(row.readiness) || !nullable(row.updatedAt, stamp)) return null;
    }
    if (new Set(value.items.map(x => x.itemId)).size !== value.items.length) return null;
  } else if (section === "sales") {
    if (!keys(value, [...BASE, "transactions", "totals", "nextCursor", "openOffers", "openOfferCount", "moreOpenOffers"]) || !cursor(value.nextCursor) || !Array.isArray(value.transactions) || value.transactions.length > 100 || !Array.isArray(value.totals) || value.totals.length > 64 ||
      !Array.isArray(value.openOffers) || value.openOffers.length > 25 || !integer(value.openOfferCount) || value.openOffers.length > (value.openOfferCount as number) ||
      value.moreOpenOffers !== ((value.openOfferCount as number) > value.openOffers.length)) return null;
    for (const row of value.openOffers) {
      if (!record(row) || !keys(row, ["offerId", "fanId", "messageId", "mode", "priceCents", "tipUnlockCents", "currency", "offeredAt"]) ||
        !id(row.offerId) || !id(row.fanId) || !nullable(row.messageId, id) || !text(row.mode, 24) || !integer(row.priceCents) || !integer(row.tipUnlockCents) || row.currency !== "USD" || !stamp(row.offeredAt)) return null;
    }
    for (const row of value.transactions) {
      if (!record(row) || !keys(row, ["transactionId", "fanId", "messageId", "kind", "status", "grossCents", "netCents", "currency", "occurredAt"]) ||
        !id(row.transactionId) || !nullable(row.fanId, id) || !nullable(row.messageId, id) || !text(row.kind, 64) || !text(row.status, 24) ||
        !integer(row.grossCents, true) || !nullable(row.netCents, x => integer(x, true)) || !currency(row.currency) || !stamp(row.occurredAt)) return null;
    }
    for (const row of value.totals) {
      if (!record(row) || !keys(row, ["currency", "status", "count", "grossCents"]) || !currency(row.currency) || !text(row.status, 24) || !integer(row.count) || !integer(row.grossCents, true)) return null;
    }
    if (new Set(value.openOffers.map(x => x.offerId)).size !== value.openOffers.length || new Set(value.transactions.map(x => x.transactionId)).size !== value.transactions.length ||
      new Set(value.totals.map(x => `${x.currency}:${x.status}`)).size !== value.totals.length) return null;
  } else {
    if (!keys(value, [...BASE, "runtimeEnabled", "deliveryPolicy", "configuration"]) || typeof value.runtimeEnabled !== "boolean") return null;
    const policy = value.deliveryPolicy;
    if (policy !== null && (!record(policy) || !keys(policy, ["revision", "enabled", "mediaEnabled", "usedUnits", "limitUnits"]) ||
      ![policy.revision, policy.usedUnits, policy.limitUnits].every(v => integer(v)) || typeof policy.enabled !== "boolean" || typeof policy.mediaEnabled !== "boolean")) return null;
    const cfg = value.configuration;
    if (cfg !== null) {
      if (!record(cfg) || !keys(cfg, ["personaExcerpt", "personaTruncated", "creatorFacts", "language", "savedDefaultModel", "savedReplyModelOverride", "dailyModelCapCents", "salesPermissions", "issues"]) ||
        !text(cfg.personaExcerpt, 4096) || typeof cfg.personaTruncated !== "boolean" || !nullable(cfg.language, v => text(v, 32)) ||
        !nullable(cfg.savedDefaultModel, v => text(v, 160)) || !nullable(cfg.savedReplyModelOverride, v => text(v, 160)) || !integer(cfg.dailyModelCapCents) ||
        !Array.isArray(cfg.creatorFacts) || cfg.creatorFacts.length > 64 || !cfg.creatorFacts.every(x => record(x) && keys(x, ["label", "value"]) && text(x.label, 160) && text(x.value, 1000)) ||
        !keys(cfg.salesPermissions, ["pack_send_enabled", "pack_on_ask_enabled", "qualification_gate_enabled"]) || !record(cfg.salesPermissions) ||
        !Object.values(cfg.salesPermissions).every(x => x === null || typeof x === "boolean") || !Array.isArray(cfg.issues) || cfg.issues.length > 4 ||
        !cfg.issues.every(x => typeof x === "string" && Object.hasOwn(CONFIG_ISSUES, x)) ||
        new Set(cfg.issues).size !== cfg.issues.length || new Set(cfg.creatorFacts.map(x => x.label)).size !== cfg.creatorFacts.length) return null;
    }
  }
  return value as WorkspaceRead;
}

export function formatRecordedMoney(cents: number, code: string): string {
  if (!integer(cents, true) || !currency(code)) throw new RangeError("Invalid recorded money");
  const value = BigInt(cents); const absolute = value < BigInt(0) ? -value : value;
  return `${code} ${value < BigInt(0) ? "−" : ""}${absolute / BigInt(100)}.${String(absolute % BigInt(100)).padStart(2, "0")}`;
}
