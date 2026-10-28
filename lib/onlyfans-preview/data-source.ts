import { inboxSearchParams, type InboxSearch } from "../onlyfans/inbox-search";
// The one frontend data-source interface for the OnlyFans dashboard surface.
//
// Two implementations exist and they never mix: the deterministic fixture
// source used by the isolated preview and the tests, and the live server source
// that calls the dashboard's own read handlers. `./sources.ts` is the only
// place that chooses between them, and the live one has no fixture import at
// all — an unconfigured dashboard reports `unavailable` rather than looking
// connected.

import type {
  AccountScopeRequest,
  CommandRequest,
  ConversationDetail,
  ConversationSummary,
  CursorPage,
  OfAccount,
  RequestState,
  CommandResult,
} from "./types";

export interface OnlyFansDataSource {
  /** Live means every read goes to the server; fixture means preview data only. */
  readonly kind: "fixture" | "live";
  /** Shown in the UI so sample data is never mistaken for live data. */
  readonly label: string;

  /**
   * The accounts this viewer may read, optionally narrowed to one creator.
   *
   * The scope is a request. What comes back is what the server (fixture or
   * backend) authorized, so a caller cannot widen its own view by asking.
   */
  listAccounts(scope?: AccountScopeRequest): Promise<RequestState<OfAccount[]>>;
  getAccount(accountId: string, scope?: AccountScopeRequest): Promise<RequestState<OfAccount>>;
  listConversations(
    accountId: string,
    cursor?: string | null,
    aiOnly?: boolean,
    search?: InboxSearch,
  ): Promise<RequestState<CursorPage<ConversationSummary>>>;
  getConversation(
    accountId: string,
    conversationId: string,
    cursor?: string | null,
  ): Promise<RequestState<ConversationDetail>>;

  /**
   * Fixtures simulate; the live adapter can submit scoped conversation controls.
   */
  submitCommand(request: CommandRequest): Promise<CommandResult>;
}

/** Raised when live OnlyFans data is requested without a configured adapter. */
export class OnlyFansApiNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OnlyFansApiNotConfiguredError";
  }
}
