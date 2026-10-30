/** Creator editor contract. No service credential enters browser code. */
import { validFanSelection, parseActivationReadiness, type FanSelection, type ActivationReadiness } from "./activation";
export const CONFIGURATION_SCHEMA = "of-configuration.v3";
export const CONFIGURATION_HEADER = "X-OnlyFans-Configuration-Version";
export const FACT_KEYS = ["age", "job", "home_city", "relationship", "kids", "family", "tattoos", "kinks", "limits"] as const;
export type FactKey = typeof FACT_KEYS[number];
export type Configuration = {
  activation?: ActivationReadiness;
  configurationRevision: number; fingerprint: string; persona: string | null; personaTruncated: boolean;
  creatorFacts: Record<FactKey, string | null>; factFields: { key: FactKey; label: string }[];
  factsValid: boolean; readOnlyFacts: FactKey[]; modelsValid: boolean;
  sharedFacts: { state: "unconfigured" | "unavailable" | "current" | "stale";
    checkedAt: string | null; sourceUpdatedAt: string | null; overrideKeys: FactKey[] };
  defaultModel: string | null; replyModelOverride: string | null; replyOverridePresent: boolean;
  resolvedReplyModel: string | null; modelOptions: string[];
  salesConfigurationValid: boolean; onRequestSalesEnabled: boolean;
  fasttDiscountResend: boolean; fasttPostBuyUpsell: boolean;
  nativeReplyPacingEnabled?: boolean; nativeReplyFormatEnabled?: boolean;
  dailyCostCapCents: number; reasoningEffort: string | null; reasoningOptions: Record<string, string[]>;
};
export type ConfigurationPatch = { nativeReplyPacingEnabled?: boolean; nativeReplyFormatEnabled?: boolean; fasttScope?: FanSelection; persona?: string; creatorFacts?: Partial<Record<FactKey, string | null>>; inheritCreatorFacts?: FactKey[];
  defaultModel?: string; replyModelOverride?: string | null; onRequestSalesEnabled?: boolean; fasttDiscountResend?: boolean; fasttPostBuyUpsell?: boolean; dailyCostCapCents?: number; reasoningEffort?: string | null };
export type ConfigurationRequest = { patch: ConfigurationPatch; expectedRevision: number; expectedFingerprint: string };
export type ConfigurationAck = { schemaVersion: typeof CONFIGURATION_SCHEMA; ok: true; applied: true;
  accountId: string; commandKey: string; recordedRevision: number; recordedFingerprint: string };
