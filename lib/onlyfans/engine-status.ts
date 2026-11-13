/** Engine request projection shown beside a conversation. Parsed, never trusted. */
export const ENGINE_ENVIRONMENTS = ["simulation", "live", "fansapi"] as const;
export type EngineEnvironment = typeof ENGINE_ENVIRONMENTS[number];
export const isEngineEnvironment = (value: unknown): value is EngineEnvironment =>
  typeof value === "string" && (ENGINE_ENVIRONMENTS as readonly string[]).includes(value);
/** The badge text. Simulation must never read like a real provider, and the reverse. */
export const ENGINE_ENVIRONMENT_LABELS: Record<EngineEnvironment, string> = {
  simulation: "Simulation", live: "Live", fansapi: "Live (FansAPI)" };
export const engineEnvironmentLabel = (environment: EngineEnvironment) => ENGINE_ENVIRONMENT_LABELS[environment];
export const engineEnvironmentIsReal = (environment: EngineEnvironment) => environment !== "simulation";

export const ENGINE_PAGE_DEFAULT = 20;
export const ENGINE_PAGE_MAX = 100;
export const PURCHASE_STATES = ["offered", "purchased", "unlocked", "refunded", "held_for_review"] as const;
export type PurchaseEvidenceState = typeof PURCHASE_STATES[number];
export type EnginePurchaseView = { state: PurchaseEvidenceState; amountCents?: number; providerTransactionId?: string };

export type EngineRequestView = {
  requestId: string;
  sourceMessageId: string;
  status: string;
  owner: string;
  nextStep: string;
  actionOutcome: string | null;
  actionType: "reply" | "offer" | null;
  revision?: number;
  partsCompleted?: number;
  partsTotal?: number;
  /** Present only when the backend reports purchase evidence explicitly. */
  purchase?: EnginePurchaseView;
};
export type EngineStatusView =
  | { schemaVersion: "of-engine.v1"; state: "unavailable" }
  | { schemaVersion: "of-engine.v1"; state: "current"; accountId: string; conversationId: string;
      environment: EngineEnvironment; mode: "active" | "paused" | "human";
      salesMode: "open" | "paused" | "reopened_scoped"; truncated: boolean; requests: EngineRequestView[];
      /** Opaque keyset continuation; null when this is the last page. */
      nextCursor: string | null };

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const requestStatuses = new Set(["open", "waiting_fan", "waiting_provider", "handover_pending", "handover_accepted", "completed", "declined", "cancelled"]);
const actionOutcomes = new Set(["ready", "queued", "dispatching", "unknown", "accepted", "not_accepted", "cancelled", "refused", "completed", "held"]);
const FINISHED = new Set(["completed", "declined", "cancelled"]);

/** Outcomes that prove nothing went out, or not yet: a request carrying one never reads as sent, offered or purchased. */
const NOT_SENT = new Set(["ready", "queued", "dispatching", "unknown", "held", "not_accepted", "cancelled", "refused"]);
/** A request that still needs someone or something. An unknown or held send needs a person whatever its status. */
export const isUnresolvedRequest = (request: Pick<EngineRequestView, "status"> & { actionOutcome?: string | null }) =>
  !FINISHED.has(request.status) || request.actionOutcome === "unknown" || request.actionOutcome === "held";
export const isCursor = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_=-]{1,512}$/.test(value);

function parsePurchase(value: unknown): EnginePurchaseView | null | undefined {
  if (value === undefined) return undefined;
  if (!record(value) || !PURCHASE_STATES.includes(value.state as PurchaseEvidenceState)) return null;
  if (value.amountCents !== undefined && !(Number.isInteger(value.amountCents) && Number(value.amountCents) >= 0 && Number(value.amountCents) <= 2_000_000)) return null;
  if (value.providerTransactionId !== undefined && !(typeof value.providerTransactionId === "string" && /^[A-Za-z0-9._:-]{1,64}$/.test(value.providerTransactionId))) return null;
  return { state: value.state as PurchaseEvidenceState,
    ...(typeof value.amountCents === "number" ? { amountCents: value.amountCents } : {}),
    ...(typeof value.providerTransactionId === "string" ? { providerTransactionId: value.providerTransactionId } : {}) };
}

