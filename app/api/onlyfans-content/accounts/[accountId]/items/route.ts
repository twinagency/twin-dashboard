import { NextRequest, NextResponse } from "next/server";
import { requestId } from "@/lib/onlyfans/route";
import { configuredVaultBackend } from "@/lib/onlyfans/vault-backend";
import { validVaultCreateRequest } from "@/lib/onlyfans/vault";
import { CONTENT_SCHEMA } from "@/lib/onlyfans/content";
import { vaultAnswer, vaultRefusal, vaultCommandContext } from "@/lib/onlyfans/vault-route";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(request: NextRequest, context: { params: Promise<{ accountId: string }> }) {
  const ctx = await vaultCommandContext(request); if (ctx instanceof NextResponse) return ctx;
  const accountId = requestId((await context.params).accountId); if (!accountId || !validVaultCreateRequest(ctx.body)) return vaultRefusal(400, "That catalogue product request is invalid.");
  const backend = configuredVaultBackend(); if (!backend) return vaultRefusal(503, "Vault management is not configured.");
  const identity = ctx.identity(accountId, "create-product");
  const result = await backend.create(accountId, { product: ctx.body.product, ...identity });
  return result.ok ? vaultAnswer({ schemaVersion: CONTENT_SCHEMA, ok: true, applied: true, accountId, commandKey: identity.commandKey, itemId: result.itemId, item: result.item })
    : vaultAnswer({ schemaVersion: CONTENT_SCHEMA, ...result }, result.status);
}
