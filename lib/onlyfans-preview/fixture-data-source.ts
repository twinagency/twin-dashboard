// Deterministic fixture implementation of OnlyFansDataSource.
//
// This is the OF-D0 data source. It reads only ./fixtures.ts, is synchronous
// underneath, and cannot reach a network, a database or a provider. It exists
// so the accounts and inbox surface can be built and reviewed before the scoped
// server API exists.

import { isAiChatting } from "../onlyfans/ai-visibility";
import type { OnlyFansDataSource } from "./data-source";
import { commandPayloadProblem, isDeliveryUnresolved } from "./actions";
import { NO_PAYLOAD } from "./types";
import {
  accounts as fixtureAccounts,
  conversationDetails as fixtureDetails,
  conversationsByAccount as fixtureConversations,
} from "./fixtures";
import type {
  AccountScopeRequest,
  CommandRequest,
  ConversationDetail,
  ConversationSummary,
  CursorPage,
  OfAccount,
  PreviewViewer,
  RequestState,
  SimulatedCommandResult,
} from "./types";

/** Conservative page size so pagination is exercised by the fixtures. */
export const FIXTURE_PAGE_SIZE = 3;

/**
 * Per-read overrides used by the preview harness and the contract tests to
 * render loading, error, stale and empty without randomness or delays.
 */
export type FixtureScenarios = {
  accounts?: RequestState<OfAccount[]>;
  conversations?: (
    accountId: string,
    page: number,
  ) => RequestState<CursorPage<ConversationSummary>> | undefined;
  conversation?: (
    accountId: string,
    conversationId: string,
  ) => RequestState<ConversationDetail> | undefined;
};

export type FixtureDataSourceOptions = {
  viewer: PreviewViewer;
  scenarios?: FixtureScenarios;
  label?: string;
  /**
   * Artificial latency, in milliseconds, applied to every read.
   *
   * Zero by default, so the preview and the ordinary checks are instant. The
   * delayed-response checks set it, because a fixture that always answers on the
   * next microtask cannot tell you whether the code would survive an answer that
   * arrives late. It is a test seam, not a product feature.
   */
  latencyMs?: number;
};

async function wait(latencyMs: number): Promise<void> {
  if (latencyMs <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, latencyMs));
}

export function operatorViewer(): PreviewViewer {
  return {
    kind: "operator",
    label: "Operator",
    canManage: true,
    scopedAccountIds: fixtureAccounts.map((account) => account.accountId),
  };
}

/** A view-as session is always read only and always narrower than the operator. */
export function readOnlyView(accountIds: string[]): PreviewViewer {
  return {
    kind: "view_as",
    // The shell prints "Viewing as" above this label, so it must not repeat it.
    label: "Creator (read only)",
    canManage: false,
    scopedAccountIds: [...accountIds],
  };
}

function inScope(viewer: PreviewViewer, accountId: string): boolean {
  return viewer.scopedAccountIds.includes(accountId);
}

function scopeDenied(): RequestState<never> {
  // Deny without describing what exists, so an out of scope id is
  // indistinguishable from an unknown one.
  return { status: "error", message: "This account is not available in the current view." };
}

function page(
  items: ConversationSummary[],
  requestedPage: number,
): CursorPage<ConversationSummary> {
  const start = requestedPage * FIXTURE_PAGE_SIZE;
  const slice = items.slice(start, start + FIXTURE_PAGE_SIZE);
  const next = start + FIXTURE_PAGE_SIZE < items.length ? String(requestedPage + 1) : null;
  return { items: slice, nextCursor: next };
}

