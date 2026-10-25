/** of-content-sync.v1 contract: strict parsers for every backend response and
 * exact request builders. The dashboard never supplies an actor or a command
 * key; the server route derives both. Hashes (fingerprints, file digests) are
 * request material only and are never displayed. */
export const SYNC_SCHEMA = "of-content-sync.v1";
export const SYNC_HEADER = "X-OnlyFans-Content-Sync-Version";
export const SYNC_CHUNK_BYTES = 8 * 1024 * 1024;
export const MAX_SYNC_FILES = 20;
/** The browser hashes a whole file with crypto.subtle, which cannot stream. */
export const MAX_SYNC_FILE_BYTES = 1024 ** 3;
export const MAX_SYNC_PAGE = 50;
export const MAX_SYNC_JSON_BYTES = 131_072;

export const SYNC_STATUSES = ["off", "active", "paused_auth", "blocked"] as const;
export const COVERAGE_STATES = ["current", "delayed", "partial", "not_started", "unsupported"] as const;
export const COVERAGE_SOURCES = ["media", "paidMessages", "paidPosts"] as const;
export const DRAFT_STATES = ["draft", "queued", "uploading", "verifying", "synced", "retrying", "connection_required", "needs_review", "outcome_unconfirmed"] as const;
export const OPERATION_KINDS = ["initial", "incremental", "reconcile", "sync_now", "upload", "retry"] as const;
export const OPERATION_STATUSES = ["queued", "running", "complete", "partial", "failed", "cancelled", "outcome_unconfirmed"] as const;
export const RESOLUTIONS = ["accept_source", "keep_crm", "disable"] as const;
export const SOURCE_ISSUES = ["post_deleted", "post_no_longer_paid", "source_retracted", "source_terms_unusable"] as const;
export const CONFLICT_KINDS = ["source_changed", "source_unusable", "post_deleted", "post_free", "source_retracted"] as const;
export const SYNC_FAILURE_CODES = ["invalid_sync_request", "unsupported_schema", "unauthorized", "not_available", "connection_unavailable",
  "revision_conflict", "idempotency_conflict", "sync_conflict", "outcome_unconfirmed", "sync_unavailable"] as const;

export type SyncStatusName = typeof SYNC_STATUSES[number];
export type CoverageState = typeof COVERAGE_STATES[number];
export type DraftState = typeof DRAFT_STATES[number];
export type Resolution = typeof RESOLUTIONS[number];
export type CoverageEntry = { state: CoverageState; checkedAt: string | null; detail: string | null };
export type SyncState = {
  enabled: boolean; status: SyncStatusName; revision: number; blockedReason: string | null;
  lastIncrementalAt: string | null; nextIncrementalAt: string | null; lastReconcileAt: string | null; nextReconcileAt: string | null;
  lastFullReconcileAt: string | null; coveredThroughMessageId: string | null; backlog: number;
  initial: { jobId: string | null; status: string; rowsScanned: number; complete: boolean } | null;
  coverage: { media: CoverageEntry; paidMessages: CoverageEntry; paidPosts: CoverageEntry };
  openConflicts: number;
  uploads: { draft: number; queued: number; uploading: number; verifying: number; synced: number; retrying: number;
    connectionRequired: number; needsReview: number; outcomeUnconfirmed: number };
};
export type SyncOperation = {
  operationId: string; kind: typeof OPERATION_KINDS[number]; status: typeof OPERATION_STATUSES[number];
  createdAt: string | null; updatedAt: string | null; completedAt: string | null;
  coverage: Record<string, unknown> | null; result: Record<string, unknown> | null; lastError: string | null;
  retryable: boolean; draftId: string | null; assetId: string | null;
};
export type ConflictTerms = { priceCents: number; mediaCount: number; previewCount: number; sourceAt: string | null };
export type SyncConflict = {
  conflictId: string; itemId: string; revision: number; status: "open" | "resolved"; createdAt: string | null;
  current: ConflictTerms; source: ConflictTerms & { lockedText: boolean | null };
  itemFingerprint: string; resolution: Resolution | null; resolvedAt: string | null;
  kind?: typeof CONFLICT_KINDS[number]; sourceIssue?: typeof SOURCE_ISSUES[number] | null;
};
export type DraftAsset = { assetId: string; fileId: string; name: string; kind: "photo" | "video"; order: number;
  freePreview: boolean; state: DraftState; attempts: number; lastError: string | null };
