import type { InboxSearch } from "./inbox-search";
// ── The authenticated, scoped read service ───────────────────────────────
//
// Three reads, one authority, no writes. This module is deliberately pure: it
// is handed the authorization facts and a backend, and it returns a result. It
// reads no cookie, no header and no environment variable, which is what makes
// the whole flow testable offline — and what stops a new route from being
// authenticated by accident.
//
// TWO SEPARATE QUESTIONS, answered in this order:
//
//   1. *May this caller read OnlyFans data at all?* The route verifies the
//      internal operator session positively and passes the answer in. A null
//      `getDashboardAccess()` is NOT proof of authentication — that trap is
//      documented at length in lib/api-auth.ts, and middleware.ts's dev bypass
//      is exactly why it matters. `authorizeRead` requires the session to have
//      been verified on this request.
//
//   2. *May this caller read this record?* The backend owns creator/account
//      bindings, so it answers that. What this service adds is the invariant
//      that an answer can never cross scopes: a conversation row belonging to
//      another account, or an account belonging to another creator, is refused
//      as a contract violation rather than rendered under the wrong heading.
//      That invariant is what a misrouted or compromised backend would break,
//      and it is asserted directly in the checks.

// Relative rather than aliased on purpose: this module is imported by the
// offline checks, which run outside Next and resolve no `@/` alias.
import { isAiChatting } from "./ai-visibility";
import { ONLYFANS_PREVIEW_SCHEMA_VERSION } from "../onlyfans-preview/types";
import type {
  ConversationDetail,
  ConversationSummary,
  CursorPage,
  OfAccount,
} from "../onlyfans-preview/types";
import type { BackendFailure, OnlyFansBackend } from "./backend";

/**
 * What the route positively established about this request.
 *
 * `operatorSession` is the verified internal operator session — not "the
 * dashboard returned something". `agency` and `viewAs` are the two existing
 * narrowings: an agency identity is not the operator, and a view-as session is
 * a look rather than an administration.
 */
export type ReadAuth = {
  operatorSession: boolean;
  agency: boolean;
  viewAs: boolean;
  /** Only supplied by the verified route boundary, never a request value. */
  agencyGrant?: import("./agency-scope").AgencyGrant;
};

export type ReadDenial = {
  ok: false;
  status: 400 | 401 | 403 | 404 | 500 | 502 | 503;
  /**
   * `unavailable` means "there is nothing to read from", which the dashboard
   * renders differently from a failed read. `denied` means the caller or the
   * record was refused. `error` is anything else.
   */
  state: "denied" | "unavailable" | "error";
  code: string;
  error: string;
};

export type ReadOk<T> = { ok: true; status: 200; body: T };
export type ReadResult<T> = ReadOk<T> | ReadDenial;

export type AccountsReadBody = {
  schemaVersion: typeof ONLYFANS_PREVIEW_SCHEMA_VERSION;
  scope: { creatorId: string | null; accountId: string | null };
  accounts: OfAccount[];
};

export type ConversationsReadBody = {
  schemaVersion: typeof ONLYFANS_PREVIEW_SCHEMA_VERSION;
  accountId: string;
  page: CursorPage<ConversationSummary>;
};

export type ConversationReadBody = {
  schemaVersion: typeof ONLYFANS_PREVIEW_SCHEMA_VERSION;
  accountId: string;
  conversation: ConversationDetail;
};

/**
 * The one authorization rule for OnlyFans reads.
 *
 * Everything else about access stays as it is: an agency reaches no channel
 * workspace today, and a view-as session may not read another account's private
 * conversations. Neither is widened here, and a caller with no verified session
 * is refused before the backend is consulted at all.
 */
export function authorizeRead(auth: ReadAuth): ReadDenial | null {
  if (!auth.operatorSession && !auth.agencyGrant) {
    return {
      ok: false,
      status: 401,
      state: "denied",
      code: "no_operator_session",
      error: "Sign in to the dashboard to read OnlyFans data.",
    };
  }
  if (auth.viewAs) {
    return {
      ok: false,
      status: 403,
      state: "denied",
      code: "view_as_read_only",
      error: "OnlyFans data is not available while viewing as another account.",
    };
  }
  if (auth.agency && !auth.agencyGrant) {
    return {
      ok: false,
      status: 403,
      state: "denied",
      code: "agency_not_operator",
      error: "OnlyFans data is available to the operator workspace only.",
    };
  }
  return null;
}

/** The internal operator: a verified dashboard session with no agency identity and no view-as. Fails closed. */
export const internalOperator = (auth: ReadAuth) => auth.operatorSession && !auth.agency && !auth.viewAs && !auth.agencyGrant;

function unavailable(reason: string): ReadDenial {
  return { ok: false, status: 503, state: "unavailable", code: "backend_unavailable", error: reason };
}

