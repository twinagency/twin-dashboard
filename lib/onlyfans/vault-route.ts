import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { requireOnlyFansRead, PRIVATE_HEADERS } from "./route";
import { readCommandJson } from "./command-json";
import { canonicalContent, CONTENT_SCHEMA } from "./content";
export const vaultAnswer = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
export const vaultRefusal = (status: number, error: string) => vaultAnswer({ schemaVersion: CONTENT_SCHEMA, ok: false, outcome: "refused", error }, status);
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export async function vaultCommandContext(request: NextRequest) {
  const ctx = await requireOnlyFansRead(); if (ctx instanceof NextResponse) return ctx;
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!await verifySessionToken(session)) return vaultRefusal(401, "Sign in again before managing this vault.");
  const expectedOrigin = `${request.nextUrl.protocol}//${request.headers.get("host")}`;
  if (request.headers.get("origin") !== expectedOrigin || ![null, "same-origin"].includes(request.headers.get("sec-fetch-site")) ||
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return vaultRefusal(403, "Manage content from this dashboard.");
  let body: unknown;
  try { body = await readCommandJson(request); }
  catch (error) { return vaultRefusal(error instanceof Error && error.message === "Command is too large" ? 413 : 400, "The vault request is invalid."); }
  const actor = `op-session:${digest(session!)}`;
  return { body, identity: (accountId: string, action: string) => ({ actor, commandKey: digest(canonicalContent([actor, accountId, action, body])) }) };
}
