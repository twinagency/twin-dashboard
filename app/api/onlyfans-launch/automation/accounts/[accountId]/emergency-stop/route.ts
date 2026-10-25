import type { NextRequest } from "next/server";
import { accountControls } from "@/lib/onlyfans/launch/account-controls-route";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request:NextRequest,context:{params:Promise<{accountId:string}>}){return accountControls(request,(await context.params).accountId);}
export async function POST(request:NextRequest,context:{params:Promise<{accountId:string}>}){return accountControls(request,(await context.params).accountId,true);}
