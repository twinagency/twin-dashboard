import type { NextRequest } from "next/server";
import { handleLaunchRead, handleLaunchWrite, type LaunchContext } from "@/lib/onlyfans/launch/a-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const GET = (request: NextRequest, context: LaunchContext) => handleLaunchRead(request, context);
export const POST = (request: NextRequest, context: LaunchContext) => handleLaunchWrite(request, context);
