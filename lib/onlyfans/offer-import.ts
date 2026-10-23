/** of-offer-import.v1 contract. Prices, media and previews always come from a
 * backend source observation; the dashboard never supplies an imported price. */
export const IMPORT_SCHEMA = "of-offer-import.v1";
export const IMPORT_HEADER = "X-OnlyFans-Offer-Import-Version";
export const MAX_REFRESH_SOURCES = 50;
export const MAX_DRAFTS = 20;

export type ImportJob = {
  jobId: string; commandKey: string; mode: "inventory" | "refresh"; status: string; revision: number;
  rowsScanned: number; pagesRead: number; pageBudget: number; targetsTotal: number; targetsDone: number;
  lastError: string | null; requestedAt: string | null; updatedAt: string | null; completedAt: string | null;
  coverage: "imported_history" | "selected_sources";
};
export type CandidateSummary = {
  candidateId: string; revision: number; attachmentCount: number; sourceCount: number; observedPrices: number[];
  variantCount: number; verifiedSources: number; itemId: string | null;
  status: "ready_for_review" | "source_details_needed" | "blocked" | "draft_created";
};
export type Attachment = { mediaId: string; kind: string | null; freePreview: boolean };
export type Observation = {
  observationId: string; fingerprint: string; sourceKind: "message" | "post"; sourceId: string; fanId: string | null;
  sourceContext: "direct" | "queue" | "unknown"; sourceAt: string | null; observedAt: string | null;
  mediaIds: string[]; previewIds: string[] | null; lockedText: boolean | null; priceCents: number; currency: "USD";
  attachments: Attachment[]; reasons: string[]; ready: boolean;
};
/** Legacy message samples omit sourceKind. Parsed messages normalize it to message. */
export type SourceSample = { messageId: number; priceCents: number; sentAt: string | null } &
  ({ sourceKind?: "message"; fanId: string } | { sourceKind: "post"; fanId: null });
export type Variant = { key: string; priceCents: number | null; mediaIds: string[] | null; count: number; latest: SourceSample | null };
export type CandidateDetail = CandidateSummary & {
  variants: Variant[]; samples: SourceSample[];
  observations: Observation[]; assetReasons: string[];
  existingItem: { itemId: string; priceCents: number; enabled: boolean; pricingMode: string; importedBy: string | null } | null;
};
export type DraftInput = { observationId: string; expectedFingerprint: string; label: string; description: string;
  reuseConfirmed: true; descriptionApproved: true };
export type DraftResult = { commandKey: string; ok: true; itemId: string; priceCents: number; sourceAt: string | null } |
  { commandKey: string; ok: false; code: string; error: string };

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const has = (value: Record<string, unknown>, keys: string[]) => keys.every(key => key in value);
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).sort().join(",") === [...keys].sort().join(",");
const int = (value: unknown, max = 2 ** 31 - 1): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= max;
const hash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const decimal = (value: unknown): value is string => typeof value === "string" && /^[1-9][0-9]{0,18}$/.test(value);
const date = (value: unknown): value is string | null => value === null || (typeof value === "string" && value.length <= 40);
const text = (value: unknown, max: number): value is string => typeof value === "string" && !value.includes("\0") &&
  value.isWellFormed() && new TextEncoder().encode(value).length <= max;
export const importJobId = uuid;
export const candidateId = hash;
export const commandKey = hash;

function envelope(value: unknown, accountId: string, keys: string[]): Record<string, unknown> | null {
  if (!object(value) || value.schemaVersion !== IMPORT_SCHEMA || value.ok !== true || value.accountId !== accountId ||
    !exact(value, ["schemaVersion", "ok", "accountId", ...keys])) return null;
  return value;
}

export function parseJob(value: unknown): ImportJob | null {
  if (!object(value) || !has(value, ["jobId", "commandKey", "mode", "status", "revision", "coverage"]) || !uuid(value.jobId) ||
    !hash(value.commandKey) || !["inventory", "refresh"].includes(value.mode as string) || typeof value.status !== "string" ||
    !int(value.revision) || !["rowsScanned", "pagesRead", "pageBudget", "targetsTotal", "targetsDone"].every(k => int(value[k])) ||
    !(value.lastError === null || text(value.lastError, 64)) || !["requestedAt", "updatedAt", "completedAt"].every(k => date(value[k])) ||
    !["imported_history", "selected_sources"].includes(value.coverage as string)) return null;
  return value as ImportJob;
}

