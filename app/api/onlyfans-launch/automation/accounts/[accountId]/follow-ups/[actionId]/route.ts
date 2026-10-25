import type { NextRequest } from "next/server";
import { engagementActionDetail } from "@/lib/onlyfans/launch/b-native-routes";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request:NextRequest,context:{params:Promise<{accountId:string;actionId:string}>}){const p=await context.params;return engagementActionDetail(request,p.accountId,p.actionId);}