export type SyncDraft = {
  draftId: string; revision: number; state: DraftState; reason: string | null; label: string; description: string;
  priceCents: number; pricingMode: "fixed"; itemId: string | null; enabled: boolean; assets: DraftAsset[];
  readiness: { mediaSynced: boolean; canEnable: boolean; blockers: string[] };
};
export type ChunkAck = { received: number; complete: boolean };
export type CommandRecord = { commandKey: string; recorded: boolean; action: string | null };
export type SyncFailureCode = typeof SYNC_FAILURE_CODES[number];

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).sort().join(",") === [...keys].sort().join(",");
const int = (value: unknown, max = 2 ** 31 - 1): value is number => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= max;
const hash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const decimal = (value: unknown): value is string => typeof value === "string" && /^[1-9][0-9]{0,18}$/.test(value);
const code = (value: unknown): value is string => typeof value === "string" && /^[a-z0-9_]{1,80}$/.test(value);
const text = (value: unknown, max: number): value is string => typeof value === "string" && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value) &&
  value.isWellFormed() && new TextEncoder().encode(value).length <= max;
/** Opaque IDs are strings. Reject dot-leading values so a path segment can never become "." or "..". */
export const syncId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-][A-Za-z0-9_.:-]{0,63}$/.test(value);
export const syncCommandKey = hash;
export const syncFileId = uuid;
const stamp = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z$/.test(value) && Number.isFinite(Date.parse(value));
const maybeStamp = (value: unknown): value is string | null => value === null || stamp(value);
const maybeCode = (value: unknown): value is string | null => value === null || code(value);
const oneOf = <T extends readonly string[]>(list: T, value: unknown): value is T[number] => typeof value === "string" && (list as readonly string[]).includes(value);
const bounded = (value: unknown): value is Record<string, unknown> | null => value === null || (object(value) && JSON.stringify(value).length <= 8192);

/** Every response is {schemaVersion, ok, ...}. accountId is documented on status only; when present it must match. */
function envelope(value: unknown, accountId: string, keys: string[], requireAccount = false): Record<string, unknown> | null {
  if (!object(value) || value.schemaVersion !== SYNC_SCHEMA || value.ok !== true) return null;
  const withAccount = "accountId" in value;
  if (requireAccount && !withAccount) return null;
  if (withAccount && value.accountId !== accountId) return null;
  return exact(value, ["schemaVersion", "ok", ...(withAccount ? ["accountId"] : []), ...keys]) ? value : null;
}

function coverageEntry(value: unknown): CoverageEntry | null {
  if (!object(value) || !exact(value, ["state", "checkedAt", "detail"]) || !oneOf(COVERAGE_STATES, value.state) ||
    !maybeStamp(value.checkedAt) || !(value.detail === null || text(value.detail, 300))) return null;
  return value as CoverageEntry;
}

export function parseSyncState(value: unknown): SyncState | null {
  if (!object(value) || !exact(value, ["enabled", "status", "revision", "blockedReason", "lastIncrementalAt", "nextIncrementalAt", "lastReconcileAt",
    "nextReconcileAt", "lastFullReconcileAt", "coveredThroughMessageId", "backlog", "initial", "coverage", "openConflicts", "uploads"]) ||
    typeof value.enabled !== "boolean" || !oneOf(SYNC_STATUSES, value.status) || !int(value.revision) || !maybeCode(value.blockedReason) ||
    !["lastIncrementalAt", "nextIncrementalAt", "lastReconcileAt", "nextReconcileAt", "lastFullReconcileAt"].every(k => maybeStamp(value[k])) ||
    !(value.coveredThroughMessageId === null || decimal(value.coveredThroughMessageId)) || !int(value.backlog) || !int(value.openConflicts)) return null;
  const initial = value.initial;
  if (initial !== null && !(object(initial) && exact(initial, ["jobId", "status", "rowsScanned", "complete"]) &&
    (initial.jobId === null || syncId(initial.jobId)) && code(initial.status) && int(initial.rowsScanned) && typeof initial.complete === "boolean")) return null;
  const coverage = value.coverage;
  if (!object(coverage) || !exact(coverage, [...COVERAGE_SOURCES])) return null;
  const entries = COVERAGE_SOURCES.map(source => coverageEntry(coverage[source]));
  if (entries.some(entry => entry === null)) return null;
  const uploads = value.uploads;
  if (!object(uploads) || !exact(uploads, ["draft", "queued", "uploading", "verifying", "synced", "retrying", "connectionRequired", "needsReview", "outcomeUnconfirmed"]) ||
    !Object.values(uploads).every(count => int(count))) return null;
  return value as SyncState;
}

