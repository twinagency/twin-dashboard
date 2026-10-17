// The live frontend read adapter.
//
// It speaks to the dashboard's own narrow read handlers (/api/onlyfans/*) and
// to nothing else. Each handler has already verified the internal operator
// session and asked the OnlyFans backend what this operator may read, so this
// module's job is only to map a transport outcome onto the one request-state
// vocabulary the components render.
//
// THE TRANSPORT IS INJECTED. In the running dashboard it is `fetch`. In the
// offline checks it is a fake that returns canned replies, which is how the
// whole handler/adapter flow — authorization, cross-account denial, paging,
// out-of-order responses, backend failures — is exercised without a backend, a
// database or a provider. The seam is a constructor argument and never an
// environment flag, so there is no configuration that makes production read
// from a fake.
//
// There is no fixture import anywhere in this file, and no fallback path: if the
// transport says the backend is missing, the state is `unavailable`. A live
// dashboard that quietly invented accounts would be worse than one that says it
// cannot reach its backend.

import type { OnlyFansDataSource } from "./data-source";
import type {
  AccountScopeRequest,
  ConversationDetail,
  ConversationSummary,
  CursorPage,
  OfAccount,
  RequestState,
} from "./types";

export type TransportReply<T> =
  | { outcome: "ok"; data: T }
  /** The backend is not there. Distinct from a failed read, by design. */
  | { outcome: "unavailable"; message: string }
  /** The caller or the record was refused. */
  | { outcome: "denied"; message: string }
  /** The read was attempted and did not succeed. */
  | { outcome: "failed"; message: string };

export type OnlyFansTransport = {
  readonly kind: "fetch" | "fake";
  readAccounts(scope: AccountScopeRequest): Promise<TransportReply<OfAccount[]>>;
  readConversations(
    accountId: string,
    cursor: string | null,
  ): Promise<TransportReply<CursorPage<ConversationSummary>>>;
  readConversation(
    accountId: string,
    conversationId: string,
  ): Promise<TransportReply<ConversationDetail>>;
};

const UNAVAILABLE_COPY =
  "This dashboard has no OnlyFans backend configured, so no account, session or conversation " +
  "can be read. Nothing here is a guess: the surface is empty because nothing answered.";

function notJson(): TransportReply<never> {
  return {
    outcome: "unavailable",
    message:
      "The OnlyFans read did not return dashboard data. This usually means the dashboard " +
      "session was not accepted for that request.",
  };
}

/**
 * The real transport: the dashboard's own read handlers, same-origin.
 *
 * `cache: "no-store"` and no cross-origin requests. It sends no credential of
 * its own — the browser's session cookie is the identity, and the handler is
 * what verifies it.
 */