/** One request row. Shared by the conversation page and the account-wide list so both reject the same things. */
export function parseEngineRequest(item: unknown): EngineRequestView | null {
  if (!record(item) || typeof item.requestId !== "string" || !/^[0-9a-f-]{36}$/.test(item.requestId) ||
      typeof item.sourceMessageId !== "string" || !/^[0-9]{1,19}$/.test(item.sourceMessageId) ||
      typeof item.status !== "string" || !requestStatuses.has(item.status) ||
      typeof item.owner !== "string" || !item.owner || item.owner.length > 128 ||
      typeof item.nextStep !== "string" || !item.nextStep || item.nextStep.length > 128 ||
      !(item.actionOutcome === null || typeof item.actionOutcome === "string" && actionOutcomes.has(item.actionOutcome)) ||
      !(item.actionType === undefined || item.actionType === null || item.actionType === "reply" || item.actionType === "offer") ||
      !(item.revision === undefined || Number.isInteger(item.revision) && Number(item.revision) >= 0 && Number(item.revision) < 2 ** 31 - 1) ||
      !((item.partsCompleted === undefined && item.partsTotal === undefined) ||
        (Number.isInteger(item.partsCompleted) && Number.isInteger(item.partsTotal) &&
         Number(item.partsCompleted) >= 0 && Number(item.partsTotal) <= 4 && Number(item.partsCompleted) <= Number(item.partsTotal)))) return null;
  const purchase = parsePurchase(item.purchase);
  if (purchase === null) return null;
  return { requestId: item.requestId, sourceMessageId: item.sourceMessageId, status: item.status,
    owner: item.owner, nextStep: item.nextStep, actionOutcome: item.actionOutcome as string | null,
    actionType: item.actionType === "reply" || item.actionType === "offer" ? item.actionType : null,
    ...(typeof item.revision === "number" ? { revision: item.revision } : {}),
    ...(typeof item.partsCompleted === "number" && typeof item.partsTotal === "number" ?
      { partsCompleted: item.partsCompleted, partsTotal: item.partsTotal } : {}),
    ...(purchase ? { purchase } : {}) };
}

/** Reject a different account, unknown schema or unsupported state rather than guessing. */
export function parseEngineStatus(value: unknown, accountId: string, conversationId: string): EngineStatusView | null {
  if (!record(value) || value.schemaVersion !== "of-engine.v1") return null;
  if (value.state === "unavailable") return { schemaVersion: "of-engine.v1", state: "unavailable" };
  if (value.state !== "current" || value.accountId !== accountId || value.conversationId !== conversationId ||
      !isEngineEnvironment(value.environment) || !["active", "paused", "human"].includes(String(value.mode)) ||
      !["open", "paused", "reopened_scoped"].includes(String(value.salesMode)) ||
      typeof value.truncated !== "boolean" || !Array.isArray(value.requests) || value.requests.length > ENGINE_PAGE_MAX ||
      !(value.nextCursor === undefined || value.nextCursor === null || isCursor(value.nextCursor))) return null;
  const requests: EngineRequestView[] = [];
  for (const item of value.requests) {
    const parsed = parseEngineRequest(item);
    if (!parsed) return null;
    requests.push(parsed);
  }
  if (new Set(requests.map(request => request.requestId)).size !== requests.length) return null;
  return { schemaVersion: "of-engine.v1", state: "current", accountId, conversationId,
    environment: value.environment, mode: value.mode as "active" | "paused" | "human",
    salesMode: value.salesMode as "open" | "paused" | "reopened_scoped", truncated: value.truncated, requests,
    nextCursor: typeof value.nextCursor === "string" ? value.nextCursor : null };
}

/** Append a later page without duplicating or reordering what is already on screen. */
export function appendEnginePage(current: EngineRequestView[], page: EngineRequestView[]): EngineRequestView[] {
  const seen = new Set(current.map(request => request.requestId));
  return [...current, ...page.filter(request => !seen.has(request.requestId))];
}

export type PurchaseEvidence = { state: PurchaseEvidenceState; label: string; detail: string; amountCents?: number; providerTransactionId?: string };
const PURCHASE_TEXT: Record<PurchaseEvidenceState, [string, string]> = {
  offered: ["Offered", "Offer sent. No purchase is recorded."],
  purchased: ["Purchased", "A purchase is recorded. Access is not yet confirmed."],
  unlocked: ["Unlocked", "Purchase recorded and access confirmed."],
  refunded: ["Refunded", "A refund or chargeback is recorded for this purchase."],
  held_for_review: ["Held for review", "Access or payment evidence conflicts. A person must review it before anything else is sent."] };
