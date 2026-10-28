import { inboxSearchParams, type InboxSearch } from "../onlyfans/inbox-search";
// The live frontend read adapter.
//
// It speaks to the dashboard's read and scoped control handlers. Each handler
// verifies the internal operator
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
import { controlRefusalNote, isControlAction, parseControlAck, type RecordedControlResult } from "../onlyfans/controls";
import type {
  AccountScopeRequest,
  ConversationDetail,
  ConversationSummary,
  CursorPage,
  Freshness,
  OfAccount,
  RequestState,
  CommandRequest,
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
    aiOnly?: boolean,
    search?: InboxSearch,
  ): Promise<TransportReply<CursorPage<ConversationSummary>>>;
  readConversation(
    accountId: string,
    conversationId: string,
    cursor?: string | null,
  ): Promise<TransportReply<ConversationDetail>>;
  submitControl?(request: CommandRequest): Promise<RecordedControlResult>;
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

    async submitControl(command) {
      const result = (outcome: RecordedControlResult["outcome"], note: string,
        recordedRevision?: number, intentId?: string): RecordedControlResult => ({ simulated: false,
        applied: outcome === "recorded", accepted: outcome === "recorded", outcome,
        request: command, note, recordedRevision, intentId });
      const manualBody = command.command === "send_manual_message" && command.payload.kind === "manual_message" ? command.payload.body : null;
      const manual = manualBody !== null;
      const action = manual ? "manual_message" : command.command;
      if ((!manual && (!isControlAction(action) || command.payload.kind !== "none")) ||
          (manualBody !== null && (!manualBody.trim() || new TextEncoder().encode(manualBody).length > 4000))) {
        return result("refused", "That action is not configured for this account.");
      }
      try {
        const response = await call(`/api/onlyfans-controls/accounts/${encodeURIComponent(command.accountId)}/conversations/${encodeURIComponent(command.conversationId)}`, {
          method: "POST", credentials: "same-origin", redirect: "error", cache: "no-store",
          signal: AbortSignal.timeout(12_000), headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, expectedRevision: command.expectedRevision,
            ...(manual && command.payload.kind === "manual_message" ? { body: command.payload.body, requestKey: command.idempotencyKey,
              ...(command.payload.catalogItemId !== undefined ? { catalogItemId: command.payload.catalogItemId } : {}) } : {}) }),
        });
        if ([400, 401, 403, 404, 409, 413, 503].includes(response.status)) {
          const refusal = await response.json().catch(() => null);
          return result("refused", controlRefusalNote(response.status, refusal));
        }
        if (response.ok) {
          const ack = parseControlAck(await response.json(), { ...command, action });
          if (ack) return result("recorded", manual
            ? "Your message was queued. Delivery will appear in the conversation after provider confirmation."
            : "The change was saved. The conversation is being refreshed.", ack.recordedRevision, ack.intentId);
        }
      } catch { /* Keep the original command for an explicit idempotent retry. */ }
      return result("unconfirmed", "The outcome is not confirmed. Refresh the conversation or retry this same request.");
    },

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

    readConversations(accountId, cursor, aiOnly, search) {
      const params = inboxSearchParams(aiOnly, search);
      if (cursor) params.set("cursor", cursor);
      const query = params.size ? `?${params}` : "";
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

    readConversation(accountId, conversationId, cursor) {
      return request(
        `/accounts/${encodeURIComponent(accountId)}/conversations/${encodeURIComponent(conversationId)}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
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

function oldestStale(values: Freshness[]): Freshness | null {
  return values.filter((value) => value.stale).reduce<Freshness | null>((oldest, value) => {
    const age = (item: Freshness) => item.asOf ? Date.parse(item.asOf) : -Infinity;
    return !oldest || age(value) < age(oldest) ? value : oldest;
  }, null);
}

function toState<T>(
  reply: TransportReply<T>,
  isEmpty: (data: T) => boolean,
  freshnessOf: (data: T) => Freshness | null,
): RequestState<T> {
  switch (reply.outcome) {
    case "ok": {
      if (isEmpty(reply.data)) return { status: "empty" };
      const freshness = freshnessOf(reply.data);
      return freshness?.stale
        ? { status: "stale", data: reply.data, freshness }
        : { status: "ready", data: reply.data };
    }
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
      return toState(
        await transport.readAccounts(scope ?? {}),
        (accounts) => accounts.length === 0,
        (accounts) => oldestStale(accounts.map((account) => account.syncFreshness)),
      );
    },

    async getAccount(accountId, scope) {
      const state = await this.listAccounts(scope);
      if (state.status !== "ready" && state.status !== "stale") {
        return state as RequestState<OfAccount>;
      }
      const found = state.data.find((account) => account.accountId === accountId);
      if (!found) return { status: "error", message: "This account is not available in the current view." };
      return toState({ outcome: "ok", data: found }, () => false, (account) => account.syncFreshness);
    },

    async listConversations(accountId, cursor, aiOnly, search) {
      return toState(
        await transport.readConversations(accountId, cursor ?? null, aiOnly, search),
        (page) => page.items.length === 0,
        (page) => oldestStale(page.items.map((conversation) => conversation.freshness)),
      );
    },

    async getConversation(accountId, conversationId, cursor) {
      return toState(
        await transport.readConversation(accountId, conversationId, cursor),
        () => false,
        (conversation) => conversation.freshness,
      );
    },

    async submitCommand(request) {
      if (!transport.submitControl) throw new Error("OnlyFans conversation controls are unavailable.");
      return transport.submitControl(request);
    },
  };
}