export function parseStatusResponse(value: unknown, accountId: string): SyncState | null {
  const body = envelope(value, accountId, ["sync"], true);
  return body ? parseSyncState(body.sync) : null;
}
export const parseSettingsResponse = (value: unknown, accountId: string) => {
  const body = envelope(value, accountId, ["sync"]); return body ? parseSyncState(body.sync) : null;
};

export function parseOperation(value: unknown): SyncOperation | null {
  if (!object(value) || !exact(value, ["operationId", "kind", "status", "createdAt", "updatedAt", "completedAt", "coverage", "result", "lastError", "retryable", "draftId", "assetId"]) ||
    !syncId(value.operationId) || !oneOf(OPERATION_KINDS, value.kind) || !oneOf(OPERATION_STATUSES, value.status) ||
    !maybeStamp(value.createdAt) || !maybeStamp(value.updatedAt) || !maybeStamp(value.completedAt) || !bounded(value.coverage) || !bounded(value.result) ||
    !maybeCode(value.lastError) || typeof value.retryable !== "boolean" || !(value.draftId === null || syncId(value.draftId)) ||
    !(value.assetId === null || syncId(value.assetId))) return null;
  return value as SyncOperation;
}
export const parseOperationResponse = (value: unknown, accountId: string) => {
  const body = envelope(value, accountId, ["operation"]); return body ? parseOperation(body.operation) : null;
};
export function parseOperationsPage(value: unknown, accountId: string) {
  const body = envelope(value, accountId, ["items", "nextCursor"]);
  if (!body || !Array.isArray(body.items) || body.items.length > MAX_SYNC_PAGE || !(body.nextCursor === null || syncId(body.nextCursor))) return null;
  const items = body.items.map(parseOperation);
  return items.some(item => item === null) ? null : { items: items as SyncOperation[], nextCursor: body.nextCursor as string | null };
}

function terms(value: unknown, source: boolean): (ConflictTerms & { lockedText?: boolean | null }) | null {
  if (!object(value) || !exact(value, ["priceCents", "mediaCount", "previewCount", "sourceAt", ...(source ? ["lockedText"] : [])]) ||
    !int(value.priceCents, 100_000_000) || !int(value.mediaCount, 1000) || !int(value.previewCount, 1000) || !maybeStamp(value.sourceAt) ||
    (source && !(value.lockedText === null || typeof value.lockedText === "boolean"))) return null;
  return value as ConflictTerms;
}
export function parseConflict(value: unknown): SyncConflict | null {
  if (!object(value) || !exact(value, ["conflictId", "itemId", "revision", "status", "createdAt", "current", "source", "itemFingerprint", "resolution", "resolvedAt", ...("kind" in value ? ["kind", "sourceIssue"] : [])]) ||
    !syncId(value.conflictId) || !decimal(value.itemId) || !int(value.revision) || !["open", "resolved"].includes(value.status as string) ||
    !maybeStamp(value.createdAt) || !terms(value.current, false) || !terms(value.source, true) || !hash(value.itemFingerprint) ||
    !(value.resolution === null || oneOf(RESOLUTIONS, value.resolution)) || !maybeStamp(value.resolvedAt) ||
    ("kind" in value && (!oneOf(CONFLICT_KINDS,value.kind) || !(value.sourceIssue === null || oneOf(SOURCE_ISSUES,value.sourceIssue))))) return null;
  return value as SyncConflict;
}
export function parseConflictsResponse(value: unknown, accountId: string): SyncConflict[] | null {
  const body = envelope(value, accountId, ["items"]);
  if (!body || !Array.isArray(body.items) || body.items.length > 200) return null;
  const items = body.items.map(parseConflict);
  return items.some(item => item === null) ? null : items as SyncConflict[];
}
export function parseResolveResponse(value: unknown, accountId: string): { conflict: SyncConflict; itemId: string } | null {
  const body = envelope(value, accountId, ["conflict", "itemId"]);
  const conflict = body ? parseConflict(body.conflict) : null;
  return body && conflict && decimal(body.itemId) && body.itemId === conflict.itemId ? { conflict, itemId: body.itemId } : null;
}

