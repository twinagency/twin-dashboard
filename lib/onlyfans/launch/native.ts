/** Validated projections of the native configuration-purpose launch contracts. */
import {
  FACT_KEYS,
  type FactKey,
  validConfigurationRequest,
} from "../configuration";

export const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export const text = (v: unknown, max = 4096): v is string =>
  typeof v === "string" && v.length <= max;
export const count = (v: unknown): v is number =>
  Number.isSafeInteger(v) && (v as number) >= 0;
export const nullableText = (v: unknown, max = 4096): v is string | null =>
  v === null || text(v, max);
export const timestamp = (v: unknown): v is string | null =>
  v === null || (text(v, 64) && Number.isFinite(Date.parse(v)));
export const hash = (v: unknown): v is string =>
  text(v, 64) && /^[a-f0-9]{64}$/.test(v);
export const decimalId = (v: unknown): v is string =>
  text(v, 18) && /^[1-9][0-9]{0,17}$/.test(v);
const strings = (v: unknown, max = 500, width = 4096): v is string[] =>
  Array.isArray(v) && v.length <= max && v.every((x) => text(x, width));
const array = <T>(
  v: unknown,
  parse: (x: unknown) => x is T,
  max = 500,
): v is T[] => Array.isArray(v) && v.length <= max && v.every(parse);
const facts = (v: unknown) =>
  object(v) &&
  Object.entries(v).every(
    ([k, x]) =>
      (FACT_KEYS as readonly string[]).includes(k) && nullableText(x, 16000),
  );
export type PersonalityReview = {
  persona?: string;
  creatorFacts?: Partial<Record<FactKey, string | null>>;
  defaultModel?: string;
  replyModelOverride?: string | null;
};
export function validReview(v: unknown): v is PersonalityReview {
  return (
    object(v) &&
    Object.keys(v).length > 0 &&
    Object.keys(v).every((k) =>
      [
        "persona",
        "creatorFacts",
        "defaultModel",
        "replyModelOverride",
      ].includes(k),
    ) &&
    validConfigurationRequest({
      patch: v,
      expectedRevision: 0,
      expectedFingerprint: "0".repeat(64),
    })
  );
}
type Conflict = { code: string; severity: "block"; message: string };
const conflict = (v: unknown): v is Conflict =>
  object(v) &&
  text(v.code, 160) &&
  v.severity === "block" &&
  text(v.message, 4096);
type Evidence = {
  id: string;
  sourceId: string;
  kind: "profile" | "outgoing_message";
  author: string;
  excerpt: string;
  truncated: boolean;
};
const evidence = (v: unknown): v is Evidence =>
  object(v) &&
  text(v.id, 200) &&
  text(v.sourceId, 200) &&
  ["profile", "outgoing_message"].includes(String(v.kind)) &&
  ["creator", "agency", "unknown", "automation", "profile"].includes(
    String(v.author),
  ) &&
  text(v.excerpt, 8192) &&
  typeof v.truncated === "boolean";
type Observation = {
  key: string;
  value: string;
  evidenceIds: string[];
  attribution: string;
  selected: false;
};
const observation = (v: unknown): v is Observation =>
  object(v) &&
  text(v.key, 160) &&
  text(v.value, 8192) &&
  strings(v.evidenceIds, 500, 200) &&
  ["creator", "agency", "unknown", "automation", "profile"].includes(
    String(v.attribution),
  ) &&
  v.selected === false;
