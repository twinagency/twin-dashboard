/** Public account connection contract. Credentials are write-only. */
export const CONNECTION_SCHEMA = "of-connections.v1";
export const CONNECTION_HEADER = "X-OnlyFans-Connection-Version";
export type ConnectionCreator = { id: string; name: string };
export type ConnectionStatus = "unconfigured" | "pending" | "verified" | "failed" | "expired" | "paused";
export type Connection = { accountId: string; revision: number; status: ConnectionStatus; ownerId: string | null;
  expiresAt: string | null; verifiedAt: string | null; lastError: string | null; outgoingEnabled: boolean;
  policyRevision: number; usedUnits: number; limitUnits: number; mediaEnabled: boolean; automateNewConversations: boolean };
export type ConnectionSave = { ownerId: number; capture: Record<string, unknown>; xHash: string; proxyUrl: string | null;
  expiresAt: string; model: { modelId: string; apiKey: string } | null };
export type ConnectionRequest = { expectedRevision: number } & (
  { action: "save"; payload: ConnectionSave } |
  { action: "session"; payload: Pick<ConnectionSave,"ownerId"|"capture"|"xHash"|"expiresAt"> } |
  { action: "activate"; payload: { limitUnits: number; throttleSeconds: number; mediaEnabled: boolean; automateNewConversations?: boolean } } |
  { action: "verify" | "pause"; payload: Record<string, never> }
);
export type ConnectionRegistration = { creatorId: string; ownerId: number; handle: string };
export type ConnectionEnrollment = { id: string; status: "pending" | "checking" | "accepted" | "failed" | "expired"; accountId: string | null; error: string | null; expiresAt: string };
export type ConnectionEnrollmentRequest = { creatorId: string; creatorName: string; handle: string; session: Pick<ConnectionSave,"ownerId"|"capture"|"xHash"|"expiresAt"> | import("@/lib/creator-platforms/browser-connection").BrowserSession };
export type ConnectionAck = { schemaVersion: typeof CONNECTION_SCHEMA; ok: true; applied: true; accountId: string;
  commandKey: string; recordedRevision: number; action: ConnectionRequest["action"] };
