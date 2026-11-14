import { NextRequest, NextResponse } from "next/server";
import { requireOnlyFansRead, requestId } from "@/lib/onlyfans/route";
import { configuredVaultBackend } from "@/lib/onlyfans/vault-backend";
import { validVaultProcessingRequest } from "@/lib/onlyfans/vault";
import { CONTENT_SCHEMA } from "@/lib/onlyfans/content";
import { vaultAnswer, vaultRefusal, vaultCommandContext } from "@/lib/onlyfans/vault-route";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Import coverage and description analysis status. Read-only, account scoped, no query parameters. */
export async function GET(request: NextRequest, context: { params: Promise<{ accountId: string }> }) {
  const ctx = await requireOnlyFansRead({ agency: true }); if (ctx instanceof NextResponse) return ctx;
  const accountId = requestId((await context.params).accountId);
  if (!accountId || [...request.nextUrl.searchParams.keys()].length) return vaultRefusal(400, "That vault processing request is invalid.");
  const backend = configuredVaultBackend(ctx.fetch); if (!backend) return vaultRefusal(503, "Vault management is not configured.");
  const result = await backend.processing(accountId);
  return result.ok ? vaultAnswer({ schemaVersion: CONTENT_SCHEMA, ok: true, accountId, processing: result.data }) : vaultRefusal(result.status, result.error);
}
/** pause | resume | retry | redescribe. Identity comes from the session; the browser supplies only a nonce, the action and bounded media IDs. */
export async function POST(request: NextRequest, context: { params: Promise<{ accountId: string }> }) {
  const ctx = await vaultCommandContext(request); if (ctx instanceof NextResponse) return ctx;
  const accountId = requestId((await context.params).accountId); if (!accountId || !validVaultProcessingRequest(ctx.body)) return vaultRefusal(400, "That vault processing request is invalid.");
  const backend = configuredVaultBackend(ctx.fetch); if (!backend) return vaultRefusal(503, "Vault management is not configured.");
  const identity = ctx.identity(accountId, "processing");
  const result = await backend.processingCommand(accountId, { action: ctx.body.action, ...(ctx.body.mediaIds ? { mediaIds: ctx.body.mediaIds } : {}), ...identity });
  return result.ok ? vaultAnswer({ schemaVersion: CONTENT_SCHEMA, ok: true, applied: true, accountId, commandKey: identity.commandKey, processing: result.processing })
    : vaultAnswer({ schemaVersion: CONTENT_SCHEMA, ...result }, result.status);
}
