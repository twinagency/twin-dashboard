import { NextRequest, NextResponse } from "next/server";
import { requireOnlyFansRead, requestId } from "@/lib/onlyfans/route";
import { configuredVaultBackend } from "@/lib/onlyfans/vault-backend";
import { vaultMediaId } from "@/lib/onlyfans/vault";
import { CONTENT_SCHEMA } from "@/lib/onlyfans/content";
import { vaultAnswer, vaultRefusal } from "@/lib/onlyfans/vault-route";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: NextRequest, context: { params: Promise<{ accountId: string }> }) {
  const ctx = await requireOnlyFansRead(); if (ctx instanceof NextResponse) return ctx;
  const accountId = requestId((await context.params).accountId), cursor = request.nextUrl.searchParams.get("afterMediaId");
  if (!accountId || (cursor !== null && !vaultMediaId(cursor)) || request.nextUrl.searchParams.getAll("afterMediaId").length > 1 ||
    [...request.nextUrl.searchParams.keys()].some(key => key !== "afterMediaId")) return vaultRefusal(400, "That vault page reference is invalid.");
  const backend = configuredVaultBackend(); if (!backend) return vaultRefusal(503, "Vault management is not configured.");
  const result = await backend.get(accountId, cursor);
  return result.ok ? vaultAnswer({ schemaVersion: CONTENT_SCHEMA, ok: true, accountId, vault: result.data }) : vaultRefusal(result.status, result.error);
}
