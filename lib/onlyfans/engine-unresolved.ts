/** Account-wide list of engine requests and sends that still need a person. */
import { ENGINE_PAGE_MAX, isCursor, isEngineEnvironment, isUnresolvedRequest, parseEngineRequest, type EngineEnvironment, type EngineRequestView } from "./engine-status";

export type EngineUnresolvedItem = EngineRequestView & {
  conversationId: string;
  /** Display name or handle only; never a provider credential. */
  fanLabel: string | null;
  /** The send attempt that has no confirmed outcome, when there is one. */
  attemptId: string | null;
  /** Commands the backend declares for this row. Absent means none beyond opening the conversation. */
  supportedActions: ReadonlyArray<"mark_reconciled">;
};
export type EngineUnresolvedPage = { schemaVersion: "of-engine.v1"; state: "current"; scope: "account"; accountId: string;
  environment: EngineEnvironment; items: EngineUnresolvedItem[]; nextCursor: string | null } | { schemaVersion: "of-engine.v1"; state: "unavailable" };

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const ID = /^[A-Za-z0-9._:-]{1,64}$/;

/** A row needing review: not finished, or a send whose outcome is unknown or held. */
export const needsReview = (item: Pick<EngineRequestView, "status" | "actionOutcome">) => isUnresolvedRequest(item);

export function parseEngineUnresolved(value: unknown, accountId: string): EngineUnresolvedPage | null {
  if (!record(value) || value.schemaVersion !== "of-engine.v1") return null;
  if (value.state === "unavailable") return { schemaVersion: "of-engine.v1", state: "unavailable" };
  if (value.state !== "current" || value.scope !== "account" || value.accountId !== accountId || !isEngineEnvironment(value.environment) ||
      !Array.isArray(value.items) || value.items.length > ENGINE_PAGE_MAX || !(value.nextCursor === null || isCursor(value.nextCursor))) return null;
  const items: EngineUnresolvedItem[] = [];
  for (const raw of value.items) {
    const request = parseEngineRequest(raw);
    if (!request || !record(raw) || typeof raw.conversationId !== "string" || !ID.test(raw.conversationId) || !raw.conversationId.startsWith(`${accountId}:`) ||
        !(raw.fanLabel === undefined || raw.fanLabel === null || (typeof raw.fanLabel === "string" && raw.fanLabel.length <= 128)) ||
        !(raw.attemptId === undefined || raw.attemptId === null || (typeof raw.attemptId === "string" && /^[0-9a-f-]{36}$/.test(raw.attemptId))) ||
        !(raw.supportedActions === undefined || (Array.isArray(raw.supportedActions) && raw.supportedActions.length <= 1 && raw.supportedActions.every(a => a === "mark_reconciled")))) return null;
    items.push({ ...request, conversationId: raw.conversationId, fanLabel: typeof raw.fanLabel === "string" ? raw.fanLabel : null,
      attemptId: typeof raw.attemptId === "string" ? raw.attemptId : null,
      supportedActions: (raw.supportedActions as Array<"mark_reconciled"> | undefined) ?? [] });
  }
  if (new Set(items.map(item => item.requestId)).size !== items.length) return null;
  return { schemaVersion: "of-engine.v1", state: "current", scope: "account", accountId, environment: value.environment, items,
    nextCursor: typeof value.nextCursor === "string" ? value.nextCursor : null };
}

/** The one command the account view may offer, and only when the backend declared it for that row. */
export const RECONCILE_ACTION = "mark_reconciled" as const;
export type EngineReconcileCommand = { accountId: string; conversationId: string; requestId: string; action: typeof RECONCILE_ACTION;
  expectedRevision: number; commandKey: string; actor: string; evidenceRef: string };
export const canReconcile = (item: EngineUnresolvedItem) => item.supportedActions.includes(RECONCILE_ACTION) && item.revision !== undefined;
