// Preview-only state injection.
//
// The point of OF-D0 is that five different dimensions stay independent, so the
// reviewer can see any combination of them without a backend:
//
//   1. what the viewer may do            (permission)
//   2. whether the account can connect   (connection health)
//   3. who owns replies                  (automation mode)
//   4. whether a human is in control      (takeover state)
//   5. whether the last action landed     (delivery outcome)
//   plus, separately, what the read itself did: loading, empty, error or stale.
//
// Everything here is applied on top of the synthetic fixtures. None of it
// changes a fixture in place, none of it reaches a network, and none of it is
// reachable from the live app: only the preview imports this module.

import {
  accounts as fixtureAccounts,
  conversationDetails as fixtureDetails,
  conversationsByAccount as fixtureConversations,
} from "./fixtures";
import type { FixtureScenarios } from "./fixture-data-source";
import type {
  AutomationMode,
  ConnectionHealth,
  ConversationDetail,
  ConversationSummary,
  DeliveryOutcome,
  Freshness,
  OfAccount,
  PreviewViewer,
  RequestState,
  TakeoverState,
} from "./types";

/** What a single read did, as the reviewer chooses to see it. */
export type ReadScenario = "live" | "loading" | "empty" | "error" | "stale";

export const READ_SCENARIOS: ReadScenario[] = [
  "live",
  "loading",
  "empty",
  "error",
  "stale",
];

export type PreviewControls = {
  /** Permission dimension. A view-as session is always read only. */
  viewAs: boolean;
  accountsRead: ReadScenario;
  conversationsRead: ReadScenario;
  conversationRead: ReadScenario;
  /** Connection dimension. Null keeps whatever the fixture says. */
  health: ConnectionHealth | null;
  /** Automation dimension. */
  automationMode: AutomationMode | null;
  /** Takeover dimension. */
  takeoverState: TakeoverState | null;
  /** Delivery dimension. */
  delivery: DeliveryOutcome | null;
};

export const DEFAULT_CONTROLS: PreviewControls = {
  viewAs: false,
  accountsRead: "live",
  conversationsRead: "live",
  conversationRead: "live",
  health: null,
  automationMode: null,
  takeoverState: null,
  delivery: null,
};

/** A fixed, obviously-old timestamp so a stale read never reads as current. */
export const STALE_FRESHNESS: Freshness = {
  asOf: "2026-10-17T06:30:00.000Z",
  maxAgeSeconds: 120,
  stale: true,
};

function readState<T>(scenario: ReadScenario, data: () => T): RequestState<T> | null {
  switch (scenario) {
    case "live":
      return null;
    case "loading":
      return { status: "loading" };
    case "empty":
      return { status: "empty" };
    case "error":
      return {
        status: "error",
        message: "The read failed. Nothing below is a guess at what the value was.",
      };
    case "stale":
      return { status: "stale", data: data(), freshness: STALE_FRESHNESS };
    default:
      return null;
  }
}

/** Health overrides carry a plain-language reason, never a raw provider error. */
const HEALTH_REASON: Record<ConnectionHealth, string | null> = {
  connected: null,
  reconnecting: "Reconnecting to the provider. Reads may lag until it settles.",
  disconnected: "This account is not reachable right now. Nothing can be sent until it is back.",
  expired_session: "The stored session expired. A reconnect is required before any send.",
  revoked: "Access for this account was revoked. Nothing is read or sent until it is bound again.",
};

/**
 * Writes that need a live session. Kept in step with the account's health so the
 * preview does not offer a send on an account that cannot accept one.
 */
const WRITE_CAPABILITIES: (keyof OfAccount["capabilities"])[] = [
  "sendManualMessage",
  "pauseAutomation",
  "requestTakeover",
  "resolveDeliveryEvidence",
];

export function withAccountOverrides(account: OfAccount, controls: PreviewControls): OfAccount {
  if (!controls.health) return account;
  const health = controls.health;
  const usable = health === "connected";
  const capabilities = { ...account.capabilities };
  for (const capability of WRITE_CAPABILITIES) {
    capabilities[capability] = usable ? "available" : "unavailable";
  }
  return { ...account, health, healthReason: HEALTH_REASON[health], capabilities };
}

export function withSummaryOverrides(
  summary: ConversationSummary,
  controls: PreviewControls,
): ConversationSummary {
  return {
    ...summary,
    automationMode: controls.automationMode ?? summary.automationMode,
    takeoverState: controls.takeoverState ?? summary.takeoverState,
    delivery: controls.delivery ?? summary.delivery,
  };
}

/**
 * A conversation row and its thread must agree: a row that says "unknown" while
 * the thread is a tidy success is worse than either. The override is applied to
 * the summary inside the detail too, so the two never contradict.
 *
 * It also keeps three things that a dashboard usually lets drift apart in step:
 * the conversation rollup, the individual bubble receipts, and the recorded
 * attempt. Overriding only the rollup is exactly how a thread ends up showing a
 * settled incident next to a bubble that says the outcome is still unknown,
 * with the send control enabled underneath both.
 */

