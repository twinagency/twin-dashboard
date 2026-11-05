import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { bGate, bAnswer, bRefuse } from "./launch/b-route";
import { configuredNativeReadBackend } from "./launch/native-backend";
import { readCommandJson } from "./command-json";
import { canonicalConfiguration } from "./configuration";
import { ACTIVATION_OPERATIONS, configuredActivationCommandBackend, type ActivationOperation } from "./activation-backend";
import { parseActivationStatus } from "./activation-status";

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const hex = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const int = (v: unknown, lo: number, hi: number): v is number => Number.isSafeInteger(v) && (v as number) >= lo && (v as number) <= hi;
const keysAre = (body: Record<string, unknown>, ...allowed: string[][]) => allowed.some(set => {
  const names = Object.keys(body).sort().join(",");
  return names === [...set].sort().join(",");
});
const REASONS: Partial<Record<ActivationOperation, string>> = {
  "enable-existing": "Enable AI replies for existing chats from the dashboard",
  "future-conversations": "Change the future conversations setting from the dashboard",
  "operating-limits": "Change the operating limits from the dashboard",
};

/** GET: the whole activation picture, read through the same scoped read credential as the inbox. */
export async function activationStatus(request: NextRequest, accountId: string) {
  const g = await bGate(request, accountId, false);
  if (!("ctx" in g)) return g;
  if (request.nextUrl.searchParams.size) return bRefuse(400, "This read does not accept query parameters.");
  const read = configuredNativeReadBackend(g.ctx.fetch);
  if (!read) return bRefuse(503, "The account read authority is unavailable.");
  const result = await read(g.accountId, "activation");
  if (!result.ok) return bAnswer({ ok: false, outcome: result.outcome, error: result.error }, result.status);
  const status = parseActivationStatus(result.data.activation, g.accountId);
  return status ? bAnswer({ ok: true, accountId: g.accountId, canManage: g.ctx.canManage, activation: status })
    : bRefuse(502, "The activation status could not be verified. Check the deployed dashboard and API release pair.", "bad_status");
}

/** POST: one administrator activation command. Manager only; the actor and the idempotency key are derived here. */
export async function activationCommand(request: NextRequest, accountId: string, operation: string) {
  if (!(ACTIVATION_OPERATIONS as readonly string[]).includes(operation)) return bRefuse(404, "Unknown activation action.", "not_found");
  const op = operation as ActivationOperation;
  const g = await bGate(request, accountId, true);
  if (!("ctx" in g)) return g;
  if (request.nextUrl.searchParams.size) return bRefuse(400, "This action does not accept query parameters.");
  let body: unknown;
  try { body = await readCommandJson(request, 4096); } catch { return bRefuse(400, "Invalid activation request."); }
  if (!object(body)) return bRefuse(400, "Invalid activation request.");
  const invalid = () => bRefuse(400, "Invalid activation request.", "invalid_request");
  const actor = g.ctx.actor!;
  let send: Record<string, unknown>;
  if (op === "enable-existing") {
    if (!keysAre(body, ["expectedFingerprint", "runId", "afterFan"]) || !hex(body.expectedFingerprint) || !hex(body.runId) || typeof body.afterFan !== "string" || !/^(0|[1-9][0-9]{0,17})$/.test(body.afterFan)) return invalid();
    send = { expectedFingerprint: body.expectedFingerprint, afterFan: body.afterFan, batch: 200 };
  } else if (op === "future-conversations") {
    if (!keysAre(body, ["expectedFingerprint", "enabled"]) || !hex(body.expectedFingerprint) || typeof body.enabled !== "boolean") return invalid();
    send = { expectedFingerprint: body.expectedFingerprint, enabled: body.enabled };
  } else if (op === "operating-limits") {
    if (!keysAre(body, ["expectedFingerprint", "limitUnits", "throttleSeconds", "mediaEnabled"]) || !hex(body.expectedFingerprint) ||
        !int(body.limitUnits, 1, 10000) || !int(body.throttleSeconds, 1, 86400) || typeof body.mediaEnabled !== "boolean") return invalid();
    send = { expectedFingerprint: body.expectedFingerprint, limitUnits: body.limitUnits, throttleSeconds: body.throttleSeconds, mediaEnabled: body.mediaEnabled };
  } else if (op === "activate") {
    if (!keysAre(body, ["expectedRevision", "limitUnits", "throttleSeconds", "mediaEnabled"]) || !int(body.expectedRevision, 0, 2 ** 31 - 2) ||
        !int(body.limitUnits, 1, 10000) || !int(body.throttleSeconds, 1, 86400) || typeof body.mediaEnabled !== "boolean") return invalid();
    send = { expectedRevision: body.expectedRevision, limitUnits: body.limitUnits, throttleSeconds: body.throttleSeconds, mediaEnabled: body.mediaEnabled };
  } else if (op === "model-credential") {
    if (!keysAre(body, ["modelId", "apiKey", "expectedRevision"]) || typeof body.modelId !== "string" || !body.modelId.trim() || body.modelId.length > 160 ||
        typeof body.apiKey !== "string" || body.apiKey.length < 8 || body.apiKey.length > 4096 || /[\s\u0000-\u001f]/.test(body.apiKey) || !int(body.expectedRevision, 0, 2 ** 31 - 2)) return invalid();
    send = { modelId: body.modelId.trim(), apiKey: body.apiKey, expectedRevision: body.expectedRevision };
  } else {
    if (Object.keys(body).length) return invalid();
    send = {};
  }
  const call = configuredActivationCommandBackend(g.ctx.fetch);
  if (!call) return bRefuse(503, "The account control authority is unavailable.");
  const commandKey = createHash("sha256").update(canonicalConfiguration([actor, g.accountId, op, op === "enable-existing" ? body : send])).digest("hex");
  const payload = op === "model-check" ? { actor } : op === "model-credential" || op === "activate" ? { ...send, actor, commandKey }
    : { ...send, actor, commandKey, reason: REASONS[op] };
  const result = await call(g.accountId, op, payload);
  return result.ok ? bAnswer({ ok: true, accountId: g.accountId, command: result.command })
    : bAnswer({ ok: false, outcome: result.outcome, code: result.code, error: result.error, ...(result.blockers ? { blockers: result.blockers } : {}) }, result.status);
}
