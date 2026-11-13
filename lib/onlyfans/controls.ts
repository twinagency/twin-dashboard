/** Shared control contract. Browser code contains no service credentials. */
import type { CommandRequest } from "../onlyfans-preview/types";

export const CONTROL_SCHEMA = "of-controls.v1";
export const CONTROL_HEADER = "X-OnlyFans-Control-Version";
export const CONTROL_ACTIONS = ["pause_automation", "resume_automation", "request_takeover",
  "release_takeover", "mark_no_contact", "manual_message", "resolve_delivery_evidence"] as const;
export type ControlAction = typeof CONTROL_ACTIONS[number];
export function isControlAction(value: unknown): value is ControlAction {
  return typeof value === "string" && (CONTROL_ACTIONS as readonly string[]).includes(value);
}
export type ControlAck = {
  schemaVersion: typeof CONTROL_SCHEMA;
  ok: true;
  applied: true;
  commandKey: string;
  accountId: string;
  conversationId: string;
  action: ControlAction;
  recordedRevision: number;
  /** Only a queued intent acknowledgement; never provider acceptance. */
  intentId?: string;
  outcome?: "queued";
};
export type RecordedControlResult = {
  simulated: false;
  applied: boolean;
  accepted: boolean;
  outcome: "recorded" | "refused" | "unconfirmed";
  request: CommandRequest;
  note: string;
  recordedRevision?: number;
  intentId?: string;
};
export type ControlReply = { ok: true; ack: ControlAck } | {
  ok: false; status: number; outcome: "refused" | "unconfirmed"; error: string; code?: string;
};
export function parseControlAck(value: unknown, expected: {
  accountId: string; conversationId: string; action: string; expectedRevision: number; commandKey?: string;
}): ControlAck | null {
  if (typeof value !== "object" || value === null) return null;
  const body = value as Record<string, unknown>;
  const expectedKeys = ["schemaVersion", "ok", "applied", "commandKey", "accountId", "conversationId", "action", "recordedRevision",
    ...(expected.action === "manual_message" ? ["intentId", "outcome"] : [])];
  if (Object.keys(body).sort().join(",") !== expectedKeys.sort().join(",")) return null;
  if (body.schemaVersion !== CONTROL_SCHEMA || body.ok !== true || body.applied !== true ||
      body.accountId !== expected.accountId || body.conversationId !== expected.conversationId ||
      body.action !== expected.action || !isControlAction(body.action) ||
      body.recordedRevision !== expected.expectedRevision + (["manual_message", "resolve_delivery_evidence"].includes(body.action) ? 0 : 1) ||
      typeof body.commandKey !== "string" || !/^[a-f0-9]{64}$/.test(body.commandKey) ||
      (expected.commandKey !== undefined && body.commandKey !== expected.commandKey)) return null;
  if (body.action === "manual_message" && (body.outcome !== "queued" || typeof body.intentId !== "string" ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(body.intentId))) return null;
  if (body.action !== "manual_message" && ("intentId" in body || "outcome" in body)) return null;
  return body as ControlAck;
}


export const CONTROL_REFUSAL_REASONS: Record<string, string> = {
  history_repair_required: "History import requires repair. Sending is held until the conversation history is verified.",
  revision_changed: "Conversation revision changed. The latest state has been requested. Review it before trying again.",
  takeover_pending: "Takeover is still pending. Wait for the current delivery to finish.",
  delivery_unresolved: "Delivery remains unresolved. Check the existing attempt before sending again.",
  account_disabled: "Account automation is disabled. An account operator must review the intentional pause.",
  sender_unavailable: "The sender is unavailable or disabled for this account.",
  contact_blocked: "This conversation is intentionally paused or contact is blocked.",
  takeover_required: "Take over this conversation before sending a manual reply.",
  owner_changed: "Reply ownership changed. Refresh reply ownership.",
  command_conflict: "This request key belongs to a different command. Review the existing outcome.",
  control_conflict: "This action is blocked by the current conversation state. Refresh reply ownership and check delivery details.",
};
export function controlRefusalCode(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const body = value as Record<string, unknown>;
  if (body.schemaVersion === CONTROL_SCHEMA && body.ok === false && typeof body.code === "string" &&
      Object.hasOwn(CONTROL_REFUSAL_REASONS, body.code)) return body.code;
}

/** Only known dashboard messages may be displayed; never echo upstream errors. */
const DASHBOARD_CONTROL_REFUSALS: Record<number, readonly string[]> = {
  400: ["That conversation reference is invalid.", "That conversation control request is invalid.", "That conversation control is unavailable."],
  403: ["Your team access is read-only.", "This change must be requested from this dashboard.", "This action requires management permission."],
  409: ["The conversation changed or has an active hold. Refresh before trying again."],
  413: ["That conversation control request is invalid."],
  503: ["Conversation controls are not configured."],
};
export function controlRefusalNote(status: number, value: unknown): string {
  const code = controlRefusalCode(value);
  if (status === 409 && code) return CONTROL_REFUSAL_REASONS[code];
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const body = value as Record<string, unknown>;
    if (body.schemaVersion === CONTROL_SCHEMA && body.ok === false && body.outcome === "refused" &&
        typeof body.error === "string" && DASHBOARD_CONTROL_REFUSALS[status]?.includes(body.error)) return body.error;
  }
  if (status === 401) return "Your dashboard session has expired. Sign in again before changing reply control.";
  if (status === 403) return "Your session cannot change this conversation. Check your team access and refresh.";
  if (status === 404) return "This conversation is no longer available. Refresh the inbox.";
  if (status === 409) return "The conversation changed or has an active hold. Refresh before trying again.";
  if (status === 413) return "This request is too large. Shorten the reply and try again.";
  if (status === 503) return "Conversation controls are unavailable. The server connection or configuration needs attention.";
  return "The change was not accepted. Refresh the conversation before trying again.";
}
