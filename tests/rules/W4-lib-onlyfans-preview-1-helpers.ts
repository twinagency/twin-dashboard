// Shared fixtures for the W4 lib-onlyfans-preview-1 tests (here, tests/rules/G47-stop-and-queued.test.ts), so an ActionSet,
// RequestState or fixture change edits one place.
// Not a test file: the name must never match *.test.*.
import { availableActions } from "../../lib/onlyfans-preview/actions";
import { accounts, conversationDetails, ACCOUNT_AVA } from "../../lib/onlyfans-preview/fixtures";
import { operatorViewer } from "../../lib/onlyfans-preview/fixture-data-source";
import type { AutomationMode, AvailableAction, ConversationDetail, DeliveryOutcome, OfAccount, RequestState, TakeoverState } from "../../lib/onlyfans-preview/types";

type ThreadShape = { automationMode: AutomationMode; takeoverState: TakeoverState };
type DeliveryIncident = NonNullable<ConversationDetail["deliveryIncident"]>;

/** The shapes in which each go/stop action is otherwise offered. */
export const TAKEN_OVER: ThreadShape = { automationMode: "human_controlled", takeoverState: "effective" };
export const PAUSED: ThreadShape = { automationMode: "paused", takeoverState: "none" };
export const AUTOMATED: ThreadShape = { automationMode: "automated", takeoverState: "none" };

/** Ava's healthy account: connected, every capability available. */
export const AVA_ACCOUNT: OfAccount = accounts.find(a => a.accountId === ACCOUNT_AVA) ?? (() => {
  throw new Error(`fixture account ${ACCOUNT_AVA} missing`);
})();

export const incident = (outcome: DeliveryOutcome): DeliveryIncident =>
  ({ attemptId: "of-attempt-w4-1", outcome, recordedAt: "2026-10-17T08:00:00.000Z", detail: "Not confirmed." });

/**
 * The actions availableActions offers on Ava's account for a summary built from of-conv-ava-1003 with the given
 * delivery, automation mode and takeover state (all three overwrite the fixture's values) and optional incident.
 */
export function offered(input: { delivery: DeliveryOutcome; shape: ThreadShape; incident?: DeliveryIncident }): AvailableAction[] {
  const summary = { ...conversationDetails["of-conv-ava-1003"].summary, ...input.shape, delivery: input.delivery };
  return availableActions({ account: AVA_ACCOUNT, summary, viewer: operatorViewer(), deliveryIncident: input.incident })
    .available.map(a => a.action);
}

/** The data of a ready or stale read; undefined for every other state. */
export const dataOf = <T>(s: RequestState<T>): T | undefined => (s.status === "ready" || s.status === "stale" ? s.data : undefined);