export type ConfigurationFailure = { ok: false; status: number; outcome: "refused" | "unconfirmed"; error: string };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).sort().join(",") === keys.sort().join(",");
const text = (value: unknown, max: number): value is string => typeof value === "string" && value.length <= max;
const optionalText = (value: unknown, max: number) => value === null || text(value, max);
export const configurationHash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const revision = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) < 2 ** 31 - 1;
export function validConfigurationRequest(value: unknown): value is ConfigurationRequest {
  if (!object(value) || !exact(value, ["patch", "expectedRevision", "expectedFingerprint"]) ||
      !revision(value.expectedRevision) || !configurationHash(value.expectedFingerprint) || !object(value.patch)) return false;
  const patch = value.patch;
  if (!Object.keys(patch).length || Object.keys(patch).some(key => !["nativeReplyPacingEnabled", "nativeReplyFormatEnabled", "fasttScope", "persona", "creatorFacts", "inheritCreatorFacts", "defaultModel", "replyModelOverride", "onRequestSalesEnabled", "fasttDiscountResend", "fasttPostBuyUpsell", "dailyCostCapCents", "reasoningEffort"].includes(key))) return false;
  for (const key of ["nativeReplyPacingEnabled", "nativeReplyFormatEnabled"]) if (key in patch && typeof patch[key] !== "boolean") return false;
  if ("fasttScope" in patch && !validFanSelection(patch.fasttScope)) return false;
  if ("dailyCostCapCents" in patch && (!Number.isInteger(patch.dailyCostCapCents) || Number(patch.dailyCostCapCents) < 0 || Number(patch.dailyCostCapCents) > 1_000_000)) return false;
  if ("reasoningEffort" in patch && patch.reasoningEffort !== null && (!text(patch.reasoningEffort, 40) || !patch.reasoningEffort.trim())) return false;
  if ("onRequestSalesEnabled" in patch && typeof patch.onRequestSalesEnabled !== "boolean") return false;
  if (("fasttDiscountResend" in patch && typeof patch.fasttDiscountResend !== "boolean") || ("fasttPostBuyUpsell" in patch && typeof patch.fasttPostBuyUpsell !== "boolean")) return false;
  if ("inheritCreatorFacts" in patch && (!Array.isArray(patch.inheritCreatorFacts) || !patch.inheritCreatorFacts.length ||
    new Set(patch.inheritCreatorFacts).size !== patch.inheritCreatorFacts.length || patch.inheritCreatorFacts.some(key =>
      !(FACT_KEYS as readonly unknown[]).includes(key) || object(patch.creatorFacts) && Object.hasOwn(patch.creatorFacts, String(key))))) return false;
  if ("persona" in patch && (!text(patch.persona, 4096) || !patch.persona.trim())) return false;
  if ("creatorFacts" in patch && (!object(patch.creatorFacts) || !Object.keys(patch.creatorFacts).length ||
    Object.entries(patch.creatorFacts).some(([key, value]) => !(FACT_KEYS as readonly string[]).includes(key) ||
      !(value === null || (text(value, 240) && !!value.trim()))))) return false;
  return (!("defaultModel" in patch) || (text(patch.defaultModel, 160) && !!patch.defaultModel)) &&
    (!("replyModelOverride" in patch) || patch.replyModelOverride === null || (text(patch.replyModelOverride, 160) && !!patch.replyModelOverride));
}
export function parseConfiguration(value: unknown, accountId: string): Configuration | null {
  if (!object(value) || !exact(value, ["schemaVersion", "ok", "accountId", "configuration"]) ||
    value.schemaVersion !== CONFIGURATION_SCHEMA || value.ok !== true || value.accountId !== accountId || !object(value.configuration)) return null;
  const c = value.configuration;
  if (["nativeReplyPacingEnabled", "nativeReplyFormatEnabled"].some(key => key in c && typeof c[key] !== "boolean")) return null;
  if (!c.salesConfigurationValid && (c.nativeReplyPacingEnabled === true || c.nativeReplyFormatEnabled === true)) return null;
  if (!exact(c, ["configurationRevision", "fingerprint", "persona", "personaTruncated", "creatorFacts", "factFields", "factsValid", "readOnlyFacts", "modelsValid", "defaultModel", "replyModelOverride", "replyOverridePresent", "resolvedReplyModel", "modelOptions", "sharedFacts", "salesConfigurationValid", "onRequestSalesEnabled", "fasttDiscountResend", "fasttPostBuyUpsell", "dailyCostCapCents", "reasoningEffort", "reasoningOptions", ...("activation" in c ? ["activation"] : []), ...["nativeReplyPacingEnabled", "nativeReplyFormatEnabled"].filter(key => key in c)]) ||
    ("activation" in c && !parseActivationReadiness(c.activation)) ||
    !revision(c.configurationRevision) || !configurationHash(c.fingerprint) || !optionalText(c.persona, 4096) ||
    typeof c.personaTruncated !== "boolean" || (c.personaTruncated ? c.persona !== null : typeof c.persona !== "string") ||
    !object(c.creatorFacts) || !exact(c.creatorFacts, [...FACT_KEYS]) || Object.values(c.creatorFacts).some(value => !optionalText(value, 16000)) ||
    !Array.isArray(c.factFields) || c.factFields.length !== FACT_KEYS.length ||
    !c.factFields.every((field, index) => object(field) && exact(field, ["key", "label"]) && field.key === FACT_KEYS[index] && text(field.label, 160) && !!field.label) ||
    !Array.isArray(c.readOnlyFacts) || new Set(c.readOnlyFacts).size !== c.readOnlyFacts.length || c.readOnlyFacts.some(key => !(FACT_KEYS as readonly unknown[]).includes(key)) ||
    typeof c.factsValid !== "boolean" || typeof c.modelsValid !== "boolean" || typeof c.replyOverridePresent !== "boolean" ||
    typeof c.salesConfigurationValid !== "boolean" || typeof c.onRequestSalesEnabled !== "boolean" ||
    typeof c.fasttDiscountResend !== "boolean" || typeof c.fasttPostBuyUpsell !== "boolean" ||
    (!c.salesConfigurationValid && (c.onRequestSalesEnabled || c.fasttDiscountResend || c.fasttPostBuyUpsell)) ||
    !optionalText(c.defaultModel, 160) || !optionalText(c.replyModelOverride, 160) || !optionalText(c.resolvedReplyModel, 160) ||
    !Array.isArray(c.modelOptions) || !c.modelOptions.length || c.modelOptions.length > 500 ||
    new Set(c.modelOptions).size !== c.modelOptions.length || c.modelOptions.some(model => !text(model, 160) || !model) ||
    (c.resolvedReplyModel !== null && !c.modelOptions.includes(c.resolvedReplyModel)) ||
    !Number.isInteger(c.dailyCostCapCents) || Number(c.dailyCostCapCents) < 0 || Number(c.dailyCostCapCents) > 1_000_000 || !optionalText(c.reasoningEffort, 40) || !object(c.reasoningOptions) ||
    Object.entries(c.reasoningOptions).some(([model, options]) => !Array.isArray(c.modelOptions) || !c.modelOptions.includes(model) || !Array.isArray(options) || options.length > 20 || options.some(e => !text(e, 40) || !e))) return null;
  const source = c.sharedFacts;
  const stamp = (value: unknown) => value === null || typeof value === "string" && /Z$/.test(value) && Number.isFinite(Date.parse(value));
  if (!object(source) || !exact(source, ["state", "checkedAt", "sourceUpdatedAt", "overrideKeys"]) ||
    !["unconfigured", "unavailable", "current", "stale"].includes(source.state as string) || !stamp(source.checkedAt) || !stamp(source.sourceUpdatedAt) ||
    !Array.isArray(source.overrideKeys) || new Set(source.overrideKeys).size !== source.overrideKeys.length || source.overrideKeys.some(key => !(FACT_KEYS as readonly unknown[]).includes(key)) ||
    source.state === "current" && (source.checkedAt === null || source.sourceUpdatedAt === null)) return null;
  return c as Configuration;
}
export function parseConfigurationAck(value: unknown, expected: ConfigurationRequest & { accountId: string; commandKey?: string }): ConfigurationAck | null {
  if (!object(value) || !exact(value, ["schemaVersion", "ok", "applied", "accountId", "commandKey", "recordedRevision", "recordedFingerprint"]) ||
    value.schemaVersion !== CONFIGURATION_SCHEMA || value.ok !== true || value.applied !== true || value.accountId !== expected.accountId ||
    value.recordedRevision !== expected.expectedRevision + 1 || !configurationHash(value.commandKey) || !configurationHash(value.recordedFingerprint) ||
    (expected.commandKey !== undefined && value.commandKey !== expected.commandKey)) return null;
  return value as ConfigurationAck;
}
/** Stable identities across JSON key order and explicit retries. */
export function canonicalConfiguration(value: unknown): string {
  return JSON.stringify(value, (_key, item) => object(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
}

