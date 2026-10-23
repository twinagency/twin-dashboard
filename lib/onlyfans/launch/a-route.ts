import { NextRequest, NextResponse } from "next/server";
import { requireOnlyFansRead, requestId, PRIVATE_HEADERS } from "../route";
import { readCommandJson } from "../command-json";
import { trustedFormOrigin } from "@/lib/form-origin";
import { LAUNCH_SCHEMA } from "./a-types";
import { composeReadiness, type WorkspaceSettings } from "./live/readiness";
import { ledgerRead, ledgerRetry } from "./live/ledger";
import { fail, ok, rec, type Ans, type Env } from "./live/upstream";

export type LaunchContext = { params: Promise<{ accountId: string; path?: string[] }> };
export type LaunchCall = { method: "GET" | "POST"; env: Env; path: string[]; body?: unknown; readSettings?: () => Promise<WorkspaceSettings> };

/** Pure routing for the readiness and purchases screens: whitelists paths, enforces permission, and calls only delivered contracts. */
export async function dispatchLaunch(call: LaunchCall): Promise<Ans> {
  const { env, path } = call;
  // Access answers locally: it is the permission the UI uses to disable controls, and needs no backend.
  if (call.method === "GET" && path.length === 1 && path[0] === "access")
    return ok(env.accountId, { canManage: env.canManage, accountPause: env.canManage && !env.agency });
  if (call.method === "GET") {
    if (path.length !== 1) return fail(404, "That launch resource is not available.", "not_found");
    if (path[0] === "readiness") return composeReadiness(env, call.readSettings ?? (async () => null));
    if (path[0] === "ledger") return ledgerRead(env);
    return fail(404, "That launch resource is not available.", "not_found");
  }
  if (!env.canManage || !env.actor) return fail(403, "Your team access is read-only.", "agency_read_only");
  if (path.length !== 1 || path[0] !== "command" || !rec(call.body) || call.body.path !== "ledger/retry" || call.body.id !== null || Object.keys(call.body).sort().join() !== "body,id,path")
    return fail(400, "That launch change is invalid.", "invalid_request");
  return ledgerRetry(env, call.body.body);
}

const answer = (a: Ans) => NextResponse.json({ ...a.body, schemaVersion: LAUNCH_SCHEMA }, { status: a.status, headers: PRIVATE_HEADERS });
const envOf = (ctx: Exclude<Awaited<ReturnType<typeof requireOnlyFansRead>>, NextResponse>, accountId: string): Env =>
  ({ fetch: ctx.fetch, accountId, actor: ctx.actor, canManage: ctx.canManage, agency: !!ctx.auth.agencyGrant });
export { envOf as launchEnv };

export async function handleLaunchRead(_request: NextRequest, context: LaunchContext) {
  const ctx = await requireOnlyFansRead({ agency: true }); if (ctx instanceof NextResponse) return ctx;
  const { accountId: raw, path = [] } = await context.params;
  const accountId = requestId(raw); if (!accountId) return answer(fail(400, "That account reference is invalid.", "invalid_request"));
  const readSettings = async (): Promise<WorkspaceSettings> => {
    const r = await ctx.backend?.getWorkspace?.(accountId, "settings");
    if (!r?.ok || r.data.section !== "settings") return null;
    return { providerConnectionVerified: r.data.providerConnectionVerified, historyRecoveryRequired: r.data.historyRecoveryRequired, runtimeEnabled: r.data.runtimeEnabled,
      deliveryPolicy: r.data.deliveryPolicy ? { enabled: r.data.deliveryPolicy.enabled } : null };
  };
  return answer(await dispatchLaunch({ method: "GET", env: envOf(ctx, accountId), path, readSettings }));
}
export async function handleLaunchWrite(request: NextRequest, context: LaunchContext) {
  const ctx = await requireOnlyFansRead({ agency: true, write: true }); if (ctx instanceof NextResponse) return ctx;
  if (!ctx.canManage || !ctx.actor) return answer(fail(403, "Your team access is read-only.", "agency_read_only"));
  if (!trustedFormOrigin(request) || ![null, "same-origin"].includes(request.headers.get("sec-fetch-site")) ||
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return answer(fail(403, "Make this change from this dashboard.", "refused"));
  const { accountId: raw, path = [] } = await context.params;
  const accountId = requestId(raw); if (!accountId) return answer(fail(400, "That account reference is invalid.", "invalid_request"));
  let body: unknown;
  try { body = await readCommandJson(request, 65_536); } catch { return answer(fail(400, "That launch change is invalid.", "invalid_request")); }
  return answer(await dispatchLaunch({ method: "POST", env: envOf(ctx, accountId), path, body }));
}
