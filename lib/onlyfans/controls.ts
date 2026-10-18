/** Shared control contract. Browser code contains no service credentials. */
import type { CommandRequest } from "../onlyfans-preview/types";

export const CONTROL_SCHEMA = "of-controls.v1";
export const CONTROL_HEADER = "X-OnlyFans-Control-Version";
export const CONTROL_ACTIONS = ["pause_automation", "resume_automation", "request_takeover",
  "release_takeover", "mark_no_contact"] as const;
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
};
export type RecordedControlResult = {
  simulated: false;
  applied: boolean;
  accepted: boolean;
  outcome: "recorded" | "refused" | "unconfirmed";
  request: CommandRequest;
  note: string;
  recordedRevision?: number;
};
export type ControlReply = { ok: true; ack: ControlAck } | {
  ok: false; status: number; outcome: "refused" | "unconfirmed"; error: string;
};
export function parseControlAck(value: unknown, expected: {
  accountId: string; conversationId: string; action: string; expectedRevision: number; commandKey?: string;
}): ControlAck | null {
  if (typeof value !== "object" || value === null) return null;
  const body = value as Record<string, unknown>;
  if (body.schemaVersion !== CONTROL_SCHEMA || body.ok !== true || body.applied !== true ||
      body.accountId !== expected.accountId || body.conversationId !== expected.conversationId ||
      body.action !== expected.action || !isControlAction(body.action) ||
      body.recordedRevision !== expected.expectedRevision + 1 ||
      typeof body.commandKey !== "string" || !/^[a-f0-9]{64}$/.test(body.commandKey) ||
      (expected.commandKey !== undefined && body.commandKey !== expected.commandKey)) return null;
  return body as ControlAck;
}
