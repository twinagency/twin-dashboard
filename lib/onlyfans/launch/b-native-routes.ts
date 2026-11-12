/** Native launch BFF: strict allowlists, same-origin manager commands, derived identities. */
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/session";
import { planCOwnerActor } from "../plan-c-owner";
import { NextRequest } from "next/server";
import { readCommandJson } from "../command-json";
import { canonicalConfiguration } from "../configuration";
import { bGate, bAnswer, bRefuse } from "./b-route";
import { internalOperator } from "../reads";
import {
  configuredNativeConfigurationBackend,
  type NativeResult,
} from "./native-backend";
import {
  count,
  decimalId,
  hash,
  memoryField,
  object,
  parseCorrectionAck,
  parseEngagementAction,
  parseEngagementPage,
  parseEngagementSettings,
  parseMemoryFanPage,
  parseMemoryProgress,
  parseNativeMemory,
  parseRecoveryProgress,
  text,
  validPolicy,
} from "./native";
const fail = (r: Exclude<NativeResult, { ok: true }>) =>
  bAnswer({ ok: false, outcome: r.outcome, error: r.error }, r.status);
const invalid = () =>
  bRefuse(400, "That account request is invalid.", "invalid_request");
const unavailable = () =>
  bRefuse(503, "The account response could not be verified.", "unavailable");
const identity = (
  actor: string,
  accountId: string,
  path: string,
  body: unknown,
) =>
  createHash("sha256")
    .update(canonicalConfiguration([actor, accountId, path, body]))
    .digest("hex");
