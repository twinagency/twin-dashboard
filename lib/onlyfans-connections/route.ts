import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { requireOnlyFansRead, PRIVATE_HEADERS } from "@/lib/onlyfans/route";
import { readCommandJson } from "@/lib/onlyfans/command-json";
import { canonicalConnection, CONNECTION_SCHEMA } from "./contract";
export const connectionAnswer = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
export const connectionRefusal = (status: number, error: string) => connectionAnswer({ schemaVersion: CONNECTION_SCHEMA, ok: false, outcome: "refused", error }, status);
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export async function connectionCommandContext(request: NextRequest) {
  const ctx = await requireOnlyFansRead(); if (ctx instanceof NextResponse) return ctx;
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!await verifySessionToken(session)) return connectionRefusal(401, "Sign in again before changing account connections.");
  const expectedOrigin = `${request.nextUrl.protocol}//${request.headers.get("host")}`;
  if (request.headers.get("origin") !== expectedOrigin || ![null, "same-origin"].includes(request.headers.get("sec-fetch-site")) ||
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return connectionRefusal(403, "Change connections from this dashboard.");
  let body: unknown;
  try { body = await readCommandJson(request, 131_072); }
  catch (error) { return connectionRefusal(error instanceof Error && error.message === "Command is too large" ? 413 : 400, "The connection request is invalid."); }
  const actor = `op-session:${digest(session!)}`;
  return { body, actor, identity: (scope: string, command: unknown) => ({ actor, commandKey: digest(canonicalConnection([actor, scope, command])) }) };
}
