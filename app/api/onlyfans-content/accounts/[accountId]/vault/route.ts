import { NextRequest, NextResponse } from "next/server";
import { requireOnlyFansRead, requestId } from "@/lib/onlyfans/route";
import { configuredVaultBackend } from "@/lib/onlyfans/vault-backend";
import { folderReference } from "@/lib/onlyfans/vault-editing";
import { vaultMediaId } from "@/lib/onlyfans/vault";
import { CONTENT_SCHEMA } from "@/lib/onlyfans/content";
import { vaultAnswer, vaultRefusal } from "@/lib/onlyfans/vault-route";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: NextRequest, context: { params: Promise<{ accountId: string }> }) {
  const ctx = await requireOnlyFansRead(); if (ctx instanceof NextResponse) return ctx;
  const accountId = requestId((await context.params).accountId), cursor = request.nextUrl.searchParams.get("afterMediaId");
  const folderId = request.nextUrl.searchParams.get("folderId");
  const query = request.nextUrl.searchParams.get("q") ?? "", kind = request.nextUrl.searchParams.get("kind") ?? "all";
  if (!accountId || (folderId !== null && !folderReference(folderId)) || (cursor !== null && !vaultMediaId(cursor)) || query.length > 120 || /[\u0000-\u001f]/.test(query) || !["all", "photo", "video"].includes(kind) ||
    [...request.nextUrl.searchParams.keys()].some(key => !["afterMediaId", "q", "kind", "folderId"].includes(key) || request.nextUrl.searchParams.getAll(key).length !== 1)) return vaultRefusal(400, "That vault page or search is invalid.");
  const backend = configuredVaultBackend(); if (!backend) return vaultRefusal(503, "Vault management is not configured.");
  const result = await backend.get(accountId, cursor, { query, kind, folderId: folderId ?? undefined });
  return result.ok ? vaultAnswer({ schemaVersion: CONTENT_SCHEMA, ok: true, accountId, vault: result.data }) : vaultRefusal(result.status, result.error);
}