function asset(value: unknown): DraftAsset | null {
  if (!object(value) || !exact(value, ["assetId", "fileId", "name", "kind", "order", "freePreview", "state", "attempts", "lastError"]) ||
    !syncId(value.assetId) || !uuid(value.fileId) || !text(value.name, 240) || !["photo", "video"].includes(value.kind as string) ||
    !int(value.order, 1000) || typeof value.freePreview !== "boolean" || !oneOf(DRAFT_STATES, value.state) || !int(value.attempts, 10_000) ||
    !maybeCode(value.lastError)) return null;
  return value as DraftAsset;
}
export function parseDraft(value: unknown): SyncDraft | null {
  if (!object(value) || !exact(value, ["draftId", "revision", "state", "reason", "label", "description", "priceCents", "pricingMode", "itemId", "enabled", "assets", "readiness"]) ||
    !syncId(value.draftId) || !int(value.revision) || !oneOf(DRAFT_STATES, value.state) || !maybeCode(value.reason) || !text(value.label, 160) ||
    !text(value.description, 2000) || !int(value.priceCents, 20_000) || value.pricingMode !== "fixed" || !(value.itemId === null || decimal(value.itemId)) ||
    typeof value.enabled !== "boolean" || !Array.isArray(value.assets) || value.assets.length > MAX_SYNC_FILES) return null;
  const assets = value.assets.map(asset);
  const readiness = value.readiness;
  if (assets.some(item => item === null) || new Set((assets as DraftAsset[]).map(item => item.fileId)).size !== assets.length ||
    !object(readiness) || !exact(readiness, ["mediaSynced", "canEnable", "blockers"]) || typeof readiness.mediaSynced !== "boolean" ||
    typeof readiness.canEnable !== "boolean" || !Array.isArray(readiness.blockers) || readiness.blockers.length > 50 || !readiness.blockers.every(code)) return null;
  // A draft is never enableable unless every asset is verified and the item exists.
  if (readiness.canEnable && (!readiness.mediaSynced || value.itemId === null || (assets as DraftAsset[]).some(item => item.state !== "synced"))) return null;
  return value as SyncDraft;
}
export const parseDraftResponse = (value: unknown, accountId: string) => {
  const body = envelope(value, accountId, ["draft"]); return body ? parseDraft(body.draft) : null;
};
export function parseDraftsPage(value: unknown, accountId: string) {
  const body = envelope(value, accountId, ["items", "nextCursor"]);
  if (!body || !Array.isArray(body.items) || body.items.length > MAX_SYNC_PAGE || !(body.nextCursor === null || syncId(body.nextCursor))) return null;
  const items = body.items.map(parseDraft);
  return items.some(item => item === null) ? null : { items: items as SyncDraft[], nextCursor: body.nextCursor as string | null };
}
export function parseChunkResponse(value: unknown, accountId: string): ChunkAck | null {
  const body = envelope(value, accountId, ["received", "complete"]);
  return body && int(body.received, 2 ** 40) && typeof body.complete === "boolean" ? { received: body.received as number, complete: body.complete } : null;
}
export function parseCommandResponse(value: unknown, accountId: string): CommandRecord | null {
  const body = envelope(value, accountId, ["command"]);
  if (!body || !object(body.command) || !hash(body.command.commandKey) || typeof body.command.recorded !== "boolean" ||
    Object.keys(body.command).length > 20 || !(body.command.action === undefined || code(body.command.action))) return null;
  return { commandKey: body.command.commandKey, recorded: body.command.recorded, action: (body.command.action as string | undefined) ?? null };
}
/** Failure bodies are {ok:false, code, error}. Only the known code is trusted; backend prose is never shown. */
export function parseFailureCode(value: unknown): SyncFailureCode | null {
  return object(value) && value.ok === false && oneOf(SYNC_FAILURE_CODES, value.code) ? value.code : null;
}