export type PersonalityDraft = {
  creatorFacts: Observation[];
  writingStyle: Observation[];
  operationalInstructions: {
    text: string;
    evidenceIds: string[];
    attribution: string;
    selected: false;
    conflicts: Conflict[];
    includedInConfiguration: false;
  }[];
  suggestedPersona: {
    text: string;
    attribution: string | null;
    evidenceIds: string[];
    selected: false;
    requiresReview: true;
    basis: string;
    warning: string | null;
  };
  evidence: Evidence[];
  coverage: {
    inputMessages: number;
    uniqueMessages: number;
    sampledMessages: number;
    authorship: Record<string, number>;
    method: string;
    limitations: string[];
    fullHistoryCoverage?: false;
    olderRowsNotScanned?: boolean;
  };
};
export type Personality = {
  version: "of-personality.v1";
  state: "empty" | "draft" | "approved";
  revision: number;
  bindingId: string;
  document: null | {
    draft: PersonalityDraft;
    review: PersonalityReview;
    source: string;
    approval?: {
      acknowledgements: {
        mixedAuthorship: true;
        runtimeRules: true;
        factsVerified: true;
      };
      configurationCommandKey: string;
      appliedConfigurationRevision: number;
    };
  };
  configurationRevision?: number;
  configurationCurrent?: boolean;
  configurationFingerprint?: string;
  conflicts?: Conflict[];
  requiresFactResolution?: FactKey[];
  factComparisons?: {
    key: FactKey;
    current: string | null;
    proposed: string | null;
    changed: boolean;
  }[];
  readiness?: {
    ready: boolean;
    reviewRequired: true;
    blockers: string[];
    model: {
      state: string;
      modelId: string | null;
      provider: string | null;
      reasoningEffort: {
        state: string;
        saved: string | null;
        resolved: string | null;
      };
    };
    credential: {
      state: string;
      configured: boolean;
      metadataAvailable: boolean;
    };
    budget: { state: string; dailyCostCapCents: number | null };
    tone: { state: string; conflicts: Conflict[]; reviewRequired: true };
  };
  createdAt?: string;
  actor?: string;
  commandKey?: string;
};
const acknowledgements = (v: unknown) =>
  object(v) &&
  Object.keys(v).length === 3 &&
  v.mixedAuthorship === true &&
  v.runtimeRules === true &&
  v.factsVerified === true;
