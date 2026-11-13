// Browser-safe operator vocabulary. No transport, no environment: "use client" code imports this, never engine-operator.ts.
export const ENGINE_OPERATOR_SCHEMA = "of-engine-operator.v1";
export const ENGINE_OPERATOR_HEADER = "X-OnlyFans-Engine-Operator-Version";
/** `mark_reconciled` is not served by the backend yet (NEEDS-BACKEND.md). The dashboard only offers it for a row that declares support. */
export type EngineOperatorAction = "request_handover" | "accept_handover" | "complete" | "decline" | "mark_reconciled";
export const ENGINE_OPERATOR_ACTIONS: readonly EngineOperatorAction[] = ["request_handover", "accept_handover", "complete", "decline", "mark_reconciled"];
export const isEngineOperatorAction = (value: unknown): value is EngineOperatorAction =>
  typeof value === "string" && (ENGINE_OPERATOR_ACTIONS as readonly string[]).includes(value);
/** Actions that end or close a request and so must carry what the person checked. */
export const engineActionNeedsNote = (action: EngineOperatorAction) => action === "complete" || action === "decline" || action === "mark_reconciled";
export type EngineOperatorResult = { ok: true } | { ok: false; outcome: "refused" | "unconfirmed"; error: string };