/**
 * Outcomes that leave a recorded attempt behind. An attempt is a record of what
 * was tried, so it survives a refusal and a partial send as well as an unknown
 * one; only the outcomes that never reached dispatch have nothing to record.
 */
const OUTCOMES_WITH_ATTEMPT: DeliveryOutcome[] = ["dispatching", "unknown", "partial", "failed"];

/** Outcomes where the attempt is still an open question rather than a record. */
const OUTCOMES_AWAITING_EVIDENCE: DeliveryOutcome[] = ["dispatching", "unknown"];

const ATTEMPT_DETAIL: Partial<Record<DeliveryOutcome, string>> = {
  unknown:
    "The provider has not confirmed this send. Resolve it from provider evidence before anything else is sent to this fan.",
  dispatching:
    "This send is still in flight. Its outcome has to be settled before anything else is sent to this fan.",
  partial:
    "One bubble was accepted and another was not. The accepted bubble is never repeated; the rest needs a decision.",
  failed: "The provider refused the request. Nothing was accepted, and nothing is retried automatically.",
};

export function withDetailOverrides(
  detail: ConversationDetail,
  controls: PreviewControls,
): ConversationDetail {
  const summary = withSummaryOverrides(detail.summary, controls);
  if (controls.delivery === null) return { ...detail, summary };

  const outcome = summary.delivery;

  // A recorded attempt keeps its id, but its text describes its old outcome, so a changed outcome gets its own text: a
  // refusal forced to "unknown" must read as unconfirmed, not refused.
  const incident = OUTCOMES_WITH_ATTEMPT.includes(outcome)
    ? detail.deliveryIncident
      ? { ...detail.deliveryIncident, outcome, detail: detail.deliveryIncident.outcome === outcome ? detail.deliveryIncident.detail
          : ATTEMPT_DETAIL[outcome] ?? "A recorded attempt with no further detail." }
      : {
          attemptId: `of-attempt-preview-${summary.conversationId}`,
          outcome,
          recordedAt: summary.lastActivityAt,
          detail: ATTEMPT_DETAIL[outcome] ?? "A recorded attempt with no further detail.",
        }
    : null;

  const awaitingEvidence = OUTCOMES_AWAITING_EVIDENCE.includes(outcome);
  // The old attempt's id, when the override no longer records it: a settled bubble must not still point at it.
  const droppedAttempt = detail.deliveryIncident && detail.deliveryIncident.attemptId !== incident?.attemptId
    ? detail.deliveryIncident.attemptId : null;

  // Every outbound bubble follows the rollup, and a bubble that is still an open
  // question points at the attempt that has to settle it. A bubble the provider
  // never reached has no receipt at all.
  const messages = detail.messages.map((message) => {
    if (message.direction !== "outbound") return message;
    const reachedProvider = !["none", "generating", "queued"].includes(outcome);
    return {
      ...message,
      delivery: outcome,
      evidenceRef: reachedProvider
        ? awaitingEvidence
          ? (incident?.attemptId ?? message.evidenceRef)
          : message.evidenceRef !== null && message.evidenceRef !== droppedAttempt
            ? message.evidenceRef : `of-receipt-preview-${message.messageId}`
        : null,
    };
  });

  return { ...detail, summary, messages, deliveryIncident: incident };
}

/**
 * Translate the control panel into the fixture data source's scenario hooks.
 * The fixture data is what a stale read falls back to, so "stale" still shows
 * real shaped rows behind its warning instead of an empty shell.
 */
export function buildScenarios(
  controls: PreviewControls,
  viewer: PreviewViewer,
): FixtureScenarios | undefined {
  const visibleAccounts = fixtureAccounts.filter((account) =>
    viewer.scopedAccountIds.includes(account.accountId),
  );

  const scenarios: FixtureScenarios = {};
  const accountsState = readState(controls.accountsRead, () => visibleAccounts);
  if (accountsState) scenarios.accounts = accountsState;

  if (controls.conversationsRead !== "live") {
    scenarios.conversations = (accountId) =>
      readState(controls.conversationsRead, () => ({
        items: (fixtureConversations[accountId] ?? []).slice(0, 3),
        nextCursor: null,
      })) ?? undefined;
  }

  if (controls.conversationRead !== "live") {
    scenarios.conversation = (accountId, conversationId) => {
      // Only this account's own thread is ever answered; anything else falls through to the data source's scope refusal.
      // A stale read keeps the thread's messages behind its freshness warning instead of blanking them.
      const detail = fixtureDetails[conversationId];
      return detail && detail.accountId === accountId
        ? readState(controls.conversationRead, () => ({ ...detail, freshness: STALE_FRESHNESS })) ?? undefined
        : undefined;
    };
  }

  if (controls.health) scenarios.account = account => withAccountOverrides(account, controls);
  if (controls.automationMode || controls.takeoverState || controls.delivery) {
    scenarios.summary = summary => withSummaryOverrides(summary, controls);
    scenarios.detail = detail => withDetailOverrides(detail, controls);
  }

  return Object.keys(scenarios).length === 0 ? undefined : scenarios;
}