export function parseNativePersonality(v: unknown): Personality | null {
  if (
    !object(v) ||
    v.version !== "of-personality.v1" ||
    !count(v.revision) ||
    !text(v.bindingId, 64) ||
    !["empty", "draft", "approved"].includes(String(v.state))
  )
    return null;
  if (v.state === "empty")
    return v.document === null ? (v as Personality) : null;
  if (
    !object(v.document) ||
    !object(v.document.draft) ||
    !object(v.document.review) ||
    !["canonical_history", "authorized_export"].includes(
      String(v.document.source),
    ) ||
    (Object.keys(v.document.review).length !== 0 &&
      !validReview(v.document.review))
  )
    return null;
  const d = v.document.draft,
    p = d.suggestedPersona,
    c = d.coverage,
    r = v.readiness;
  if (
    !array(d.creatorFacts, observation) ||
    d.creatorFacts.some(
      (x) =>
        !(FACT_KEYS as readonly string[]).includes(x.key) ||
        x.attribution !== "profile",
    ) ||
    !array(d.writingStyle, observation) ||
    !Array.isArray(d.operationalInstructions) ||
    d.operationalInstructions.length > 500 ||
    !d.operationalInstructions.every(
      (x) =>
        object(x) &&
        text(x.text, 8192) &&
        strings(x.evidenceIds, 500, 200) &&
        text(x.attribution, 32) &&
        x.selected === false &&
        x.includedInConfiguration === false &&
        array(x.conflicts, conflict),
    ) ||
    !object(p) ||
    !text(p.text, 4096) ||
    !nullableText(p.attribution, 32) ||
    !strings(p.evidenceIds, 500, 200) ||
    p.selected !== false ||
    p.requiresReview !== true ||
    p.basis !== "observed_account_style" ||
    !nullableText(p.warning) ||
    !array(d.evidence, evidence) ||
    !object(c) ||
    !count(c.inputMessages) ||
    !count(c.uniqueMessages) ||
    !count(c.sampledMessages) ||
    !object(c.authorship) ||
    !["creator", "agency", "unknown", "automation"].every(
      (k) => object(c.authorship) && count(c.authorship[k]),
    ) ||
    !text(c.method) ||
    !strings(c.limitations) ||
    !count(v.configurationRevision) ||
    !hash(v.configurationFingerprint) ||
    typeof v.configurationCurrent !== "boolean" ||
    !array(v.conflicts, conflict) ||
    !strings(v.requiresFactResolution, FACT_KEYS.length, 40) ||
    v.requiresFactResolution.some(
      (x) => !(FACT_KEYS as readonly string[]).includes(x),
    ) ||
    !Array.isArray(v.factComparisons) ||
    !v.factComparisons.every(
      (x) =>
        object(x) &&
        (FACT_KEYS as readonly unknown[]).includes(x.key) &&
        nullableText(x.current, 16000) &&
        nullableText(x.proposed, 16000) &&
        typeof x.changed === "boolean",
    ) ||
    !object(r) ||
    typeof r.ready !== "boolean" ||
    r.reviewRequired !== true ||
    !strings(r.blockers) ||
    !object(r.model) ||
    !text(r.model.state, 64) ||
    !nullableText(r.model.modelId, 160) ||
    !nullableText(r.model.provider, 160) ||
    !object(r.model.reasoningEffort) ||
    !text(r.model.reasoningEffort.state, 64) ||
    !nullableText(r.model.reasoningEffort.saved, 64) ||
    !nullableText(r.model.reasoningEffort.resolved, 64) ||
    !object(r.credential) ||
    !text(r.credential.state, 64) ||
    typeof r.credential.configured !== "boolean" ||
    typeof r.credential.metadataAvailable !== "boolean" ||
    (r.ready && (!r.credential.configured || !r.credential.metadataAvailable)) ||
    !object(r.budget) ||
    !text(r.budget.state, 64) ||
    !(
      r.budget.dailyCostCapCents === null || count(r.budget.dailyCostCapCents)
    ) ||
    !object(r.tone) ||
    !text(r.tone.state, 64) ||
    r.tone.reviewRequired !== true ||
    !array(r.tone.conflicts, conflict) ||
    !timestamp(v.createdAt) ||
    v.createdAt === null ||
    !text(v.actor, 128) ||
    !hash(v.commandKey)
  )
    return null;
  if (
    (v.state === "approved") !== (v.document.approval !== undefined) ||
    v.document.approval !== undefined &&
    (!object(v.document.approval) ||
      !acknowledgements(v.document.approval.acknowledgements) ||
      !hash(v.document.approval.configurationCommandKey) ||
      !count(v.document.approval.appliedConfigurationRevision))
  )
    return null;
  return v as Personality;
}
export type PersonalityHistory = {
  revisions: {
    revision: number;
    state: "draft" | "approved";
    actor: string;
    createdAt: string;
  }[];
  nextBefore: number | null;
};
export function parsePersonalityHistory(v: unknown): PersonalityHistory | null {
  if (
    !object(v) ||
    !Array.isArray(v.revisions) ||
    v.revisions.length > 20 ||
    !v.revisions.every(
      (x) =>
        object(x) &&
        count(x.revision) &&
        x.revision > 0 &&
        ["draft", "approved"].includes(String(x.state)) &&
        text(x.actor, 128) &&
        timestamp(x.createdAt) &&
        x.createdAt !== null,
    ) ||
    !(v.nextBefore === null || (count(v.nextBefore) && v.nextBefore > 0))
  )
    return null;
  return v as PersonalityHistory;
}
export const MEMORY_FIELDS = [
  "real_name",
  "his_age",
  "home_city",
  "home_country",
  "hobbies",
  "occupation",
  "fetishes",
  "short_bio",
  "bullet_points",
] as const;
export type MemoryField = (typeof MEMORY_FIELDS)[number];
export const memoryField = (v: unknown): v is MemoryField =>
  (MEMORY_FIELDS as readonly unknown[]).includes(v);
