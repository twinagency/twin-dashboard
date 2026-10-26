// ── The Twin side's OnlyFans backend port ────────────────────────────────
//
// This is the *server-side* boundary between the dashboard and the consolidated
// OnlyFans backend described in twin-sexbot/docs/onlyfans/CONSOLIDATION_PLAN.md.
// Nothing here implements that backend, and nothing here claims it exists: it
// reads three documented families and refuses when there is nothing configured
// to read.
//
// Two rules from the plan shape this module:
//
//   * The dashboard renders projections and submits commands; it does not
//     invent a second writable store. So this is read-only by construction — it
//     has no write method at all.
//   * Authorization is derived from the authenticated identity and
//     server-owned creator/account binding. A browser-supplied account id is
//     only ever forwarded as a *request*, and the backend must still decide
//     whether to answer it.
//
// The transport is injectable so the read path can be driven offline with a
// fake backend in tests. That seam is a constructor argument, not an
// environment flag: there is no value of any env var that makes production use
// a fake, and the route handler below is the only place a real one comes from.

import type {
  OnlyFansPreviewSchemaVersion,
  ConversationDetail,
  ConversationSummary,
  CursorPage,
  OfAccount,
} from "../onlyfans-preview/types";
import { ONLYFANS_PREVIEW_SCHEMA_VERSION } from "../onlyfans-preview/types";
import { parseNativeEarnings, validEarningsWindow, type NativeEarnings, type EarningsWindow } from "./earnings";
import { parseMessageAttachments } from "./message-attachments";
import { parseOperations, type OperationsSnapshot } from "./operations";
import { parseWorkspace, NATIVE_SECTIONS, type NativeSection, type WorkspaceRead } from "./workspace";

/** Base URL is the backend origin (or proxy mount), without the API namespace. */
export const ONLYFANS_API_BASE_ENV = "ONLYFANS_API_BASE_URL";
export const ONLYFANS_API_TOKEN_ENV = "ONLYFANS_API_TOKEN";
export const ONLYFANS_API_PATH = "/onlyfans/api/v1";

/**
 * The header the scoped service requires on every request.
 *
 * The version is not decoration in either direction. The service refuses a
 * request that does not state it, and this client refuses an answer that does
 * not carry the one it implements — which is what stops a backend that kept the
 * field names and changed their meaning from being read as though nothing had
 * happened. `check-onlyfans-read.ts` asserts both halves.
 */
export const ONLYFANS_SCHEMA_VERSION_HEADER = "X-OnlyFans-Schema-Version";

/** A read timeout, so an unreachable backend degrades instead of hanging a page. */
export const ONLYFANS_READ_TIMEOUT_MS = 8_000;

export type BackendFailure = {
  ok: false;
  /** HTTP-ish status the dashboard should surface. */
  status: 400 | 401 | 403 | 404 | 500 | 502 | 503;
  code: string;
  error: string;
};

export type BackendResult<T> = { ok: true; data: T } | BackendFailure;

/**
 * Read-only. There is deliberately no send, pause, takeover or config method:
 * every mutation belongs to the delivery authority, which this package does not
 * build.
 */
export type OnlyFansBackend = {
  readonly label: string;
  listAccounts(request: { creatorId: string | null }): Promise<BackendResult<OfAccount[]>>;
  listConversations(
    accountId: string,
    cursor: string | null,
    aiOnly?: boolean,
  ): Promise<BackendResult<CursorPage<ConversationSummary>>>;
  getConversation(
    accountId: string,
    conversationId: string,
    cursor?: string | null,
  ): Promise<BackendResult<ConversationDetail>>;
  getEarnings?(window:EarningsWindow):Promise<BackendResult<NativeEarnings>>;
  getOperations?(accountId: string): Promise<BackendResult<OperationsSnapshot>>;
  getWorkspace?(accountId: string, section: NativeSection, cursor?: string | null): Promise<BackendResult<WorkspaceRead>>;
};

const ID_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;

function unavailable(reason: string): BackendFailure {
  return { ok: false, status: 503, code: "backend_unavailable", error: reason };
}

function malformed(what: string): BackendFailure {
  return {
    ok: false,
    status: 502,
    code: "backend_malformed_response",
    error: `The OnlyFans backend answered with something that is not a ${what}.`,
  };
}