/** Client request bodies. Each carries a requestId; the server derives actor and commandKey. */
export type SettingsRequest = { requestId: string; enabled: boolean; expectedRevision: number };
export type SyncNowRequest = { requestId: string; kind: "incremental" | "reconcile" };
export type RetryRequest = { requestId: string };
export type ResolveRequest = { requestId: string; resolution: Resolution; expectedRevision: number; expectedItemFingerprint: string };
export type DraftFileInput = { fileId: string; name: string; size: number; sha256: string };
export type DraftRequest = { requestId: string; label: string; description: string; priceCents: number; files: DraftFileInput[]; previewFileIds: string[] };
export type CommitRequest = { requestId: string };

export const validSettingsRequest = (value: unknown): value is SettingsRequest =>
  object(value) && exact(value, ["requestId", "enabled", "expectedRevision"]) && uuid(value.requestId) && typeof value.enabled === "boolean" && int(value.expectedRevision);
export const validSyncNowRequest = (value: unknown): value is SyncNowRequest =>
  object(value) && exact(value, ["requestId", "kind"]) && uuid(value.requestId) && (value.kind === "incremental" || value.kind === "reconcile");
export const validRetryRequest = (value: unknown): value is RetryRequest => object(value) && exact(value, ["requestId"]) && uuid(value.requestId);
export const validCommitRequest = validRetryRequest as (value: unknown) => value is CommitRequest;
export const validResolveRequest = (value: unknown): value is ResolveRequest =>
  object(value) && exact(value, ["requestId", "resolution", "expectedRevision", "expectedItemFingerprint"]) && uuid(value.requestId) &&
  oneOf(RESOLUTIONS, value.resolution) && int(value.expectedRevision) && hash(value.expectedItemFingerprint);
export function validDraftRequest(value: unknown): value is DraftRequest {
  if (!object(value) || !exact(value, ["requestId", "label", "description", "priceCents", "files", "previewFileIds"]) || !uuid(value.requestId) ||
    !text(value.label, 160) || !value.label.trim() || !text(value.description, 2000) || !value.description.trim() ||
    !int(value.priceCents, 20_000) || value.priceCents < 300 || !Array.isArray(value.files) || !value.files.length || value.files.length > MAX_SYNC_FILES ||
    !Array.isArray(value.previewFileIds) || value.previewFileIds.length >= value.files.length) return false;
  const files = value.files as unknown[];
  const ids = new Set<string>();
  const valid = files.every(file => object(file) && exact(file, ["fileId", "name", "size", "sha256"]) && uuid(file.fileId) && !ids.has(file.fileId) && !!ids.add(file.fileId) &&
    text(file.name, 240) && !!file.name && !/[\\/]/.test(file.name) && int(file.size, MAX_SYNC_FILE_BYTES) && file.size >= 1 && hash(file.sha256));
  return valid && new Set(value.previewFileIds).size === value.previewFileIds.length && value.previewFileIds.every(id => typeof id === "string" && ids.has(id));
}

/** Exact backend commands. Unknown keys are impossible by construction. */
export type Identity = { commandKey: string; actor: string };
export const settingsCommand = (body: SettingsRequest, id: Identity) => ({ enabled: body.enabled, expectedRevision: body.expectedRevision, commandKey: id.commandKey, actor: id.actor });
export const syncNowCommand = (body: SyncNowRequest, id: Identity) => ({ kind: body.kind, commandKey: id.commandKey, actor: id.actor });
export const retryCommand = (id: Identity) => ({ commandKey: id.commandKey, actor: id.actor });
export const commitCommand = retryCommand;
export const resolveCommand = (body: ResolveRequest, id: Identity) => ({ resolution: body.resolution, expectedRevision: body.expectedRevision,
  expectedItemFingerprint: body.expectedItemFingerprint, commandKey: id.commandKey, actor: id.actor });
