import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { requireOnlyFansRead, requestId, PRIVATE_HEADERS } from "@/lib/onlyfans/route";
import { configuredConfigurationBackend } from "@/lib/onlyfans/configuration-backend";
import { CONFIGURATION_SCHEMA, canonicalConfiguration, validConfigurationRequest } from "@/lib/onlyfans/configuration";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ accountId: string }> };
const answer = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
const refuse = (status: number, error: string) => answer({ schemaVersion: CONFIGURATION_SCHEMA, ok: false, outcome: "refused", error }, status);
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export async function GET(_request: NextRequest, context: Context) {
  const ctx = await requireOnlyFansRead(); if (ctx instanceof NextResponse) return ctx;
  const accountId = requestId((await context.params).accountId);
  if (!accountId) return refuse(400, "That account reference is invalid.");
  const backend = configuredConfigurationBackend(); if (!backend) return refuse(503, "Configuration editing is not configured.");
  const result = await backend.get(accountId);
  return result.ok ? answer({ schemaVersion: CONFIGURATION_SCHEMA, ok: true, accountId, configuration: result.data }) : refuse(result.status, result.error);
}
export async function POST(request: NextRequest, context: Context) {
  const ctx = await requireOnlyFansRead(); if (ctx instanceof NextResponse) return ctx;
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!await verifySessionToken(session)) return refuse(401, "Sign in again before editing this creator.");
  const expectedOrigin = `${request.nextUrl.protocol}//${request.headers.get("host")}`;
  if (request.headers.get("origin") !== expectedOrigin || ![null, "same-origin"].includes(request.headers.get("sec-fetch-site")) ||
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return refuse(403, "Save changes from this dashboard.");
  const accountId = requestId((await context.params).accountId);
  if (!accountId) return refuse(400, "That account reference is invalid.");
  let body: unknown;
  try {
    const reader = request.body?.getReader(); if (!reader) return refuse(400, "The save request is missing.");
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) { const part = await reader.read(); if (part.done) break;
        size += part.value.length; if (size > 65536) { await reader.cancel(); return refuse(413, "The save request is too large."); } chunks.push(part.value); }
    } finally { reader.releaseLock(); }
    const raw = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { raw.set(chunk, offset); offset += chunk.length; }
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
  } catch { return refuse(400, "That save request is invalid."); }
  if (!validConfigurationRequest(body)) return refuse(400, "That configuration change is invalid.");
  const backend = configuredConfigurationBackend(); if (!backend) return refuse(503, "Configuration editing is not configured.");
  const actor = `op-session:${digest(session!)}`;
  const commandKey = digest(canonicalConfiguration([actor, accountId, body]));
  const result = await backend.save(accountId, { ...body, actor, commandKey });
  return result.ok ? answer(result.ack) : answer({ schemaVersion: CONFIGURATION_SCHEMA, ...result }, result.status);
}