export function createFetchOnlyFansTransport(
  fetchImpl?: typeof fetch,
  base = "/api/onlyfans",
): OnlyFansTransport {
  const call = fetchImpl ?? fetch;

  async function request<T>(path: string, pick: (body: unknown) => T | null): Promise<TransportReply<T>> {
    let response: Response;
    try {
      response = await call(base + path, {
        method: "GET",
        headers: { accept: "application/json" },
        credentials: "same-origin",
        cache: "no-store",
      });
    } catch {
      return { outcome: "unavailable", message: UNAVAILABLE_COPY };
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      // A login redirect, an HTML error page or a proxy response. Never parsed
      // as data.
      return notJson();
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return notJson();
    }

    if (response.ok) {
      const picked = pick(body);
      return picked === null ? notJson() : { outcome: "ok", data: picked };
    }

    const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
    const message = typeof record.error === "string" ? record.error : undefined;
    if (response.status === 401 || response.status === 403 || response.status === 404) {
      return { outcome: "denied", message: message ?? "That record is not available to this session." };
    }
    // 503 is the one status that means "there is nothing to read from". A 500
    // or a 502 means the read was attempted and failed, which is a different
    // thing and is reported as one.
    if (response.status === 503) {
      return { outcome: "unavailable", message: message ?? UNAVAILABLE_COPY };
    }
    if (response.status >= 500) {
      return { outcome: "failed", message: message ?? "The OnlyFans read did not succeed." };
    }
    return { outcome: "failed", message: message ?? "The OnlyFans read did not succeed." };
  }

  return {
    kind: "fetch",

    readAccounts(scope) {
      const params = new URLSearchParams();
      if (scope.creatorId) params.set("creator", scope.creatorId);
      if (scope.accountId) params.set("account", scope.accountId);
      const query = params.toString();
      return request(`/accounts${query ? `?${query}` : ""}`, (body) => {
        if (typeof body !== "object" || body === null) return null;
        const accounts = (body as { accounts?: unknown }).accounts;
        return Array.isArray(accounts) ? (accounts as OfAccount[]) : null;
      });
    },

    readConversations(accountId, cursor) {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      return request(`/accounts/${encodeURIComponent(accountId)}/conversations${query}`, (body) => {
        if (typeof body !== "object" || body === null) return null;
        const page = (body as { page?: unknown }).page;
        if (typeof page !== "object" || page === null) return null;
        const items = (page as { items?: unknown }).items;
        if (!Array.isArray(items)) return null;
        const next = (page as { nextCursor?: unknown }).nextCursor;
        return {
          items: items as ConversationSummary[],
          nextCursor: typeof next === "string" ? next : null,
        } satisfies CursorPage<ConversationSummary>;
      });
    },

    readConversation(accountId, conversationId) {
      return request(
        `/accounts/${encodeURIComponent(accountId)}/conversations/${encodeURIComponent(conversationId)}`,
        (body) => {
          if (typeof body !== "object" || body === null) return null;
          const conversation = (body as { conversation?: unknown }).conversation;
          return typeof conversation === "object" && conversation !== null
            ? (conversation as ConversationDetail)
            : null;
        },
      );
    },
  };
}

function toState<T>(reply: TransportReply<T>, isEmpty: (data: T) => boolean): RequestState<T> {
  switch (reply.outcome) {
    case "ok":
      return isEmpty(reply.data) ? { status: "empty" } : { status: "ready", data: reply.data };
    case "unavailable":
      return { status: "unavailable", message: reply.message };
    case "denied":
    case "failed":
      return { status: "error", message: reply.message };
  }
}

/**
 * The live data source over an injected transport.
 *
 * `kind` is `"live"` because every read goes to the server; there is no
 * fixture branch in this module for that value to be confused with.
 */
export function createServerOnlyFansDataSource(options: {
  transport: OnlyFansTransport;
}): OnlyFansDataSource {
  const { transport } = options;
  return {
    kind: "live",
    label: "Live",

    async listAccounts(scope) {
      return toState(await transport.readAccounts(scope ?? {}), (accounts) => accounts.length === 0);
    },

    async getAccount(accountId, scope) {
      const state = await this.listAccounts(scope);
      if (state.status !== "ready" && state.status !== "stale") {
        return state as RequestState<OfAccount>;
      }
      const found = state.data.find((account) => account.accountId === accountId);
      return found
        ? { status: "ready", data: found }
        : { status: "error", message: "This account is not available in the current view." };
    },

    async listConversations(accountId, cursor) {
      return toState(
        await transport.readConversations(accountId, cursor ?? null),
        (page) => page.items.length === 0,
      );
    },

    async getConversation(accountId, conversationId) {
      return toState(await transport.readConversation(accountId, conversationId), () => false);
    },

    async submitCommand() {
      // There is no delivery authority in this package. A live route must not
      // pretend otherwise, so the refusal says exactly that.
      throw new Error(
        "No OnlyFans delivery authority is wired up: sending, takeover, reconnect and every " +
          "other mutation remain unavailable outside the isolated preview.",
      );
    },
  };
}
