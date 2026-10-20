import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireOnlyFansRead, PRIVATE_HEADERS } from "./route";
import { readCommandJson } from "./command-json";
import { canonicalContent, CONTENT_SCHEMA } from "./content";
export const vaultAnswer = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
export const vaultRefusal = (status: number, error: string) => vaultAnswer({ schemaVersion: CONTENT_SCHEMA, ok: false, outcome: "refused", error }, status);
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export async function vaultSessionContext(request: NextRequest, contentType: "application/json" | "application/octet-stream") {
  const ctx = await requireOnlyFansRead({ agency: true, write: true }); if (ctx instanceof NextResponse) return ctx;
  if (!ctx.actor) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const expectedOrigin = `${request.nextUrl.protocol}//${request.headers.get("host")}`;
  if (request.headers.get("origin") !== expectedOrigin || ![null, "same-origin"].includes(request.headers.get("sec-fetch-site")) ||
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== contentType) return vaultRefusal(403, "Manage content from this dashboard.");
  return { actor: ctx.actor, fetch: ctx.fetch };
}
export async function vaultCommandContext(request: NextRequest) {
  const ctx = await vaultSessionContext(request, "application/json"); if (ctx instanceof NextResponse) return ctx;
  let body: unknown;
  try { body = await readCommandJson(request); }
  catch (error) { return vaultRefusal(error instanceof Error && error.message === "Command is too large" ? 413 : 400, "The vault request is invalid."); }
  const actor = ctx.actor;
  return { body, fetch: ctx.fetch, identity: (accountId: string, action: string) => ({ actor, commandKey: digest(canonicalContent([actor, accountId, action, body])) }) };
}
