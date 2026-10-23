import { NextRequest } from "next/server";
import { handleSyncRead, handleSyncWrite } from "@/lib/onlyfans/content-sync-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ accountId: string; path?: string[] }> };

export const GET = (request: NextRequest, context: Context) => handleSyncRead(request, context);
export const POST = (request: NextRequest, context: Context) => handleSyncWrite(request, context, "POST");
export const PUT = (request: NextRequest, context: Context) => handleSyncWrite(request, context, "PUT");