function summary(value: unknown): CandidateSummary | null {
  if (!object(value) || !hash(value.candidateId) || !int(value.revision) || !int(value.attachmentCount, 100) || !int(value.sourceCount) ||
    !Array.isArray(value.observedPrices) || !value.observedPrices.every(p => int(p, 100_000_000)) || !int(value.variantCount) ||
    !int(value.verifiedSources) || !(value.itemId === null || decimal(value.itemId)) ||
    !["ready_for_review", "source_details_needed", "blocked", "draft_created"].includes(value.status as string)) return null;
  return value as CandidateSummary;
}

function observation(value: unknown): Observation | null {
  if (!object(value) || !uuid(value.observationId) || !hash(value.fingerprint) || !["message", "post"].includes(value.sourceKind as string) ||
    !decimal(value.sourceId) || !(value.sourceKind === "post" ? value.fanId === null : decimal(value.fanId)) || !["direct", "queue", "unknown"].includes(value.sourceContext as string) ||
    !date(value.sourceAt) || !date(value.observedAt) || !Array.isArray(value.mediaIds) || !value.mediaIds.every(decimal) ||
    !(value.previewIds === null || (Array.isArray(value.previewIds) && value.previewIds.every(decimal))) ||
    !(value.lockedText === null || typeof value.lockedText === "boolean") || !int(value.priceCents, 100_000_000) || value.currency !== "USD" ||
    !Array.isArray(value.attachments) || !value.attachments.every(a => object(a) && decimal(a.mediaId) && typeof a.freePreview === "boolean" &&
      (a.kind === null || text(a.kind, 32))) || !Array.isArray(value.reasons) || !value.reasons.every(r => text(r, 64)) || typeof value.ready !== "boolean") return null;
  if (value.ready !== (value.reasons.length === 0)) return null;
  return value as Observation;
}

export function parseSourceSample(value: unknown): SourceSample | null {
  if (!object(value) || !exact(value, ["fanId", "messageId", "priceCents", "sentAt", ...("sourceKind" in value ? ["sourceKind"] : [])]) ||
    !(Number.isSafeInteger(value.messageId) && (value.messageId as number) > 0) || !int(value.priceCents, 100_000_000) ||
    !(value.sentAt === null || typeof value.sentAt === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z$/.test(value.sentAt) && Number.isFinite(Date.parse(value.sentAt)))) return null;
  const sourceKind = "sourceKind" in value ? value.sourceKind : "message";
  if (!(sourceKind === "post" ? value.fanId === null : sourceKind === "message" && decimal(value.fanId))) return null;
  return { ...value, sourceKind } as SourceSample;
}
function variant(value: unknown): Variant | null {
  if (!object(value) || !exact(value, ["key", "priceCents", "mediaIds", "count", "latest"]) || !text(value.key, 2400) || !value.key ||
    !(value.priceCents === null || int(value.priceCents, 100_000_000)) ||
    !(value.mediaIds === null || Array.isArray(value.mediaIds) && value.mediaIds.length <= 100 && value.mediaIds.every(decimal)) || !int(value.count)) return null;
  const latest = value.latest === null ? null : parseSourceSample(value.latest);
  if (value.latest !== null && (!latest || value.priceCents !== null && latest.priceCents !== value.priceCents)) return null;
  return { ...value, latest } as Variant;
}
/** Only message sources can enter the existing fan/message refresh API. */
export function messageRefreshSources(samples: readonly unknown[]): { fanId: string; messageId: string }[] {
  const sources = new Map<string, { fanId: string; messageId: string }>();
  for (const value of samples) {
    const source = parseSourceSample(value);
    if (!source || source.sourceKind === "post" || source.fanId === null) continue;
    const key = `${source.fanId}:${source.messageId}`;
    if (!sources.has(key)) sources.set(key, { fanId: source.fanId, messageId: String(source.messageId) });
    if (sources.size === MAX_REFRESH_SOURCES) break;
  }
  return [...sources.values()];
}

export function parseJobResponse(value: unknown, accountId: string): ImportJob | null {
  const body = envelope(value, accountId, ["job"]);
  return body ? parseJob(body.job) : null;
}

export function parseCandidatePage(value: unknown, accountId: string) {
  const body = envelope(value, accountId, ["job", "items", "nextCursor"]);
  if (!body || !Array.isArray(body.items) || !(body.nextCursor === null || hash(body.nextCursor))) return null;
  const job = parseJob(body.job), items = body.items.map(summary);
  if (!job || items.some(item => item === null)) return null;
  return { job, items: items as CandidateSummary[], nextCursor: body.nextCursor as string | null };
}

