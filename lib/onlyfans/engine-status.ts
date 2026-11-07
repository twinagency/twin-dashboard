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
};
export type EngineStatusView =
  | { schemaVersion: "of-engine.v1"; state: "unavailable" }
  | { schemaVersion: "of-engine.v1"; state: "current"; accountId: string; conversationId: string;
      environment: "simulation"; mode: "active" | "paused" | "human";
      salesMode: "open" | "paused" | "reopened_scoped"; truncated: boolean; requests: EngineRequestView[] };

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const requestStatuses = new Set(["open", "waiting_fan", "waiting_provider", "handover_pending", "handover_accepted", "completed", "declined", "cancelled"]);
const actionOutcomes = new Set(["ready", "queued", "dispatching", "unknown", "accepted", "not_accepted", "cancelled", "refused", "completed", "held"]);

/** Reject a different account, unknown schema or unsupported state rather than guessing. */
export function parseEngineStatus(value: unknown, accountId: string, conversationId: string): EngineStatusView | null {
  if (!record(value) || value.schemaVersion !== "of-engine.v1") return null;
  if (value.state === "unavailable") return { schemaVersion: "of-engine.v1", state: "unavailable" };
  if (value.state !== "current" || value.accountId !== accountId || value.conversationId !== conversationId ||
      value.environment !== "simulation" || !["active", "paused", "human"].includes(String(value.mode)) ||
      !["open", "paused", "reopened_scoped"].includes(String(value.salesMode)) ||
      typeof value.truncated !== "boolean" || !Array.isArray(value.requests) || value.requests.length > 20) return null;
  const requests: EngineRequestView[] = [];
  for (const item of value.requests) {
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
    requests.push({ requestId: item.requestId, sourceMessageId: item.sourceMessageId, status: item.status,
      owner: item.owner, nextStep: item.nextStep, actionOutcome: item.actionOutcome,
      actionType: item.actionType === "reply" || item.actionType === "offer" ? item.actionType : null,
      ...(typeof item.revision === "number" ? { revision: item.revision } : {}),
      ...(typeof item.partsCompleted === "number" && typeof item.partsTotal === "number" ?
        { partsCompleted: item.partsCompleted, partsTotal: item.partsTotal } : {}) });
  }
  return { schemaVersion: "of-engine.v1", state: "current", accountId, conversationId,
    environment: "simulation", mode: value.mode as "active" | "paused" | "human",
    salesMode: value.salesMode as "open" | "paused" | "reopened_scoped", truncated: value.truncated, requests };
}

export function engineRequestLabel(request: EngineRequestView): string {
  if (request.nextStep === "no_contact") return "Contact stopped at the fan’s request";
  if (request.actionOutcome === "unknown") return "Delivery outcome needs review";
  if (request.nextStep === "review_delivery_dependency") return "Reply held while an earlier delivery needs review";
  if (request.nextStep === "review_changed_conversation") return "Reply needs review after the conversation changed";
  if (request.nextStep === "review_access_revocation") return "Access revoked; review required";
  if (request.nextStep === "review_refund_or_chargeback") return "Refund or chargeback needs review";
  if (request.status === "waiting_provider" && request.nextStep === "verify_access") return "Purchase recorded; access is not yet confirmed";
  if (request.status === "waiting_provider") return "Waiting for provider evidence";
  if (request.status === "waiting_fan" && request.nextStep === "await_purchase_or_question") return "Offer sent; purchase is not confirmed";
  if (request.actionOutcome === "not_accepted") return "Send was not accepted; review the existing request";
  if (request.status === "handover_pending") return "Waiting for a team member to accept";
  if (request.status === "handover_accepted") return "Team member accepted responsibility";
  if (request.actionOutcome === "cancelled" || request.actionOutcome === "refused") return "Reply needs review";
  if (request.status === "open" && request.partsTotal && request.partsTotal > 1 && request.partsCompleted)
    return `${request.partsCompleted} of ${request.partsTotal} reply parts sent; remaining parts pending`;
  if (request.status === "completed" && request.actionType === "offer") return "Purchase and access confirmed";
  if (request.status === "completed" && request.actionType === "reply") return "Reply completed";
  if (request.status === "completed") return "Request completed";
  if (request.status === "waiting_fan") return "Waiting for the fan";
  if (request.status === "cancelled") return "Request cancelled";
  if (request.status === "declined") return "Request declined";
  return "Request in progress";
}
