/** Server-only transport. Reuses existing purpose credentials and agency-scoped fetch. */
import {
  createBackendTransport,
  configuredBackendPurpose,
} from "../backend-transport";
import { CONFIGURATION_HEADER, CONFIGURATION_SCHEMA } from "../configuration";
import { object, timestamp } from "./native";

export type NativeResult =
  | { ok: true; data: Record<string, unknown> }
  | {
      ok: false;
      status: number;
      outcome: "refused" | "unconfirmed" | "unavailable";
      error: string;
    };
export function createNativeConfigurationBackend(options: {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
}) {
  const send = createBackendTransport(options.fetchImpl);
  return async (
    accountId: string,
    path: string,
    method: "GET" | "POST" = "GET",
    body?: unknown,
    query: Record<string, string> = {},
  ): Promise<NativeResult> => {
    const url = new URL(
      `${options.baseUrl.replace(/\/+$/, "")}/onlyfans/configuration/v1/accounts/${encodeURIComponent(accountId)}${path ? `/${path}` : ""}`,
    );
    for (const [key, value] of Object.entries(query))
      url.searchParams.set(key, value);
    try {
      const r = await send(url.toString(), {
        method,
        headers: {
          Authorization: `Bearer ${options.token}`,
          [CONFIGURATION_HEADER]: CONFIGURATION_SCHEMA,
          ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (r.ok) {
        const j: unknown = await r.json();
        if (
          object(j) &&
          j.schemaVersion === CONFIGURATION_SCHEMA &&
          j.ok === true &&
          j.accountId === accountId &&
          (method === "GET" ||
            !object(body) ||
            !Object.hasOwn(body, "commandKey") ||
            j.commandKey === body.commandKey)
        )
          return { ok: true, data: j };
      } else if ([400, 401, 403, 404, 409, 413, 422].includes(r.status))
        return {
          ok: false,
          status: r.status,
          outcome: "refused",
          error:
            r.status === 409
              ? "The state changed or this command was reused. Refresh and review before continuing."
              : "The backend did not accept this request.",
        };
      else if (r.status === 503)
        return {
          ok: false,
          status: 503,
          outcome: "unavailable",
          error: "This account service is unavailable.",
        };
    } catch {
      /* A missing or invalid acknowledgement never establishes failure of a write. */
    }
    return method === "GET"
      ? {
          ok: false,
          status: 503,
          outcome: "unavailable",
          error: "The account state could not be verified.",
        }
      : {
          ok: false,
          status: 502,
          outcome: "unconfirmed",
          error:
            "The outcome is not confirmed. Read the current state, then retry the identical request if needed.",
        };
  };
}
export function configuredNativeConfigurationBackend(fetchImpl?: typeof fetch) {
  const options = configuredBackendPurpose("CONFIGURATION");
  return options
    ? createNativeConfigurationBackend({ ...options, fetchImpl })
    : null;
}

import { ONLYFANS_PREVIEW_SCHEMA_VERSION } from "../../onlyfans-preview/types";
import { ONLYFANS_SCHEMA_VERSION_HEADER } from "../backend";
import { CONTROL_HEADER, CONTROL_SCHEMA } from "../controls";
/** Read authority is never replaced with configuration or control credentials. */
export function createNativeReadBackend(options: {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
}) {
  const send = createBackendTransport(options.fetchImpl);
  return async (
    accountId: string,
    path: "readiness" | "ledger" | "ledger/evidence",
    query: Record<string, string> = {},
  ): Promise<NativeResult> => {
    const url = new URL(
      `${options.baseUrl.replace(/\/+$/, "")}/onlyfans/api/v1/accounts/${encodeURIComponent(accountId)}/${path}`,
    );
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    try {
      const r = await send(url.toString(), {
        method: "GET",
        headers: { Authorization: `Bearer ${options.token}`, [ONLYFANS_SCHEMA_VERSION_HEADER]: ONLYFANS_PREVIEW_SCHEMA_VERSION },
      });
      const value: unknown = await r.json().catch(() => null);
      const reference = r.headers.get("X-OnlyFans-Evidence-Reference");
      const suffix = reference && /^[a-f0-9]{32}$/.test(reference) ? ` Reference: ${reference}.` : "";
      const unavailable = (error: string, status = 503): NativeResult => ({ ok: false, status, outcome: "unavailable", error: error + suffix });
      if (r.status === 401) return unavailable("The dashboard's account-read credential was rejected. Ask the release owner to check the API credential.");
      if ([400, 403, 404, 409].includes(r.status)) return { ok: false, status: r.status, outcome: "refused", error: `Account evidence was refused (HTTP ${r.status}). Refresh your assigned account and session.` + suffix };
      if (!r.ok) return unavailable(`The account evidence service failed (HTTP ${r.status}). Ask the release owner to inspect the matching backend request.`);
      if (!object(value)) return unavailable("Account evidence returned invalid JSON; no readiness result is available.", 502);
      if (value.schemaVersion !== (path === "ledger" ? "of-ledger.v1" : ONLYFANS_PREVIEW_SCHEMA_VERSION)) return unavailable("Account evidence uses an unsupported response version. Check the deployed dashboard/API release pair.", 502);
      if ((path !== "ledger" && value.ok !== true) || value.accountId !== accountId) return unavailable("Account evidence did not confirm the requested account. No readiness result is available.", 502);
      return { ok: true, data: value };
    } catch (error) {
      return { ok: false, status: 503, outcome: "unavailable", error: error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)
        ? "The account evidence request timed out. Retry; persistent timeouts need API latency and lock investigation."
        : "The account evidence service could not be reached. Check the connection and retry." };
    }
  };
}
export function createNativeControlBackend(options: {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
}) {
  const send = createBackendTransport(options.fetchImpl);
  return async (
    accountId: string,
    path: "control" | "ledger/retry" | "ledger/resolve",
    body: Record<string, unknown>,
  ): Promise<NativeResult> => {
    const { actor, ...retryBody } = body;
    try {
      const r = await send(
        `${options.baseUrl.replace(/\/+$/, "")}/onlyfans/control/v1/accounts/${encodeURIComponent(accountId)}/${path}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${options.token}`,
            [CONTROL_HEADER]: CONTROL_SCHEMA,
            "Content-Type": "application/json",
            ...(path === "ledger/retry" && typeof actor === "string" ? { "X-OnlyFans-Actor": actor } : {}),
          },
          body: JSON.stringify(path === "ledger/retry" ? retryBody : body),
        },
      );
      if (r.ok) {
        const j: unknown = await r.json();
        if (
          object(j) &&
          j.schemaVersion === CONTROL_SCHEMA &&
          j.ok === true &&
          j.accountId === accountId &&
          (path === "ledger/retry" ?
            j.accepted === true && j.outcome === "queued" && j.commandKey === body.commandKey && timestamp(j.queuedAt) && j.queuedAt !== null :
          object(j.command) &&
          j.command.recorded === true &&
          j.command.commandKey === body.commandKey)
        )
          return { ok: true, data: j };
      } else if ([400, 401, 403, 404, 409, 413, 503].includes(r.status))
        return {
          ok: false,
          status: r.status,
          outcome: r.status === 503 ? "unavailable" : "refused",
          error:
            r.status === 409
              ? "The account changed or prerequisites are unmet. Refresh before continuing."
              : "The account action was not accepted.",
        };
    } catch {}
    return {
      ok: false,
      status: 502,
      outcome: "unconfirmed",
      error:
        "The account action outcome is not confirmed. Read authoritative state before retrying the identical request.",
    };
  };
}
export function configuredNativeReadBackend(fetchImpl?: typeof fetch) {
  const o = configuredBackendPurpose("API");
  return o ? createNativeReadBackend({ ...o, fetchImpl }) : null;
}
export function configuredNativeControlBackend(fetchImpl?: typeof fetch) {
  const o = configuredBackendPurpose("CONTROL");
  return o ? createNativeControlBackend({ ...o, fetchImpl }) : null;
}