export type NativeMemory = {
  schemaVersion: "of-history-memory.v1";
  algorithm: string;
  revision: number;
  version: string;
  canonicalDigest: string;
  fingerprint: string;
  facts: Record<
    string,
    {
      value: string;
      source: "operator" | "canonical" | "history";
      revision?: number;
      sourceMessageId?: string;
      sourceAt?: string;
      quote?: string;
      sourceDigest?: string;
    }
  >;
  summaries: Record<string, string | null>;
  overrides: Record<string, { operation: "set" | "clear"; revision: number }>;
  interactions: {
    sourceMessageId: string;
    sourceAt: string;
    direction: "in" | "out";
    excerpt: string;
    sourceDigest: string;
  }[];
  summaryKind: "saved_profile_and_source_excerpts";
};
export function parseNativeMemory(v: unknown): NativeMemory | null {
  if (
    !object(v) ||
    v.schemaVersion !== "of-history-memory.v1" ||
    !text(v.algorithm, 64) ||
    !count(v.revision) ||
    !hash(v.version) ||
    !hash(v.canonicalDigest) ||
    !hash(v.fingerprint) ||
    v.summaryKind !== "saved_profile_and_source_excerpts" ||
    !object(v.facts) ||
    !object(v.summaries) ||
    !object(v.overrides) ||
    !Array.isArray(v.interactions) ||
    v.interactions.length > 8
  )
    return null;
  if (
    !Object.entries(v.facts).every(
      ([k, x]) =>
        memoryField(k) &&
        object(x) &&
        text(x.value, 600) &&
        ["operator", "canonical", "history"].includes(String(x.source)) &&
        (x.source !== "history" ||
          (decimalId(x.sourceMessageId) &&
            timestamp(x.sourceAt) &&
            text(x.quote, 1000) &&
            hash(x.sourceDigest))),
    ) ||
    !Object.entries(v.summaries).every(
      ([k, x]) =>
        ["short_bio", "bullet_points"].includes(k) && nullableText(x, 600),
    ) ||
    !Object.entries(v.overrides).every(
      ([k, x]) =>
        memoryField(k) &&
        object(x) &&
        ["set", "clear"].includes(String(x.operation)) &&
        count(x.revision),
    ) ||
    !v.interactions.every(
      (x) =>
        object(x) &&
        decimalId(x.sourceMessageId) &&
        timestamp(x.sourceAt) &&
        ["in", "out"].includes(String(x.direction)) &&
        text(x.excerpt, 320) &&
        hash(x.sourceDigest),
    )
  )
    return null;
  return v as NativeMemory;
}
export type MemoryFanPage = {
  fans: {
    fanId: string;
    displayName: string | null;
    username: string | null;
    storedMessages: number;
    processedMessages: number;
    memoryRevision: number;
    lastProcessedAt: string | null;
    archive: {
      status: string;
      pagesCompleted: number;
      messagesObserved: number;
      completedAt: string | null;
    } | null;
  }[];
  nextCursor: string | null;
};
export function parseMemoryFanPage(v: unknown): MemoryFanPage | null {
  if (
    !object(v) ||
    v.memoryVersion !== "of-history-memory.v1" ||
    !Array.isArray(v.fans) ||
    v.fans.length > 100 ||
    !nullableText(v.nextCursor, 2000) ||
    !v.fans.every(
      (x) =>
        object(x) &&
        decimalId(x.fanId) &&
        nullableText(x.displayName, 500) &&
        nullableText(x.username, 500) &&
        count(x.storedMessages) &&
        count(x.processedMessages) &&
        x.processedMessages <= x.storedMessages &&
        count(x.memoryRevision) &&
        timestamp(x.lastProcessedAt) &&
        (x.archive === null ||
          (object(x.archive) &&
            text(x.archive.status, 64) &&
            count(x.archive.pagesCompleted) &&
            count(x.archive.messagesObserved) &&
            timestamp(x.archive.completedAt))),
    )
  )
    return null;
  return { fans: v.fans as MemoryFanPage["fans"], nextCursor: v.nextCursor };
}
export type EngagementPolicy = {
  enabled: boolean;
  offers: boolean;
  follow_ups: boolean;
  reengagement: boolean;
  offer_delay_hours: number;
  follow_up_delay_hours: number;
  reengage_delay_hours: number;
  expiry_hours: number;
  fan_daily_limit: number;
  fan_weekly_limit: number;
  account_hourly_limit: number;
  account_daily_limit: number;
  unpaid_cooldown_hours: number;
  repeat_item_days: number;
  follow_up_text: string;
  reengage_text: string;
};
export const POLICY_LIMITS = {
  offer_delay_hours: [24, 168],
  follow_up_delay_hours: [24, 168],
  reengage_delay_hours: [168, 2160],
  expiry_hours: [1, 48],
  fan_daily_limit: [1, 8],
  fan_weekly_limit: [1, 14],
  account_hourly_limit: [1, 20],
  account_daily_limit: [1, 120],
  unpaid_cooldown_hours: [24, 720],
  repeat_item_days: [7, 365],
} as const;
export function validPolicy(v: unknown): v is EngagementPolicy {
  return (
    object(v) &&
    Object.keys(v).length === 16 &&
    ["enabled", "offers", "follow_ups", "reengagement"].every(
      (k) => typeof v[k] === "boolean",
    ) &&
    Object.entries(POLICY_LIMITS).every(
      ([k, [lo, hi]]) => count(v[k]) && v[k] >= lo && v[k] <= hi,
    ) &&
    Number(v.fan_weekly_limit) >= Number(v.fan_daily_limit) &&
    ["follow_up_text", "reengage_text"].every(
      (k) =>
        text(v[k], 1000) &&
        !!v[k].trim() &&
        new TextEncoder().encode(v[k]).length <= 1000,
    )
  );
}
export type EngagementSettings = {
  engagementVersion: "of-engagement.v1";
  revision: number;
  bindingCurrent: boolean;
  settings: EngagementPolicy;
};
export function parseEngagementSettings(v: unknown): EngagementSettings | null {
  return object(v) &&
    v.engagementVersion === "of-engagement.v1" &&
    count(v.revision) &&
    typeof v.bindingCurrent === "boolean" &&
    validPolicy(v.settings)
    ? (v as EngagementSettings)
    : null;
}
export const ACTION_STATUSES = [
  "scheduled",
  "queued",
  "dispatching",
  "accepted",
  "not_accepted",
  "unknown",
  "cancelled",
  "expired",
] as const;
export type EngagementAction = {
  actionId: string;
  kind: string;
  status: string;
  reason: string | null;
  fanId: string;
  dueAt: string;
  expiresAt: string;
  intentId: string | null;
  cancelRequested: boolean;
};
export function parseEngagementAction(v: unknown): EngagementAction | null {
  return object(v) &&
    text(v.actionId, 36) &&
    /^[a-f0-9-]{36}$/.test(v.actionId) &&
    text(v.kind, 64) &&
    (ACTION_STATUSES as readonly unknown[]).includes(v.status) &&
    nullableText(v.reason, 200) &&
    decimalId(v.fanId) &&
    timestamp(v.dueAt) &&
    v.dueAt !== null &&
    timestamp(v.expiresAt) &&
    v.expiresAt !== null &&
    nullableText(v.intentId, 100) &&
    typeof v.cancelRequested === "boolean"
    ? (v as EngagementAction)
    : null;
}
export type EngagementPage = {
  actions: EngagementAction[];
  nextCursor: string | null;
};
export function parseEngagementPage(v: unknown): EngagementPage | null {
  if (
    !object(v) ||
    v.engagementVersion !== "of-engagement.v1" ||
    !Array.isArray(v.actions) ||
    v.actions.length > 100 ||
    !nullableText(v.nextCursor, 2000)
  )
    return null;
  const actions = v.actions.map(parseEngagementAction);
  return actions.every((x): x is EngagementAction => x !== null)
    ? { actions, nextCursor: v.nextCursor }
    : null;
}
export type RecoveryProgress = {
  schemaVersion: "of-history-recovery.v1";
  accountId: string;
  fanId: string | null;
  status: "complete" | "incomplete";
  discoveryComplete: boolean;
  conversationsDiscovered: number;
  conversationsComplete: number;
  conversationsRetrying: number;
  conversationsDeferredForLiveInput: number;
  pagesCommitted: number;
  messagesObserved: number;
  messagesAdded: number;
  totalMessages: null;
  percentComplete: null;
  recentRecoveryNeeded: boolean;
  [key: string]: unknown;
};
export function parseRecoveryProgress(
  v: unknown,
  accountId: string,
  fanId: string | null = null,
): RecoveryProgress | null {
  return object(v) &&
    v.schemaVersion === "of-history-recovery.v1" &&
    v.accountId === accountId &&
    v.fanId === fanId &&
    ["complete", "incomplete"].includes(String(v.status)) &&
    typeof v.discoveryComplete === "boolean" &&
    [
      "conversationsDiscovered",
      "conversationsComplete",
      "conversationsRetrying",
      "conversationsDeferredForLiveInput",
      "pagesCommitted",
      "messagesObserved",
      "messagesAdded",
    ].every((k) => count(v[k])) &&
    v.totalMessages === null &&
    v.percentComplete === null &&
    typeof v.recentRecoveryNeeded === "boolean"
    ? (v as RecoveryProgress)
    : null;
}
export type MemoryProgress = {
  schemaVersion: "of-history-memory-progress.v1";
  algorithm: string;
  storedMessages: number;
  processedCurrentMessages: number;
  pendingMessages: number;
  storedMemoryComplete: boolean;
  providerHistoryComplete: null;
  revision: number;
  oldestStoredAt: string | null;
  newestStoredAt: string | null;
  lastProcessedAt: string | null;
};
export function parseMemoryProgress(v: unknown): MemoryProgress | null {
  return object(v) &&
    v.schemaVersion === "of-history-memory-progress.v1" &&
    text(v.algorithm, 64) &&
    count(v.storedMessages) &&
    count(v.processedCurrentMessages) &&
    count(v.pendingMessages) &&
    v.processedCurrentMessages + v.pendingMessages === v.storedMessages &&
    typeof v.storedMemoryComplete === "boolean" &&
    v.providerHistoryComplete === null &&
    count(v.revision) &&
    timestamp(v.oldestStoredAt) &&
    timestamp(v.newestStoredAt) &&
    timestamp(v.lastProcessedAt)
    ? (v as MemoryProgress)
    : null;
}
export type AccountControl = {
  enabled: boolean;
  bindingId: string;
  revision: number;
  unresolvedOutgoing: number;
  fingerprint: string;
};
const accountControl = (v: unknown): v is AccountControl =>
  object(v) &&
  typeof v.enabled === "boolean" &&
  text(v.bindingId, 64) &&
  count(v.revision) &&
  count(v.unresolvedOutgoing) &&
  hash(v.fingerprint);