export type RegistrationAck = { schemaVersion: typeof CONNECTION_SCHEMA; ok: true; applied: true; accountId: string; commandKey: string; status: "unconfigured" };
export type ConnectionFailure = { ok: false; status: number; outcome: "refused" | "unconfirmed"; error: string };
export const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).sort().join(",") === [...keys].sort().join(",");
const integer = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number => Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max;
const id = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9._:-]{1,64}$/.test(value);
const ownerString = (value: unknown): value is string => typeof value === "string" && /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) < BigInt("9223372036854775808");
const hash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const bytes = (value: unknown, max: number): value is string => typeof value === "string" && value.isWellFormed() && !value.includes("\0") && new TextEncoder().encode(value).length <= max;
const stamp = (value: unknown): value is string => typeof value === "string" && /(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
const header = (value: unknown, max = 4096): value is string => typeof value === "string" && value.length >= 1 && value.length <= max && /^[\x20-\x7e]+$/.test(value);
export function connectionOwner(value: string): number | null {
  if (!/^[1-9][0-9]{0,15}$/.test(value)) return null;
  const parsed = Number(value); return integer(parsed, 1) ? parsed : null;
}
export function connectionCapture(value: unknown, ownerId: number): value is Record<string, unknown> {
  if (!object(value) || !object(value.headers) || !object(value.signing) || !object(value.signing.rules) ||
    String(value.headers.user_id) !== String(ownerId) || !Array.isArray(value.cookies) || !value.cookies.length || value.cookies.length > 64) return false;
  const headers = value.headers, rules = value.signing.rules;
  if (![headers.user_agent, headers.x_bc, headers.x_of_rev, rules.static_param, rules.start, rules.end].every(value => header(value)) ||
    !Array.isArray(rules.checksum_indexes) || rules.checksum_indexes.length !== 32 || !rules.checksum_indexes.every(value => integer(value, 0, 39)) ||
    !integer(rules.checksum_constant, -1_000_000_000, 1_000_000_000)) return false;
  const names = new Set<string>(); let cookieBytes = 0;
  for (const row of value.cookies) {
    if (!object(row) || typeof row.name !== "string" || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}$/.test(row.name) || names.has(row.name) ||
      !header(row.value, 8192) || /[;,"\\\s]/.test(row.value) || ![undefined, "onlyfans.com", ".onlyfans.com"].includes(row.domain as string | undefined) ||
      ![undefined, "/"].includes(row.path as string | undefined)) return false;
    names.add(row.name); cookieBytes += row.name.length + row.value.length + 3;
  }
  try { return cookieBytes <= 16386 && new TextEncoder().encode(JSON.stringify(value)).length <= 98_304; } catch { return false; }
}
export function validConnectionRequest(value: unknown): value is ConnectionRequest {
  if (!object(value) || !exact(value, ["action", "payload", "expectedRevision"]) || !integer(value.expectedRevision, 0, 2 ** 31 - 2) || !object(value.payload)) return false;
  const p = value.payload;
  if (value.action === "verify" || value.action === "pause") return !Object.keys(p).length;
  if (value.action === "activate") return (exact(p, ["limitUnits", "throttleSeconds", "mediaEnabled"]) || exact(p, ["limitUnits", "throttleSeconds", "mediaEnabled", "automateNewConversations"])) &&
    integer(p.limitUnits, 1, 10_000) && integer(p.throttleSeconds, 1, 86_400) && typeof p.mediaEnabled === "boolean" &&
    (!("automateNewConversations" in p) || typeof p.automateNewConversations === "boolean");
  const sessionOnly = value.action === "session";
  if (!["save", "session"].includes(value.action as string) || !exact(p, sessionOnly ? ["ownerId", "capture", "xHash", "expiresAt"] : ["ownerId", "capture", "xHash", "proxyUrl", "expiresAt", "model"]) || !integer(p.ownerId, 1) ||
    !connectionCapture(p.capture, p.ownerId) || !header(p.xHash) || !stamp(p.expiresAt)) return false;
  if (sessionOnly) return true;
  if (p.proxyUrl !== null) {
    if (!header(p.proxyUrl)) return false;
    try { const proxy = new URL(p.proxyUrl); const port = /:([0-9]+)\/?$/.exec(p.proxyUrl)?.[1];
      if (!["http:", "https:", "socks5:", "socks5h:"].includes(proxy.protocol) || !proxy.hostname || !port || !integer(Number(port), 1, 65535) ||
        !["", "/"].includes(proxy.pathname) || proxy.search || proxy.hash) return false;
    } catch { return false; }
  }
  return p.model === null || (object(p.model) && exact(p.model, ["modelId", "apiKey"]) && bytes(p.model.modelId, 160) && !!p.model.modelId.trim() && header(p.model.apiKey));
}
export function validConnectionRegistration(value: unknown): value is ConnectionRegistration {
  return object(value) && exact(value, ["creatorId", "ownerId", "handle"]) && id(value.creatorId) && integer(value.ownerId, 1) && bytes(value.handle, 160);
}
export function parseConnection(value: unknown, accountId: string): Connection | null {
  if (!object(value) || !exact(value, ["schemaVersion", "ok", "connection"]) || value.schemaVersion !== CONNECTION_SCHEMA || value.ok !== true || !object(value.connection)) return null;
  const c = value.connection;
  if (!exact(c, ["accountId", "revision", "status", "ownerId", "expiresAt", "verifiedAt", "lastError", "outgoingEnabled", "policyRevision", "usedUnits", "limitUnits", "mediaEnabled", "automateNewConversations"]) ||
    c.accountId !== accountId || !id(c.accountId) || !integer(c.revision, 0, 2 ** 31 - 1) ||
    !["unconfigured", "pending", "verified", "failed", "expired", "paused"].includes(c.status as string) ||
    !(c.ownerId === null || ownerString(c.ownerId)) || !(c.expiresAt === null || stamp(c.expiresAt)) || !(c.verifiedAt === null || stamp(c.verifiedAt)) ||
    !(c.lastError === null || (bytes(c.lastError, 160) && /^[a-z0-9_]+$/.test(c.lastError))) || typeof c.outgoingEnabled !== "boolean" || typeof c.mediaEnabled !== "boolean" || typeof c.automateNewConversations !== "boolean" ||
    !integer(c.policyRevision) || !integer(c.usedUnits) || !integer(c.limitUnits) || (c.outgoingEnabled && (c.status !== "verified" || c.verifiedAt === null || c.expiresAt === null))) return null;
  return c as Connection;
}
export function parseConnectionAck(value: unknown, expected: ConnectionRequest & { accountId: string; commandKey?: string }): ConnectionAck | null {
  if (!object(value) || !exact(value, ["schemaVersion", "ok", "applied", "accountId", "commandKey", "recordedRevision", "action"]) || value.schemaVersion !== CONNECTION_SCHEMA ||
    value.ok !== true || value.applied !== true || value.accountId !== expected.accountId || value.action !== expected.action || !hash(value.commandKey) ||
    value.recordedRevision !== expected.expectedRevision + 1 || (expected.commandKey !== undefined && value.commandKey !== expected.commandKey)) return null;
  return value as ConnectionAck;
}
export function parseRegistrationAck(value: unknown, expected: ConnectionRegistration & { commandKey?: string }): RegistrationAck | null {
  if (!object(value) || !exact(value, ["schemaVersion", "ok", "applied", "accountId", "commandKey", "status"]) || value.schemaVersion !== CONNECTION_SCHEMA || value.ok !== true ||
    value.applied !== true || value.accountId !== `of-${expected.ownerId}` || value.status !== "unconfigured" || !hash(value.commandKey) ||
    (expected.commandKey !== undefined && value.commandKey !== expected.commandKey)) return null;
  return value as RegistrationAck;
}
export function canonicalConnection(value: unknown): string {
  return JSON.stringify(value, (_key, item) => object(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
}
export function parseEnrollment(value:unknown):ConnectionEnrollment|null {
  if(!object(value)||!exact(value,["id","status","accountId","error","expiresAt"])||!id(value.id)
    ||!["pending","checking","accepted","failed","expired"].includes(String(value.status))
    ||!(value.accountId===null||id(value.accountId))||!(value.error===null||["session_unavailable","verification_unavailable"].includes(String(value.error)))
    ||!stamp(value.expiresAt)||(value.status==="accepted"&&!value.accountId)||(value.status!=="accepted"&&value.accountId!==null))return null;
  return value as ConnectionEnrollment;
}
