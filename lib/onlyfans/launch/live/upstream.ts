/** Server-only transport for the launch screens. Reuses the existing purpose credentials and the agency-scoped fetch;
 * it invents no auth path. Writes are attempted once and an unknown outcome is never reported as success. */
import { createHash } from "node:crypto";
import { configuredBackendPurpose, createBackendTransport } from "../../backend-transport";
import { CONFIGURATION_HEADER, CONFIGURATION_SCHEMA } from "../../configuration";
import { CONTROL_HEADER, CONTROL_SCHEMA } from "../../controls";
import { ONLYFANS_API_PATH, ONLYFANS_SCHEMA_VERSION_HEADER } from "../../backend";
import { canonicalContent } from "../../content";
import { ONLYFANS_PREVIEW_SCHEMA_VERSION } from "../../../onlyfans-preview/types";

import { fail, rec, ID, type Ans, type Rec } from "./shared";
export { rec, ID, FAN_ID, SCHEMA, ok, fail, READ_ONLY, type Rec, type Env, type Ans } from "./shared";
export const digest = (value: unknown) => createHash("sha256").update(canonicalContent(value)).digest("hex");

export type Kind = "configuration" | "control" | "read";
export type Upstream = { ok: true; body: Rec } |
  { ok: false; status: number; code: string; error: string; outcome: "refused" | "unconfirmed" | "unavailable" | "forbidden" };

const KINDS: Record<Kind, { purpose: "CONFIGURATION" | "CONTROL" | "API"; prefix: string; header: [string, string]; schema: string | null }> = {
  configuration: { purpose: "CONFIGURATION", prefix: "/onlyfans/configuration/v1", header: [CONFIGURATION_HEADER, CONFIGURATION_SCHEMA], schema: CONFIGURATION_SCHEMA },
  control: { purpose: "CONTROL", prefix: "/onlyfans/control/v1", header: [CONTROL_HEADER, CONTROL_SCHEMA], schema: CONTROL_SCHEMA },
  read: { purpose: "API", prefix: ONLYFANS_API_PATH, header: [ONLYFANS_SCHEMA_VERSION_HEADER, ONLYFANS_PREVIEW_SCHEMA_VERSION], schema: null },
};
const safeCode = (v: unknown) => typeof v === "string" && /^[a-z0-9_]{1,48}$/.test(v) ? v : "refused";

export async function upstream(fetchImpl: typeof fetch, kind: Kind, accountId: string, suffix: string,
  opts: { method?: "GET" | "POST"; body?: unknown; actor?: string | null; expectSchema?: string } = {}): Promise<Upstream> {
  const method = opts.method ?? "GET", spec = KINDS[kind];
  if (!ID.test(accountId)) return { ok: false, status: 400, code: "invalid_request", error: "That account reference is invalid.", outcome: "refused" };
  const unavailable = (error: string): Upstream => ({ ok: false, status: 503, code: "unavailable", error, outcome: "unavailable" });
  const unconfirmed: Upstream = { ok: false, status: 502, code: "outcome_unconfirmed", outcome: "unconfirmed",
    error: "The outcome is not confirmed. Refresh before trying again; a retry of the same request is safe." };
  const cfg = configuredBackendPurpose(spec.purpose);
  if (!cfg) return unavailable("This backend connection is not configured.");
  const headers: Record<string, string> = { Authorization: `Bearer ${cfg.token}`, [spec.header[0]]: spec.header[1], Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  // The service-only actor header is used when no agency scope narrows the call; an agency scope overrides it server-side.
  if (opts.actor) headers["X-OnlyFans-Actor"] = opts.actor;
  let response: Response;
  try {
    response = await createBackendTransport(fetchImpl)(`${cfg.baseUrl.replace(/\/+$/, "")}${spec.prefix}/accounts/${encodeURIComponent(accountId)}${suffix}`,
      { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body), timeoutMs: method === "GET" ? 8_000 : 15_000 });
  } catch { return method === "GET" ? unavailable("The backend could not be reached.") : unconfirmed; }
  let body: unknown = null;
  try { body = await response.json(); } catch { /* handled below */ }
  const code = rec(body) ? safeCode(body.code) : "refused";
  if (!response.ok) {
    const s = response.status;
    if (s === 403) return { ok: false, status: 403, code, outcome: "forbidden", error: "Your access does not allow this." };
    if (s === 404) return { ok: false, status: 404, code: "not_available", outcome: "refused", error: "That record is not available for this account." };
    if (s === 409) return { ok: false, status: 409, code, outcome: "refused", error: "This changed since you loaded it, or the command was reused. Refresh and review before trying again." };
    if ([400, 413].includes(s)) return { ok: false, status: s, code, outcome: "refused", error: "The request was not accepted." };
    if (s === 401 || s === 503) return unavailable("The backend connection is not available.");
    return method === "GET" ? unavailable("The backend could not answer this read.") : unconfirmed;
  }
  const schema = opts.expectSchema ?? spec.schema;
  if (!rec(body) || (schema !== null && body.schemaVersion !== schema) || (rec(body) && body.ok === false) ||
      (body.accountId !== undefined && body.accountId !== accountId))
    return method === "GET" ? unavailable("The backend answered with something this dashboard does not understand.") : unconfirmed;
  return { ok: true, body };
}

/** Maps a failed upstream to the dashboard answer. */
export const refusal = (u: Extract<Upstream, { ok: false }>): Ans =>
  fail(u.status === 502 ? 502 : u.status, u.error, u.code, { outcome: u.outcome });