export const draftCommand = (body: DraftRequest, id: Identity) => ({ commandKey: id.commandKey, actor: id.actor, label: body.label.trim(), description: body.description.trim(),
  priceCents: body.priceCents, files: body.files.map(f => ({ fileId: f.fileId, name: f.name, size: f.size, sha256: f.sha256 })), previewFileIds: [...body.previewFileIds] });
export function chunkIndex(value: string): number | null { return /^(?:0|[1-9][0-9]{0,4})$/.test(value) && Number(value) < 50_000 ? Number(value) : null; }

/** Plain-word labels. Unknown codes fall back to "Needs review", never to raw codes. */
export const DRAFT_STATE_LABELS: Record<DraftState, string> = {
  draft: "Preparing", queued: "Queued", uploading: "Uploading", verifying: "Checking on OnlyFans", synced: "Media synced to OnlyFans",
  retrying: "Retrying", connection_required: "Connection required", needs_review: "Needs review", outcome_unconfirmed: "Outcome not confirmed",
};
export const COVERAGE_LABELS: Record<CoverageState, string> = {
  current: "Up to date", delayed: "Delayed", partial: "Partly checked", not_started: "Not started", unsupported: "Unsupported",
};
export const COVERAGE_SOURCE_LABELS: Record<typeof COVERAGE_SOURCES[number], string> = { media: "Media", paidMessages: "Paid messages", paidPosts: "Paid posts" };
export const SYNC_STATUS_LABELS: Record<SyncStatusName, string> = { off: "Off", active: "On", paused_auth: "Connection required", blocked: "Needs review" };
export const UNPUBLISHED_UPLOAD_UNAVAILABLE = "OnlyFans upload without posting isn't available yet. Nothing was posted or sent.";
export const MEDIA_SYNC_NOTE = "Media synced to OnlyFans only means the files are in the OnlyFans vault. It does not switch the item on, message a fan or publish a post.";
export const REASON_LABELS_SYNC: Record<string, string> = {
  unpublished_upload_unavailable: UNPUBLISHED_UPLOAD_UNAVAILABLE,
  connection_unavailable: "Connection required. Reconnect this OnlyFans account, then retry.",
  auth_required: "Connection required. Reconnect this OnlyFans account, then retry.",
  upload_unknown: "Outcome not confirmed. Check the vault before retrying.",
  media_unusable: "OnlyFans could not use this file. Choose another file.",
  unsupported_media: "Unsupported file type.",
  media_not_synced: "Not every file is synced to OnlyFans yet.",
  assets_incomplete: "Not every file is synced to OnlyFans yet.",
  source_conflict: "The OnlyFans terms changed. Review them before switching this item on.",
  open_conflict: "The OnlyFans terms changed. Review them before switching this item on.",
};
export const reasonLabel = (reason: string | null) => reason === null ? null : REASON_LABELS_SYNC[reason] ?? "Needs review.";
export const FAILURE_MESSAGES: Record<SyncFailureCode, string> = {
  invalid_sync_request: "That sync request was not accepted. Review the values and try again.",
  unsupported_schema: "The sync service version does not match this dashboard.",
  unauthorized: "Content sync is unavailable right now. Try again shortly.",
  not_available: "That sync item is not available.",
  connection_unavailable: "Connection required. Reconnect this OnlyFans account, then try again.",
  revision_conflict: "This item changed. Review the refreshed values before deciding again.",
  idempotency_conflict: "That command was already used with different details. Start the action again.",
  sync_conflict: "The source terms changed again. Review the refreshed terms.",
  outcome_unconfirmed: "Outcome not confirmed. Retry the same request.",
  sync_unavailable: "Content sync is unavailable right now. Try again shortly.",
};