/**
 * The answer is a shape this dashboard does not speak.
 *
 * A 500 on purpose, and the status is the point: `reads.ts` maps 502 (malformed)
 * to `unavailable` and 500 to an error, and the distinction is real. A malformed
 * answer means the backend is not there or is not answering this protocol; a
 * version mismatch means it IS answering, has told us which contract it speaks,
 * and that contract is not ours. Reporting the second as "nothing to read from"
 * would hide a deployment that needs a code change behind a state whose copy
 * says the backend is missing.
 */
function schemaMismatch(seen: unknown): BackendFailure {
  const what = typeof seen === "string" && seen ? `"${seen}"` : "none";
  return {
    ok: false,
    status: 500,
    code: "backend_schema_mismatch",
    error:
      `The OnlyFans backend speaks schema version ${what}; this dashboard implements ` +
      `${ONLYFANS_PREVIEW_SCHEMA_VERSION}.`,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * An HTTP implementation of the read port.
 *
 * It sends exactly one credential of its own — a scoped, server-only bearer
 * token. It never forwards the browser's cookies, a provider session or a
 * service-role key, and it never carries the caller's identity as a header the
 * backend is expected to trust: the backend is told *what* was asked for, and
 * the dashboard has already decided whether this caller may ask.
 */
export function createHttpOnlyFansBackend(options: {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): OnlyFansBackend {
  const base = options.baseUrl.replace(/\/+$/, "");
  const call = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? ONLYFANS_READ_TIMEOUT_MS;

  async function read<T>(path: string, shape: (body: unknown) => T | null, creatorLookup = false): Promise<BackendResult<T>> {
    let response: Response;
    try {
      response = await call(base + path, {
        method: "GET",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${options.token}`,
          // The service refuses a request that does not state its version.
          [ONLYFANS_SCHEMA_VERSION_HEADER]: ONLYFANS_PREVIEW_SCHEMA_VERSION,
        },
        // No cookies, and no caching of private conversation data anywhere.
        credentials: "omit",
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      // A timeout, a refused connection or DNS failure. The dashboard cannot
      // tell these apart and must not pretend the read succeeded.
      return unavailable("The OnlyFans backend could not be reached.");
    }

    if (!response.ok) {
      const status = response.status;
      // A verified creator may not have any native binding yet. Preserve this
      // exact refusal code without echoing backend text or accepting other 404s.
      if (creatorLookup && status === 404) {
        try {
          const body: unknown = await response.json();
          if (isRecord(body) && body.ok === false && body.state === "denied" && body.code === "unknown_creator") {
            return { ok: false, status: 404, code: "backend_unknown_creator", error: "That record is not available." };
          }
        } catch { /* A malformed refusal remains an ordinary backend error. */ }
      }
      if (status === 401 || status === 403 || status === 404 || status === 400) {
        return {
          ok: false,
          status,
          code: `backend_${status}`,
          // The backend's own message is not echoed: it may describe records
          // this caller is not authorized to know about.
          error:
            status === 404
              ? "That record is not available."
              : "The OnlyFans backend refused this read.",
        };
      }
      if (status === 503) return unavailable("The OnlyFans backend is not available.");
      return {
        ok: false,
        status: 500,
        code: "backend_error",
        error: "The OnlyFans backend failed to answer.",
      };
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return malformed("JSON response");
    }
    // The version first, and explicitly: before any field is read, and before
    // the per-read shape check, which would otherwise reject a future version's
    // answer as "malformed" and lose the reason.
    const version: OnlyFansPreviewSchemaVersion | unknown = isRecord(body)
      ? body.schemaVersion
      : undefined;
    if (version !== ONLYFANS_PREVIEW_SCHEMA_VERSION) {
      return schemaMismatch(version);
    }
    const parsed = shape(body);
    return parsed === null ? malformed("valid read model") : { ok: true, data: parsed };
  }

  return {
    label: "OnlyFans backend",

    getWorkspace(accountId, section, cursor = null) {
      if (!ID_PATTERN.test(accountId) || !NATIVE_SECTIONS.includes(section) || (cursor !== null && !/^[A-Za-z0-9_-]{1,256}$/.test(cursor))) {
        return Promise.resolve({ ok: false, status: 400, code: "invalid_workspace_request", error: "That account or page reference is not valid." });
      }
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      return read(`${ONLYFANS_API_PATH}/accounts/${accountId}/workspace/${section}${query}`, body => isRecord(body) ? parseWorkspace(body.workspace, accountId, section) : null);
    },

    getEarnings(window) {
      if(!validEarningsWindow(window))return Promise.resolve({ok:false,status:400,code:"invalid_earnings_window",error:"That reporting window is not supported."});
      return read(`${ONLYFANS_API_PATH}/earnings?start=${encodeURIComponent(window.start)}&end=${encodeURIComponent(window.end)}&includePending=true&includeHistory=true`,body=>isRecord(body)?parseNativeEarnings(body.earnings,window):null).then(result=>!result.ok&&result.status===400?read(`${ONLYFANS_API_PATH}/earnings?start=${encodeURIComponent(window.start)}&end=${encodeURIComponent(window.end)}`,body=>isRecord(body)?parseNativeEarnings(body.earnings,window):null):result);
    },
    getOperations(accountId) {
      if (!ID_PATTERN.test(accountId)) {
        return Promise.resolve({ ok: false, status: 400, code: "invalid_account_id", error: "That account reference is not a valid identifier." });
      }
      return read(`${ONLYFANS_API_PATH}/accounts/${accountId}/operations`, (body) => {
        return isRecord(body) ? parseOperations(body.operations, accountId) : null;
      });
    },

    listAccounts({ creatorId }) {
      // Validated before it reaches the wire, so a browser id cannot become a
      // path segment or a query the backend has to defend against.
      if (creatorId !== null && !ID_PATTERN.test(creatorId)) {
        return Promise.resolve({
          ok: false,
          status: 400,
          code: "invalid_creator_id",
          error: "That creator reference is not a valid identifier.",
        } satisfies BackendFailure);
      }
      const query = creatorId ? `?creator=${encodeURIComponent(creatorId)}` : "";
      return read(`${ONLYFANS_API_PATH}/accounts${query}`, (body) => {
        if (!isRecord(body) || !Array.isArray(body.accounts)) return null;
        return body.accounts as OfAccount[];
      }, creatorId !== null);
    },

    listConversations(accountId, cursor, aiOnly) {
      if (!ID_PATTERN.test(accountId)) {
        return Promise.resolve({
          ok: false,
          status: 400,
          code: "invalid_account_id",
          error: "That account reference is not a valid identifier.",
        } satisfies BackendFailure);
      }
      const params = new URLSearchParams();
      if (cursor) params.set("cursor", cursor);
      if (aiOnly) params.set("filter", "ai");
      const query = params.size ? `?${params}` : "";
      return read(`${ONLYFANS_API_PATH}/accounts/${accountId}/conversations${query}`, (body) => {
        if (!isRecord(body) || !isRecord(body.page)) return null;
        const page = body.page;
        if (!Array.isArray(page.items)) return null;
        return {
          items: page.items as ConversationSummary[],
          nextCursor: typeof page.nextCursor === "string" ? page.nextCursor : null,
        };
      });
    },

    getConversation(accountId, conversationId, cursor) {
      if (!ID_PATTERN.test(accountId) || !ID_PATTERN.test(conversationId)) {
        return Promise.resolve({
          ok: false,
          status: 400,
          code: "invalid_conversation_id",
          error: "That conversation reference is not a valid identifier.",
        } satisfies BackendFailure);
      }
      return read(`${ONLYFANS_API_PATH}/accounts/${accountId}/conversations/${conversationId}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, (body) => {
        if (!isRecord(body) || !isRecord(body.conversation)) return null;
        const messages = body.conversation.messages;
        if (Array.isArray(messages) && messages.some(message => isRecord(message) && message.attachments !== undefined && !parseMessageAttachments(message.attachments))) return null;
        return body.conversation as ConversationDetail;
      });
    },
  };
}

/**
 * The configured backend, or null when this environment has none.
 *
 * Null is a real answer and the caller must surface it as `unavailable`. It is
 * never a reason to fall back to fixtures: a dashboard that invents accounts
 * because its backend is missing is worse than one that says so.
 */
export function configuredOnlyFansBackend(
  fetchImpl?: typeof fetch,
): OnlyFansBackend | null {
  const baseUrl = (process.env[ONLYFANS_API_BASE_ENV] ?? "").trim();
  const token = (process.env[ONLYFANS_API_TOKEN_ENV] ?? "").trim();
  if (!baseUrl || !token) return null;
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    // A malformed base URL disables the live path rather than being sent
    // somewhere unintended.
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (!parsed.hostname) return null;
  return createHttpOnlyFansBackend({ baseUrl, token, fetchImpl });
}