/** What the request proves about money and access. Explicit backend evidence wins; otherwise it is read from the request's own state. */
export function engineRequestPurchase(request: EngineRequestView): PurchaseEvidence | null {
  const make = (state: PurchaseEvidenceState, extra: Partial<EnginePurchaseView> = {}): PurchaseEvidence =>
    ({ state, label: PURCHASE_TEXT[state][0], detail: PURCHASE_TEXT[state][1], ...extra });
  if (request.purchase) return make(request.purchase.state, request.purchase);
  if (request.nextStep === "review_refund_or_chargeback") return make("refunded");
  if (request.nextStep === "review_access_revocation") return make("held_for_review");
  if (request.actionType !== "offer" || NOT_SENT.has(request.actionOutcome ?? "")) return null;
  if (request.status === "completed") return make("unlocked");
  if (request.status === "waiting_provider" && request.nextStep === "verify_access") return make("purchased");
  if (request.status === "waiting_fan" && request.nextStep === "await_purchase_or_question") return make("offered");
  return null;
}

/** Explicit evidence short of access on a finished request. Each names its own state so a refund or hold is never hidden. */
const EVIDENCE_LABEL: Record<Exclude<PurchaseEvidenceState, "unlocked">, string> = {
  offered: "Offered; no purchase is recorded", purchased: "Purchase recorded; access is not yet confirmed",
  refunded: "Refund or chargeback recorded; review required", held_for_review: "Purchase held for review" };

export function engineRequestLabel(request: EngineRequestView): string {
  if (request.nextStep === "no_contact") return "Contact stopped at the fan’s request";
  if (request.actionOutcome === "unknown") return "Delivery outcome needs review";
  if (request.actionOutcome === "held") return "Send held; review required";
  if (request.nextStep === "review_delivery_dependency") return "Reply held while an earlier delivery needs review";
  if (request.nextStep === "review_changed_conversation") return "Reply needs review after the conversation changed";
  if (request.nextStep === "review_access_revocation") return "Access revoked; review required";
  if (request.nextStep === "review_refund_or_chargeback") return "Refund or chargeback needs review";
  if (request.status === "waiting_provider" && request.nextStep === "verify_access") return "Purchase recorded; access is not yet confirmed";
  if (request.status === "waiting_provider") return "Waiting for provider evidence";
  if (request.status === "waiting_fan" && request.nextStep === "await_purchase_or_question" && !NOT_SENT.has(request.actionOutcome ?? "")) return "Offer sent; purchase is not confirmed";
  if (request.actionOutcome === "not_accepted") return "Send was not accepted; review the existing request";
  if (request.status === "handover_pending") return "Waiting for a team member to accept";
  if (request.status === "handover_accepted") return "Team member accepted responsibility";
  if (request.actionOutcome === "cancelled" || request.actionOutcome === "refused") return "Reply needs review";
  if (request.status === "open" && request.partsTotal && request.partsTotal > 1 && request.partsCompleted)
    return `${request.partsCompleted} of ${request.partsTotal} reply parts sent; remaining parts pending`;
  if (request.status === "completed" && request.purchase && request.purchase.state !== "unlocked") return EVIDENCE_LABEL[request.purchase.state];
  if (request.status === "completed" && request.actionType === "offer" && !NOT_SENT.has(request.actionOutcome ?? "")) return "Purchase and access confirmed";
  if (request.status === "completed" && request.actionType === "reply") return "Reply completed";
  if (request.status === "completed") return "Request completed";
  if (request.status === "waiting_fan") return "Waiting for the fan";
  if (request.status === "cancelled") return "Request cancelled";
  if (request.status === "declined") return "Request declined";
  return "Request in progress";
}

const NEXT_STEP_TEXT: Record<string, string> = {
  none: "Nothing further", await_handover_acceptance: "A team member accepts responsibility", human_review: "A team member reviews and resolves",
  reconcile_existing_action: "Check the existing send before anything else", verify_access: "Wait for access confirmation",
  await_purchase_or_question: "Wait for the fan", send_next_part: "Engine sends the next reply part", no_contact: "Do not contact the fan" };
/** A plain-language next step. Unknown machine names are shown with underscores removed, never hidden. */
export const engineNextStepText = (nextStep: string) => NEXT_STEP_TEXT[nextStep] ?? nextStep.replaceAll("_", " ");