export type NativeReadiness = {
  readinessVersion: "of-launch-readiness.v1";
  observedAt: string;
  schemaRevision: string;
  readyToEnable: boolean;
  checks: {
    key: string;
    status: "ready" | "blocked" | "running" | "unknown" | "disabled";
    blocking: boolean;
    observedAt: string;
    blocker: string | null;
    action: string | null;
  }[];
  accountControl: AccountControl;
  coverage: {
    storedMessages: number;
    processedMessages: number;
    providerTotalMessages: null;
    archiveComplete: boolean;
    pendingArchiveConversations: number;
  };
  catalogue: {
    usableInspectedItems: number;
    inspectedItems: number;
    hasMore: boolean;
  };
  autonomy: {
    accountEnabled: boolean;
    deliveryEnabled: boolean;
    existingAutomatedConversations: number;
    automateNewConversations: boolean;
    engagementEnabled: boolean;
    workerCapabilities: Record<string, boolean>;
  };
  limits: string[];
};
export function parseNativeReadiness(v: unknown): NativeReadiness | null {
  if (
    !object(v) ||
    v.readinessVersion !== "of-launch-readiness.v1" ||
    !timestamp(v.observedAt) ||
    v.observedAt === null ||
    !text(v.schemaRevision, 100) ||
    typeof v.readyToEnable !== "boolean" ||
    !Array.isArray(v.checks) ||
    v.checks.length > 100 ||
    !v.checks.every(
      (x) =>
        object(x) &&
        text(x.key, 100) &&
        ["ready", "blocked", "running", "unknown", "disabled"].includes(
          String(x.status),
        ) &&
        typeof x.blocking === "boolean" &&
        timestamp(x.observedAt) &&
        x.observedAt !== null &&
        nullableText(x.blocker, 200) &&
        nullableText(x.action, 100),
    ) ||
    !accountControl(v.accountControl) ||
    !object(v.coverage) ||
    !object(v.catalogue) ||
    !object(v.autonomy) ||
    !strings(v.limits, 50, 1000)
  )
    return null;
  const c = v.coverage,
    a = v.autonomy,
    k = v.catalogue;
  if (
    !count(c.storedMessages) ||
    !count(c.processedMessages) ||
    c.processedMessages > c.storedMessages ||
    c.providerTotalMessages !== null ||
    typeof c.archiveComplete !== "boolean" ||
    !count(c.pendingArchiveConversations) ||
    !count(k.usableInspectedItems) ||
    !count(k.inspectedItems) ||
    k.usableInspectedItems > k.inspectedItems ||
    typeof k.hasMore !== "boolean" ||
    ![
      "accountEnabled",
      "deliveryEnabled",
      "automateNewConversations",
      "engagementEnabled",
    ].every((x) => typeof a[x] === "boolean") ||
    !count(a.existingAutomatedConversations) ||
    !object(a.workerCapabilities) ||
    Object.keys(a.workerCapabilities).length > 30 ||
    !Object.values(a.workerCapabilities).every((x) => typeof x === "boolean")
  )
    return null;
  return v as NativeReadiness;
}
export type LedgerEvidence = {
  evidenceHash: string;
  providerTransactionId: string;
  fanId: string | null;
  transactionId: string | null;
  messageId: string | null;
  amountCents: number | null;
  currency: string | null;
  status: string | null;
  outcome: string;
  resolved: boolean;
  recordedAt: string;
  supportedAction: "reconcile_evidence" | null;
  blocker: string | null;
};
export type NativeLedger = {
  ledgerVersion: "of-ledger.v1";
  observedAt: string;
  bindingCurrent: boolean;
  status: string;
  windowStart: string | null;
  windowEnd: string | null;
  pageOffset: number | null;
  lastCompleteAt: string | null;
  lastFullAt: string | null;
  leaseUntil: string | null;
  activeLease: boolean;
  nextPollAt: string | null;
  lastError: string | null;
  updatedAt: string | null;
  fresh: boolean;
  unresolvedTransactions: number;
  conflictingEvidence: number;
  commerceHold: boolean;
  fingerprint: string;
  evidence: LedgerEvidence[];
  nextCursor: string | null;
};
export function parseNativeLedger(v: unknown): NativeLedger | null {
  if (
    !object(v) ||
    v.ledgerVersion !== "of-ledger.v1" ||
    !timestamp(v.observedAt) ||
    v.observedAt === null ||
    typeof v.bindingCurrent !== "boolean" ||
    !text(v.status, 64) ||
    ![
      "windowStart",
      "windowEnd",
      "lastCompleteAt",
      "lastFullAt",
      "leaseUntil",
      "nextPollAt",
      "updatedAt",
    ].every((k) => timestamp(v[k])) ||
    !(v.pageOffset === null || count(v.pageOffset)) ||
    !["activeLease", "fresh", "commerceHold"].every(
      (k) => typeof v[k] === "boolean",
    ) ||
    !nullableText(v.lastError, 300) ||
    !count(v.unresolvedTransactions) ||
    !count(v.conflictingEvidence) ||
    !hash(v.fingerprint) ||
    !nullableText(v.nextCursor, 2000) ||
    !Array.isArray(v.evidence) ||
    v.evidence.length > 100
  )
    return null;
  if (
    !v.evidence.every(
      (x) =>
        object(x) &&
        hash(x.evidenceHash) &&
        text(x.providerTransactionId, 200) &&
        ["fanId", "transactionId", "messageId"].every(
          (k) => x[k] === null || decimalId(x[k]),
        ) &&
        (x.amountCents === null || Number.isSafeInteger(x.amountCents)) &&
        nullableText(x.currency, 10) &&
        nullableText(x.status, 64) &&
        text(x.outcome, 100) &&
        typeof x.resolved === "boolean" &&
        timestamp(x.recordedAt) &&
        x.recordedAt !== null &&
        (x.supportedAction === null ||
          x.supportedAction === "reconcile_evidence") &&
        nullableText(x.blocker, 300),
    )
  )
    return null;
  return v as NativeLedger;
}