function parseCursor(cursor?: string | null): number {
  if (!cursor) return 0;
  const parsed = Number.parseInt(cursor, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export type FixtureOnlyFansDataSource = Omit<OnlyFansDataSource, "submitCommand"> & {
  submitCommand(request: CommandRequest): Promise<SimulatedCommandResult>;
};

export function createFixtureOnlyFansDataSource(
  options: FixtureDataSourceOptions,
): FixtureOnlyFansDataSource {
  const { viewer, scenarios = {}, label = "Sample data", latencyMs = 0 } = options;

  return {
    kind: "fixture",
    label,

    async listAccounts(scope?: AccountScopeRequest) {
      await wait(latencyMs);
      if (scenarios.accounts) return scenarios.accounts;
      const visible = fixtureAccounts.filter((account) => inScope(viewer, account.accountId));
    if (visible.length === 0) return { status: "empty" };
    // The creator is a request, so it narrows what the viewer may already read.
    // A creator this viewer cannot see yields nothing, and nothing is said about
    // whether that creator exists.
    const requested = scope?.creatorId ?? null;
    const scoped = requested
      ? visible.filter((account) => account.binding.creatorId === requested)
      : visible;
    return scoped.length === 0 ? { status: "empty" } : { status: "ready", data: scoped };
    },

  async getAccount(accountId: string, scope?: AccountScopeRequest) {
      await wait(latencyMs);
      if (!inScope(viewer, accountId)) return scopeDenied();
      const account = fixtureAccounts.find((candidate) => candidate.accountId === accountId);
    if (!account) return scopeDenied();
    if (scope?.creatorId && account.binding.creatorId !== scope.creatorId) return scopeDenied();
    return { status: "ready", data: account };
    },

    async listConversations(accountId: string, cursor?: string | null, aiOnly?: boolean) {
      await wait(latencyMs);
      if (!inScope(viewer, accountId)) return scopeDenied();
      const requestedPage = parseCursor(cursor);
      const override = scenarios.conversations?.(accountId, requestedPage);
      if (override) return override;
      const items = (fixtureConversations[accountId] ?? []).filter(item => !aiOnly || isAiChatting(item));
      if (items.length === 0) return { status: "empty" };
      return { status: "ready", data: page(items, requestedPage) };
    },

    async getConversation(accountId: string, conversationId: string) {
      await wait(latencyMs);
      if (!inScope(viewer, accountId)) return scopeDenied();
      const override = scenarios.conversation?.(accountId, conversationId);
      if (override) return override;
      const detail = fixtureDetails[conversationId];
      // A conversation id belonging to another account must never resolve here.
      if (!detail || detail.accountId !== accountId) return scopeDenied();
      return { status: "ready", data: detail };
    },

    async submitCommand(request: CommandRequest): Promise<SimulatedCommandResult> {
      await wait(latencyMs);
      return simulateCommand(request);
    },
  };
}

/**
 * Check a command against the modelled contract and report what it would have
 * been. Nothing is applied, in any case, because this preview has no delivery
 * authority: `applied` is always false.
 *
 * The checks that do run are the ones that would catch a command aimed at the
 * wrong account, or carrying a payload that does not belong to the command. A
 * simulation that accepts anything teaches the wrong contract.
 */
export function simulateCommand(request: CommandRequest): SimulatedCommandResult {
  const refuse = (reason: string): SimulatedCommandResult => ({
    simulated: true,
    applied: false,
    accepted: false,
    refusalReason: reason,
    request,
    note: `Refused before submission: ${reason} Nothing was sent and no setting was changed.`,
  });

  if (!Number.isInteger(request.expectedRevision) || request.expectedRevision < 0) {
    return refuse("A command has to name the revision it was decided against.");
  }

  const payloadProblem = commandPayloadProblem(request.command, request.payload);
  if (payloadProblem) return refuse(payloadProblem);

  // Account scope is checked against the fixture binding, so a command that
  // names one account and a conversation that belongs to another is refused
  // rather than quietly modelled.
  const binding = fixtureAccounts.find((account) => account.accountId === request.accountId);
  if (!binding) {
    return refuse("This account is not available in the current view.");
  }
  const conversation = fixtureDetails[request.conversationId];
  if (!conversation) {
    return refuse("That conversation is not part of this account.");
  }
  if (conversation.accountId !== request.accountId) {
    return refuse("That conversation belongs to a different account.");
  }

  if (request.command === "send_manual_message" && isDeliveryUnresolved(conversation.summary.delivery)) {
    return refuse("An earlier send is unresolved. Resolve its outcome before sending anything else.");
  }

  const described =
    request.payload.kind === "manual_message"
      ? `a message of ${request.payload.body.trim().length} characters`
      : request.payload.kind === "delivery_resolution"
        ? `${request.payload.decision.replace(/_/g, " ")} against attempt ${request.payload.attemptId}`
        : "no payload";

  return {
    simulated: true,
    applied: false,
    accepted: true,
    refusalReason: null,
    request,
    note:
      `Modelled only: ${request.command} with ${described} against revision ` +
      `${request.expectedRevision}. This preview has no delivery authority, so no message was ` +
      "sent and no setting was changed.",
  };
}
