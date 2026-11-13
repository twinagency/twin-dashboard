import type { InboxSearch } from "../onlyfans/inbox-search";
// Deterministic fixture implementation of OnlyFansDataSource.
//
// This is the OF-D0 data source. It reads only ./fixtures.ts, is synchronous
// underneath, and cannot reach a network, a database or a provider. It exists
// so the accounts and inbox surface can be built and reviewed before the scoped
// server API exists.

import { isAiChatting } from "../onlyfans/ai-visibility";
import type { OnlyFansDataSource } from "./data-source";
import { availableActions, commandPayloadProblem } from "./actions";
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
  /** The control panel's overrides, applied to every read and to simulateCommand, so the controls and the simulator judge one thread. */
  account?: (account: OfAccount) => OfAccount;
  summary?: (summary: ConversationSummary) => ConversationSummary;
  detail?: (detail: ConversationDetail) => ConversationDetail;
};

const same = <T>(value: T): T => value;
const mapData = <T>(state: RequestState<T>, map: (value: T) => T): RequestState<T> =>
  state.status === "ready" || state.status === "stale" ? { ...state, data: map(state.data) } : state;

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
  const { account: overAccount = same, summary: overSummary = same, detail: overDetail = same } = scenarios;

  return {
    kind: "fixture",
    label,

    async listAccounts(scope?: AccountScopeRequest) {
      await wait(latencyMs);
      // The creator is a request, so it narrows what the viewer may already read.
      // A creator this viewer cannot see yields nothing, and nothing is said about
      // whether that creator exists. A scenario's rows narrow the same way.
      const requested = scope?.creatorId ?? null;
      const narrow = (list: OfAccount[]) => list.filter((account) =>
        inScope(viewer, account.accountId) && (!requested || account.binding.creatorId === requested));
      const override = scenarios.accounts;
      if (override && override.status !== "ready" && override.status !== "stale") return override;
      const scoped = narrow(override ? override.data : fixtureAccounts).map(overAccount);
      if (scoped.length === 0) return { status: "empty" };
      return override ? { ...override, data: scoped } : { status: "ready", data: scoped };
    },

  async getAccount(accountId: string, scope?: AccountScopeRequest) {
      await wait(latencyMs);
      if (!inScope(viewer, accountId)) return scopeDenied();
      const account = fixtureAccounts.find((candidate) => candidate.accountId === accountId);
    if (!account) return scopeDenied();
    if (scope?.creatorId && account.binding.creatorId !== scope.creatorId) return scopeDenied();
    return { status: "ready", data: overAccount(account) };
    },

    async listConversations(accountId: string, cursor?: string | null, aiOnly?: boolean, search?: InboxSearch) {
      await wait(latencyMs);
      if (!inScope(viewer, accountId)) return scopeDenied();
      const requestedPage = parseCursor(cursor);
      const override = scenarios.conversations?.(accountId, requestedPage);
      if (override) return mapData(override, data => ({ ...data, items: data.items.map(overSummary) }));
      const items = (fixtureConversations[accountId] ?? []).map(overSummary).filter(item => (!aiOnly || isAiChatting(item)) && (!search?.query || `${item.fan.displayName} ${item.fan.fanId}`.toLowerCase().includes(search.query.trim().toLowerCase())) && (search?.filter !== "unread" || item.unreadCount > 0) && (search?.filter !== "attention" || item.requiresAttention));
      if (items.length === 0) return { status: "empty" };
      return { status: "ready", data: page(items, requestedPage) };
    },

    async getConversation(accountId: string, conversationId: string) {
      await wait(latencyMs);
      if (!inScope(viewer, accountId)) return scopeDenied();
      const detail = fixtureDetails[conversationId];
      // A conversation id belonging to another account must never resolve here, a scenario's included.
      if (!detail || detail.accountId !== accountId) return scopeDenied();
      return mapData(scenarios.conversation?.(accountId, conversationId) ?? { status: "ready", data: detail }, overDetail);
    },

    async submitCommand(request: CommandRequest): Promise<SimulatedCommandResult> {
      await wait(latencyMs);
      return simulateCommand(request, viewer, scenarios);
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
export function simulateCommand(request: CommandRequest, viewer: PreviewViewer, scenarios: FixtureScenarios = {}): SimulatedCommandResult {
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
  const fixtureBinding = fixtureAccounts.find((account) => account.accountId === request.accountId);
  if (!fixtureBinding || !inScope(viewer, request.accountId)) {
    return refuse("This account is not available in the current view.");
  }
  const fixtureConversation = fixtureDetails[request.conversationId];
  if (!fixtureConversation) {
    return refuse("That conversation is not part of this account.");
  }
  if (fixtureConversation.accountId !== request.accountId) {
    return refuse("That conversation belongs to a different account.");
  }
  const binding = (scenarios.account ?? same)(fixtureBinding), conversation = (scenarios.detail ?? same)(fixtureConversation);

  if (request.expectedRevision !== conversation.summary.revision) {
    return refuse("This conversation changed since it was loaded. Refresh it before trying again.");
  }

  // The same gate the controls use, so the pretend backend refuses what the UI would not offer: a held send, a send to
  // a no-contact fan, a resume during an unknown delivery.
  const actions = availableActions({ account: binding, summary: conversation.summary, viewer,
    deliveryIncident: conversation.deliveryIncident, goHold: null }); // the pretend backend holds no browser STOP; the UI and executeCommand do
  if (!actions.available.some((entry) => entry.action === request.command)) {
    return refuse(actions.blocked.find((entry) => entry.action === request.command)?.reason ?? "That action is not offered here.");
  }

  if (request.payload.kind === "delivery_resolution" && request.payload.attemptId !== conversation.deliveryIncident?.attemptId) {
    return refuse("That is not the attempt this conversation is waiting on.");
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
