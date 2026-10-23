import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireOnlyFansRead, requestId, PRIVATE_HEADERS } from "../route";
import { readCommandJson } from "../command-json";
import { canonicalContent } from "../content";
import { trustedFormOrigin } from "@/lib/form-origin";
import { configuredLaunchBackend, type LaunchBackend } from "./a-backend";
import { ID, LAUNCH_SCHEMA, READ_PATHS, SCREENS, validCommand, type Screen } from "./a-types";

export type LaunchContext = { params: Promise<{ accountId: string; path?: string[] }> };
export type LaunchCall = { method: "GET" | "POST"; accountId: string; path: string[]; query: URLSearchParams; actor: string | null; canManage: boolean; body?: unknown };
export type LaunchAnswer = { status: number; body: unknown };
const digest = (v: string) => createHash("sha256").update(v).digest("hex");
const refuse = (status: number, error: string, outcome = "refused"): LaunchAnswer => ({ status, body: { schemaVersion: LAUNCH_SCHEMA, ok: false, outcome, error } });

/** Pure routing: whitelists paths, enforces permission, derives actor and command key, then calls the backend. */
export async function dispatchLaunch(call: LaunchCall, backend: LaunchBackend | null): Promise<LaunchAnswer> {
  const { accountId, path } = call;
  // Access answers locally: it is the permission the UI uses to disable controls, and needs no backend.
  if (call.method === "GET" && path.length === 1 && path[0] === "access")
    return { status: 200, body: { schemaVersion: LAUNCH_SCHEMA, ok: true, accountId, data: { canManage: call.canManage } } };
  if (!backend) return refuse(503, "The launch backend is not configured.", "unavailable");
  if (call.method === "GET") {
    if (path.length !== 1 || !SCREENS.includes(path[0] as Screen) || READ_PATHS[path[0] as Screen] !== path[0]) return refuse(404, "That launch resource is not available.");
    const after = call.query.get("after"), query: Record<string, string> = {};
    if (after !== null) { if (!ID.test(after)) return refuse(400, "That page cursor is invalid."); query.after = after; }
    const status = call.query.get("status"); if (status !== null) { if (!/^[a-z_]{1,32}$/.test(status)) return refuse(400, "That filter is invalid."); query.status = status; }
    const r = await backend.read(accountId, path[0], query);
    return r.ok ? { status: 200, body: { schemaVersion: LAUNCH_SCHEMA, ok: true, accountId, data: r.data } } : refuse(r.status, r.error, r.outcome);
  }
  if (!call.canManage || !call.actor) return refuse(403, "Your team access is read-only.");
  if (path.length !== 1 || path[0] !== "command" || !validCommand(call.body)) return refuse(400, "That launch change is invalid.");
  const c = call.body as { path: string; id: string | null; body: Record<string, unknown> };
  // The key is derived from actor, account and the exact body, so a retry after a lost reply is the same command.
  const commandKey = digest(canonicalContent([call.actor, accountId, c.path, c.id, c.body]));
  const r = await backend.command(accountId, c.path + (c.id ? `/${c.id}` : ""), { ...c.body, actor: call.actor, commandKey });
  return r.ok ? { status: 200, body: { schemaVersion: LAUNCH_SCHEMA, ok: true, accountId, data: r.data } } : refuse(r.status, r.error, r.outcome);
}

const answer = (a: LaunchAnswer) => NextResponse.json(a.body, { status: a.status, headers: PRIVATE_HEADERS });
export async function handleLaunchRead(request: NextRequest, context: LaunchContext) {
  const ctx = await requireOnlyFansRead({ agency: true }); if (ctx instanceof NextResponse) return ctx;
  const { accountId: raw, path = [] } = await context.params;
  const accountId = requestId(raw); if (!accountId) return answer(refuse(400, "That account reference is invalid."));
  return answer(await dispatchLaunch({ method: "GET", accountId, path, query: request.nextUrl.searchParams, actor: ctx.actor, canManage: ctx.canManage }, configuredLaunchBackend(ctx.fetch)));
}
export async function handleLaunchWrite(request: NextRequest, context: LaunchContext) {
  const ctx = await requireOnlyFansRead({ agency: true, write: true }); if (ctx instanceof NextResponse) return ctx;
  if (!ctx.canManage || !ctx.actor) return answer(refuse(403, "Your team access is read-only."));
  if (!trustedFormOrigin(request) || ![null, "same-origin"].includes(request.headers.get("sec-fetch-site")) ||
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return answer(refuse(403, "Make this change from this dashboard."));
  const { accountId: raw, path = [] } = await context.params;
  const accountId = requestId(raw); if (!accountId) return answer(refuse(400, "That account reference is invalid."));
  let body: unknown;
  try { body = await readCommandJson(request, 65_536); } catch { return answer(refuse(400, "That launch change is invalid.")); }
  return answer(await dispatchLaunch({ method: "POST", accountId, path, query: new URLSearchParams(), actor: ctx.actor, canManage: ctx.canManage, body }, configuredLaunchBackend(ctx.fetch)));
}
