/** Native configuration-purpose launch transport. Browser credentials remain server-side. */
import { configuredBackendPurpose } from "../backend-transport";
import {
  createNativeConfigurationBackend,
  createNativeReadBackend,
  createNativeControlBackend,
} from "./native-backend";
import {
  object,
  parseNativePersonality,
  parsePersonalityHistory,
  parseNativeReadiness,
  parseNativeLedger,
} from "./native";
import { parseLedger } from "./ledger-model";

export type LaunchBackendResult =
  | { ok: true; data: unknown }
  | {
      ok: false;
      status: number;
      error: string;
      outcome: "refused" | "unconfirmed" | "unavailable";
    };
export type LaunchBackend = {
  read(
    accountId: string,
    path: string,
    query: Record<string, string>,
  ): Promise<LaunchBackendResult>;
  command(
    accountId: string,
    path: string,
    body: unknown,
  ): Promise<LaunchBackendResult>;
};
export function createLaunchBackend(options: {
  baseUrl: string;
  token: string;
  apiToken?: string;
  controlToken?: string;
  fetchImpl?: typeof fetch;
}): LaunchBackend {
  const call = options.token ? createNativeConfigurationBackend(options) : null;
  const read = options.apiToken
    ? createNativeReadBackend({ ...options, token: options.apiToken })
    : null;
  const control = options.controlToken
    ? createNativeControlBackend({ ...options, token: options.controlToken })
    : null;
  return {
    async read(accountId, path, query) {
      if (path === "readiness" || path === "purchases" || path === "purchases/evidence") {
        if (!read)
          return {
            ok: false,
            status: 503,
            outcome: "unavailable",
            error: "The account read authority is not configured.",
          };
        const r = await read(
          accountId,
          path === "purchases" ? "ledger" : path === "purchases/evidence" ? "ledger/evidence" : "readiness",
          query,
        );
        if (!r.ok) return r;
        const data =
          path === "purchases" ? parseLedger(r.data, accountId) : path === "purchases/evidence"
            ? parseNativeLedger(r.data.ledger)
            : parseNativeReadiness(r.data.readiness);
        return data
          ? { ok: true, data }
          : {
              ok: false,
              status: 502,
              outcome: "unavailable",
              error:
                "The account evidence did not match the supported contract.",
            };
      }
      if (
        !["personality", "personality/history"].includes(path) &&
        !/^personality\/revisions\/[1-9][0-9]{0,9}$/.test(path)
      )
        return {
          ok: false,
          status: 404,
          outcome: "refused",
          error: "That account resource is not available.",
        };
      if (!call)
        return {
          ok: false,
          status: 503,
          outcome: "unavailable",
          error: "The account configuration authority is not configured.",
        };
      const r = await call(accountId, path, "GET", undefined, query);
      if (!r.ok) return r;
      if (r.data.personalityVersion !== "of-personality.v1")
        return {
          ok: false,
          status: 502,
          outcome: "unavailable",
          error: "The personality response version is not supported.",
        };
      const data =
        path === "personality/history"
          ? parsePersonalityHistory(r.data.personality)
          : parseNativePersonality(r.data.personality);
      return data
        ? { ok: true, data }
        : {
            ok: false,
            status: 502,
            outcome: "unavailable",
            error: "The account response did not match the supported contract.",
          };
    },
    async command(accountId, path, body) {
      if (path === "ledger/retry" || path === "ledger/resolve") {
        if (!control)
          return {
            ok: false,
            status: 503,
            outcome: "unavailable",
            error: "The account control authority is not configured.",
          };
        if (!object(body))
          return {
            ok: false,
            status: 400,
            outcome: "refused",
            error: "Invalid account action.",
          };
        const r = await control(accountId, path, body);
        return r.ok ? { ok: true, data: path === "ledger/retry" ? {outcome: "queued", queuedAt: r.data.queuedAt} : r.data.command } : r;
      }
      if (
        ![
          "personality/import",
          "personality/review",
          "personality/approve",
        ].includes(path)
      )
        return {
          ok: false,
          status: 400,
          outcome: "refused",
          error: "That account action is invalid.",
        };
      if (!call)
        return {
          ok: false,
          status: 503,
          outcome: "unavailable",
          error: "The account configuration authority is not configured.",
        };
      const r = await call(accountId, path, "POST", body);
      if (!r.ok) return r;
      if (r.data.personalityVersion !== "of-personality.v1")
        return {
          ok: false,
          status: 502,
          outcome: "unconfirmed",
          error:
            "The personality acknowledgement version could not be verified. Refresh current state.",
        };
      const data = parseNativePersonality(r.data.personality);
      const expectedState = path === "personality/approve" ? "approved" : "draft";
      return data && object(body) && data.bindingId === body.expectedBindingId &&
        data.revision === Number(body.expectedRevision) + 1 && data.state === expectedState
        ? { ok: true, data }
        : {
            ok: false,
            status: 502,
            outcome: "unconfirmed",
            error:
              "The acknowledgement could not be verified. Refresh the current personality.",
          };
    },
  };
}
export function configuredLaunchBackend(
  fetchImpl?: typeof fetch,
): LaunchBackend | null {
  const options = configuredBackendPurpose("CONFIGURATION");
  const read = configuredBackendPurpose("API"),
    control = configuredBackendPurpose("CONTROL");
  const base = options ?? read ?? control;
  return base
    ? createLaunchBackend({
        baseUrl: base.baseUrl,
        token: options?.token ?? "",
        apiToken: read?.token,
        controlToken: control?.token,
        fetchImpl,
      })
    : null;
}