export function parseCandidate(value: unknown, accountId: string): CandidateDetail | null {
  const body = envelope(value, accountId, ["candidate"]);
  if (!body || !object(body.candidate)) return null;
  const c = body.candidate;
  if (!summary(c) || !Array.isArray(c.variants) || c.variants.length > 25 || !Array.isArray(c.samples) || c.samples.length > 10 || !Array.isArray(c.observations) ||
    !Array.isArray(c.assetReasons) || !c.assetReasons.every(r => text(r, 64)) ||
    !(c.existingItem === null || (object(c.existingItem) && decimal(c.existingItem.itemId) && int(c.existingItem.priceCents)))) return null;
  const observations = c.observations.map(observation);
  const variants = c.variants.map(variant), samples = c.samples.map(parseSourceSample);
  if (observations.some(o => o === null) || variants.some(v => v === null) || samples.some(s => s === null)) return null;
  return { ...(c as CandidateDetail), variants: variants as Variant[], samples: samples as SourceSample[], observations: observations as Observation[] };
}

export function parseDraftResults(value: unknown, accountId: string, keys: string[]): DraftResult[] | null {
  const body = envelope(value, accountId, ["results", "created", "failed"]);
  if (!body || !Array.isArray(body.results) || body.results.length !== keys.length) return null;
  const results = body.results.map((r, index) => {
    if (!object(r) || r.commandKey !== keys[index]) return null;
    if (r.ok === true && decimal(r.itemId) && int(r.priceCents)) return { commandKey: keys[index], ok: true as const, itemId: r.itemId, priceCents: r.priceCents, sourceAt: date(r.sourceAt) ? r.sourceAt : null };
    if (r.ok === false && text(r.code, 64) && text(r.error, 300)) return { commandKey: keys[index], ok: false as const, code: r.code, error: r.error };
    return null;
  });
  return results.some(r => r === null) ? null : results as DraftResult[];
}

/** Client request bodies. The server adds actor and command keys. */
export function validJobRequest(value: unknown): value is { requestId: string; mode: "inventory" | "refresh"; sources: { fanId: string; messageId: string }[] | null } {
  if (!object(value) || !exact(value, ["requestId", "mode", "sources"]) || !uuid(value.requestId)) return false;
  if (value.mode === "inventory") return value.sources === null;
  return value.mode === "refresh" && Array.isArray(value.sources) && value.sources.length >= 1 && value.sources.length <= MAX_REFRESH_SOURCES &&
    value.sources.every(s => object(s) && exact(s, ["fanId", "messageId"]) && decimal(s.fanId) && decimal(s.messageId));
}

export function validDraft(value: unknown): value is DraftInput {
  return object(value) && exact(value, ["observationId", "expectedFingerprint", "label", "description", "reuseConfirmed", "descriptionApproved"]) &&
    uuid(value.observationId) && hash(value.expectedFingerprint) && text(value.label, 160) && !!(value.label as string).trim() &&
    text(value.description, 2000) && !!(value.description as string).trim() && value.reuseConfirmed === true && value.descriptionApproved === true;
}

export function validDraftRequest(value: unknown): value is { drafts: DraftInput[] } {
  return object(value) && exact(value, ["drafts"]) && Array.isArray(value.drafts) && value.drafts.length >= 1 &&
    value.drafts.length <= MAX_DRAFTS && value.drafts.every(validDraft);
}

export function validCancelRequest(value: unknown): value is { expectedRevision: number } {
  return object(value) && exact(value, ["expectedRevision"]) && int(value.expectedRevision) && (value.expectedRevision as number) >= 1;
}

export const REASON_LABELS: Record<string, string> = {
  previews_unknown: "Free previews unknown. Refresh source details.",
  locked_text_unknown: "Locked text unknown. Refresh source details.",
  locked_text: "Locked text offers are not supported yet.",
  too_many_attachments: "More than 20 attachments.",
  price_out_of_range: "Price is outside USD 3 to 200.",
  no_paid_content: "Every attachment is a free preview.",
  unsupported_previews: "Preview format not supported.",
  video_preview: "Video free previews are not supported yet.",
  asset_missing: "An attachment is missing from the vault.",
  asset_removed: "An attachment was removed from the vault.",
  asset_unsupported_kind: "Audio, GIF or another unsupported file.",
  asset_unverified_owner: "Sync the vault to verify attachments.",
  asset_readiness_unknown: "Attachment readiness unknown.",
  asset_not_ready: "An attachment is still processing.",
  superseded_source: "This source changed or was removed on OnlyFans. This older observation cannot be used to create a draft.",
};
export const STATUS_LABELS: Record<CandidateSummary["status"] | string, string> = {
  ready_for_review: "Ready for review", source_details_needed: "Source details needed", blocked: "Blocked",
  draft_created: "Draft created", pending: "Queued", running: "Scanning", complete: "Complete", partial: "Partial",
  failed: "Failed", cancelled: "Cancelled", superseded: "Stopped, connection changed",
};
export const usd = (cents: number) => `USD ${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