function pageQuery(r: NextRequest): Record<string, string> | null {
  if (
    [...r.nextUrl.searchParams.keys()].some(
      (k) => !["cursor", "limit"].includes(k),
    ) ||
    ["cursor", "limit"].some((k) => r.nextUrl.searchParams.getAll(k).length > 1)
  )
    return null;
  const cursor = r.nextUrl.searchParams.get("cursor"),
    limit = r.nextUrl.searchParams.get("limit"),
    q: Record<string, string> = {};
  if (cursor !== null) {
    if (!/^[A-Za-z0-9._=-]{1,2000}$/.test(cursor)) return null;
    q.cursor = cursor;
  }
  if (limit !== null) {
    if (!/^[1-9][0-9]{0,2}$/.test(limit) || Number(limit) > 100) return null;
    q.limit = limit;
  }
  return q;
}
export async function memoryFans(request: NextRequest, account: string) {
  const g = await bGate(request, account, false);
  if (!("ctx" in g)) return g;
  const query = pageQuery(request);
  if (!query) return invalid();
  const call = configuredNativeConfigurationBackend(g.ctx.fetch);
  if (!call) return unavailable();
  const [r, p] = await Promise.all([
    call(g.accountId, "history-memory/fans", "GET", undefined, query),
    call(g.accountId, "history-memory/progress"),
  ]);
  if (!r.ok) return fail(r);
  if (!p.ok) return fail(p);
  const page = parseMemoryFanPage(r.data),
    progress = parseRecoveryProgress(p.data.progress, g.accountId, null, internalOperator(g.ctx.auth));
  return page && progress
    ? bAnswer({
        ok: true,
        accountId: g.accountId,
        memoryVersion: "of-history-memory.v1",
        ...page,
        progress,
      })
    : unavailable();
}
export async function memoryFan(
  request: NextRequest,
  account: string,
  fan: string,
  write = false,
) {
  const g = await bGate(request, account, write, "chat");
  if (!("ctx" in g)) return g;
  if (!decimalId(fan)) return invalid();
  const call = configuredNativeConfigurationBackend(g.ctx.fetch);
  if (!call) return unavailable();
  const base = `history-memory/fans/${fan}`;
  if (!write) {
    if (
      [...request.nextUrl.searchParams.keys()].some((k) => k !== "query") ||
      request.nextUrl.searchParams.getAll("query").length > 1
    )
      return invalid();
    const query = request.nextUrl.searchParams.get("query") ?? "";
    if (query.length > 2000) return invalid();
    const [r, p] = await Promise.all([
      call(g.accountId, `${base}/memory`, "GET", undefined, { query }),
      call(g.accountId, `${base}/progress`),
    ]);
    if (!r.ok) return fail(r);
    if (!p.ok) return fail(p);
    const memory = parseNativeMemory(r.data.memory),
      progress = parseMemoryProgress(p.data.memory),
      recovery = parseRecoveryProgress(p.data.recovery, g.accountId, fan, internalOperator(g.ctx.auth));
    return memory && progress && recovery
      ? bAnswer({
          ok: true,
          accountId: g.accountId,
          fanId: fan,
          memory,
          progress,
          recovery,
        })
      : unavailable();
  }
  if (request.nextUrl.searchParams.size) return invalid();
  let body: unknown;
  try {
    body = await readCommandJson(request, 16384);
  } catch {
    return invalid();
  }
  if (
    !object(body) ||
    Object.keys(body).sort().join(",") !==
      ["field", "operation", "value", "expectedVersion", "reason"]
        .sort()
        .join(",") ||
    !memoryField(body.field) ||
    !["set", "clear"].includes(String(body.operation)) ||
    !hash(body.expectedVersion) ||
    !text(body.reason, 512) ||
    !body.reason.trim() ||
    !(body.operation === "clear"
      ? body.value === null
      : text(body.value, 600) && !!body.value.trim())
  )
    return invalid();
  const named = internalOperator(g.ctx.auth)
    ? await planCOwnerActor((await cookies()).get(SESSION_COOKIE)?.value) : null;
  const actor = named ?? g.ctx.actor!;
  const r = await call(g.accountId, `${base}/corrections`, "POST", {
    ...body,
    actor,
    commandKey: identity(actor, g.accountId, `${base}/corrections`, body),
  });
  if (!r.ok) return fail(r);
  const correction = parseCorrectionAck(r.data.correction);
  return correction
    ? bAnswer({ ok: true, accountId: g.accountId, fanId: fan, correction })
    : bAnswer(
        {
          ok: false,
          outcome: "unconfirmed",
          error:
            "The correction acknowledgement could not be verified. Read current memory.",
        },
        502,
      );
}
export async function historyBackfill(
  request: NextRequest,
  account: string,
  fan?: string,
) {
  const g = await bGate(request, account, true);
  if (!("ctx" in g)) return g;
  if (request.nextUrl.searchParams.size) return invalid();
  if (fan !== undefined && !decimalId(fan)) return invalid();
  let body: unknown;
  try {
    body = await readCommandJson(request, 1024);
  } catch {
    return invalid();
  }
  if (!object(body) || Object.keys(body).length) return invalid();
  const call = configuredNativeConfigurationBackend(g.ctx.fetch);
  if (!call) return unavailable();
  const r = await call(
    g.accountId,
    fan === undefined
      ? "history-memory/backfill"
      : `history-memory/fans/${fan}/backfill`,
    "POST",
    { actor: g.ctx.actor },
  );
  return !r.ok
    ? fail(r)
    : r.data.requested === (fan === undefined ? "account" : "fan")
      ? bAnswer({
          ok: true,
          accountId: g.accountId,
          requested: r.data.requested,
        })
      : bAnswer(
          {
            ok: false,
            outcome: "unconfirmed",
            error: "Recovery request was not confirmed.",
          },
          502,
        );
}
export async function engagementSettings(
  request: NextRequest,
  account: string,
  write = false,
) {
  const g = await bGate(request, account, write);
  if (!("ctx" in g)) return g;
  const call = configuredNativeConfigurationBackend(g.ctx.fetch);
  if (!call) return unavailable();
  if (!write) {
    if (request.nextUrl.searchParams.size) return invalid();
    const r = await call(g.accountId, "engagement");
    if (!r.ok) return fail(r);
    const s = parseEngagementSettings(r.data);
    return s
      ? bAnswer({ ok: true, accountId: g.accountId, ...s })
      : unavailable();
  }
  if (request.nextUrl.searchParams.size) return invalid();
  let b: unknown;
  try {
    b = await readCommandJson(request, 16384);
  } catch {
    return invalid();
  }
  if (
    !object(b) ||
    Object.keys(b).sort().join(",") !== "expectedRevision,settings" ||
    !count(b.expectedRevision) ||
    !validPolicy(b.settings)
  )
    return invalid();
  const actor = g.ctx.actor!,
    r = await call(g.accountId, "engagement/settings", "POST", {
      ...b,
      actor,
      commandKey: identity(actor, g.accountId, "engagement/settings", b),
    });
  return !r.ok
    ? fail(r)
    : r.data.engagementVersion === "of-engagement.v1" &&
        r.data.revision === Number(b.expectedRevision) + 1
      ? bAnswer({ ok: true, accountId: g.accountId, revision: r.data.revision })
      : bAnswer(
          {
            ok: false,
            outcome: "unconfirmed",
            error: "Settings acknowledgement was not confirmed. Refresh.",
          },
          502,
        );
}
export async function engagementActions(
  request: NextRequest,
  account: string,
  write = false,
) {
  const g = await bGate(request, account, write);
  if (!("ctx" in g)) return g;
  const call = configuredNativeConfigurationBackend(g.ctx.fetch);
  if (!call) return unavailable();
  if (!write) {
    const q = pageQuery(request);
    if (!q) return invalid();
    const r = await call(
      g.accountId,
      "engagement/actions",
      "GET",
      undefined,
      q,
    );
    if (!r.ok) return fail(r);
    const p = parseEngagementPage(r.data);
    return p
      ? bAnswer({
          ok: true,
          accountId: g.accountId,
          engagementVersion: "of-engagement.v1",
          ...p,
        })
      : unavailable();
  }
  if (request.nextUrl.searchParams.size) return invalid();
  let b: unknown;
  try {
    b = await readCommandJson(request, 2048);
  } catch {
    return invalid();
  }
  if (
    !object(b) ||
    Object.keys(b).sort().join(",") !== "action,actionId" ||
    !["cancel", "refresh"].includes(String(b.action)) ||
    !text(b.actionId, 36) ||
    !/^[a-f0-9-]{36}$/.test(b.actionId)
  )
    return invalid();
  const r = await call(
    g.accountId,
    `engagement/actions/${b.actionId}/${b.action}`,
    "POST",
    {
      actor: g.ctx.actor,
      ...(b.action === "cancel" ? { reason: "operator_cancelled" } : {}),
    },
  );
  if (!r.ok) return fail(r);
  const a = parseEngagementAction(r.data.action);
  return a && a.actionId === b.actionId
    ? bAnswer({ ok: true, accountId: g.accountId, action: a })
    : bAnswer(
        {
          ok: false,
          outcome: "unconfirmed",
          error: "The action acknowledgement could not be verified. Refresh.",
        },
        502,
      );
}

export async function engagementActionDetail(
  request: NextRequest,
  account: string,
  actionId: string,
) {
  const g = await bGate(request, account, false);
  if (!("ctx" in g)) return g;
  if (!/^[a-f0-9-]{36}$/.test(actionId) || request.nextUrl.searchParams.size)
    return invalid();
  const call = configuredNativeConfigurationBackend(g.ctx.fetch);
  if (!call) return unavailable();
  const r = await call(g.accountId, `engagement/actions/${actionId}`);
  if (!r.ok) return fail(r);
  const a = parseEngagementAction(r.data.action);
  return a && a.actionId === actionId
    ? bAnswer({
        ok: true,
        accountId: g.accountId,
        engagementVersion: "of-engagement.v1",
        action: a,
      })
    : unavailable();
}