function violation(detail: string): ReadDenial {
  return {
    ok: false,
    status: 502,
    state: "error",
    code: "scope_violation",
    // The detail deliberately does NOT name the record: a refusal must not
    // become a way to read back something this caller was not given.
    error: `The OnlyFans backend answered outside the requested scope (${detail}).`,
  };
}

const NOT_CONFIGURED =
  "The OnlyFans backend is not configured for this environment. No account, session or " +
  "conversation can be read until it is.";

function mapFailure(failure: BackendFailure): ReadDenial {
  // A rejected service credential is an operational problem on our side, not a
  // refusal of this operator, so it is reported as unavailable rather than as
  // "you are not allowed".
  if (failure.status === 401) {
    return unavailable("The dashboard's OnlyFans service credential was rejected.");
  }
  if (failure.status === 503 || failure.status === 502) {
    return { ok: false, status: 503, state: "unavailable", code: failure.code, error: failure.error };
  }
  if (failure.status === 400) {
    return { ok: false, status: 400, state: "error", code: failure.code, error: failure.error };
  }
  if (failure.status === 403 || failure.status === 404) {
    return { ok: false, status: failure.status, state: "denied", code: failure.code, error: failure.error };
  }
  return { ok: false, status: 500, state: "error", code: failure.code, error: failure.error };
}

type ReadInput = { auth: ReadAuth; backend: OnlyFansBackend | null };

export async function readAccounts(
  input: ReadInput,
  request: { creatorId: string | null; accountId: string | null },
): Promise<ReadResult<AccountsReadBody>> {
  const denial = authorizeRead(input.auth);
  if (denial) return denial;
  if (!input.backend) return unavailable(NOT_CONFIGURED);
  // An agency grant names its creators (lowercased at source, agency-scope.ts): the requested creator is lowercased once to match, and
  // anything outside the grant is denied before the backend is asked.
  const grant = input.auth.agencyGrant?.creatorIds, creatorId = request.creatorId?.toLowerCase() ?? null;
  if (grant && creatorId !== null && !grant.includes(creatorId)) {
    return { ok: false, status: 403, state: "denied", code: "creator_not_granted", error: "That creator is not available to this session." };
  }
  // The creators this answer may contain: the requested one (already inside any grant), else the grant, else any.
  const allowed = creatorId !== null ? new Set([creatorId]) : grant ? new Set(grant) : null;

  const result = await input.backend.listAccounts({ creatorId });
  if (!result.ok) return mapFailure(result);
  if (allowed && result.data.some((account) => !allowed.has(account.binding.creatorId))) {
    return violation("an account from a creator outside this scope");
  }

  return {
    ok: true,
    status: 200,
    body: {
      schemaVersion: ONLYFANS_PREVIEW_SCHEMA_VERSION,
      scope: { creatorId, accountId: request.accountId },
      accounts: result.data,
    },
  };
}

export async function readConversations(
  input: ReadInput,
  request: { accountId: string; cursor: string | null; aiOnly?: boolean; search?: InboxSearch },
): Promise<ReadResult<ConversationsReadBody>> {
  const denial = authorizeRead(input.auth);
  if (denial) return denial;
  if (!input.backend) return unavailable(NOT_CONFIGURED);

  const result = await input.backend.listConversations(request.accountId, request.cursor, request.aiOnly, request.search);
  if (!result.ok) return mapFailure(result);

  const stray = result.data.items.find((item) => item.accountId !== request.accountId);
  if (stray) {
    return violation("a conversation from another account");
  }
  if (request.aiOnly && result.data.items.some(item => !isAiChatting(item))) return violation("an unfiltered AI conversation list");

  return {
    ok: true,
    status: 200,
    body: { schemaVersion: ONLYFANS_PREVIEW_SCHEMA_VERSION, accountId: request.accountId, page: result.data },
  };
}

export async function readConversation(
  input: ReadInput,
  request: { accountId: string; conversationId: string; cursor?: string | null },
): Promise<ReadResult<ConversationReadBody>> {
  const denial = authorizeRead(input.auth);
  if (denial) return denial;
  if (!input.backend) return unavailable(NOT_CONFIGURED);

  const result = await input.backend.getConversation(request.accountId, request.conversationId, request.cursor);
  if (!result.ok) return mapFailure(result);

  const detail = result.data;
  // A conversation id is only unique within an account, so both halves have to
  // agree. This is the check that stops another account's thread being rendered
  // under this account's heading if a backend ever misroutes.
  if (detail.accountId !== request.accountId) {
    return violation("a conversation from another account");
  }
  if (detail.conversationId !== request.conversationId) {
    return violation("a conversation other than the one requested");
  }

  return {
    ok: true,
    status: 200,
    body: {
      schemaVersion: ONLYFANS_PREVIEW_SCHEMA_VERSION,
      accountId: request.accountId,
      conversation: detail,
    },
  };
}

/** The JSON body a route returns for a refusal. Never includes private data. */
export function denialBody(denial: ReadDenial) {
  return { ok: false as const, state: denial.state, code: denial.code, error: denial.error };
}
