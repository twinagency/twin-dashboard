import { NextRequest, NextResponse } from "next/server";
import { configuredConnectionBackend } from "@/lib/onlyfans-connections/backend";
import { validConnectionRegistration, CONNECTION_SCHEMA } from "@/lib/onlyfans-connections/contract";
import { connectionAnswer, connectionRefusal, connectionCommandContext } from "@/lib/onlyfans-connections/route";
import { resolveConnectionCreator } from "@/lib/onlyfans/connection-creators";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const ctx = await connectionCommandContext(request); if (ctx instanceof NextResponse) return ctx;
  if (!validConnectionRegistration(ctx.body)) return connectionRefusal(400, "That account registration is invalid.");
  const creator = await resolveConnectionCreator(ctx.body.creatorId);
  if (!creator) return connectionRefusal(404, "That existing Twin creator is unavailable.");
  const backend = configuredConnectionBackend(); if (!backend) return connectionRefusal(503, "Account connection management is not configured.");
  const command = { ...ctx.body, creatorName: creator.name };
  const result = await backend.provision({ ...command, ...ctx.identity("register-account", ctx.body) });
  return result.ok ? connectionAnswer(result.ack) : connectionAnswer({ schemaVersion: CONNECTION_SCHEMA, ...result }, result.status);
}
