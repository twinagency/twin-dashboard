import { NextRequest, NextResponse } from "next/server";
import { trustedFormOrigin, dashboardOrigin } from "@/lib/form-origin";
import { getDashboardAccess } from "@/lib/dashboard-access";
import { CLONE_SCOPE_COOKIE } from "@/lib/clone-scope";
export async function POST(req: NextRequest) {
  if (!trustedFormOrigin(req)) return new NextResponse("Forbidden",{status:403});
  const agency = await getDashboardAccess();
  if (!agency) return new NextResponse("Agency sign in required",{status:401});
  const json = req.headers.get("content-type")?.includes("application/json");
  const body = json ? await req.json() : Object.fromEntries(await req.formData());
  const id = String(body.clone ?? "");
  if (id && !agency.cloneIds.includes(id)) return new NextResponse("Creator access denied",{status:403});
  const next = String(body.next ?? "/revenue");
  const safeNext = next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/revenue";
  const response = json ? NextResponse.json({ok:true}) : NextResponse.redirect(new URL(safeNext,dashboardOrigin(req)),303);
  if (id) response.cookies.set(CLONE_SCOPE_COOKIE,id,{path:"/",httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production"});
  else response.cookies.delete(CLONE_SCOPE_COOKIE);
  return response;
}
