import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serviceClient } from "@/lib/supabase-service";
import { agencyIdentity } from "@/lib/agency-identity";
import { AGENCY_COOKIE } from "@/lib/agency-policy";
import { AGENCY_PORTAL_COOKIE } from "@/lib/agency-brand";
import { SESSION_COOKIE } from "@/lib/session";
import { CLONE_SCOPE_COOKIE } from "@/lib/clone-scope";
import { dashboardOrigin, trustedFormOrigin } from "@/lib/form-origin";

export function GET(req: NextRequest) {
  return NextResponse.redirect(new URL("/moxy", dashboardOrigin(req)), 303);
}
export async function POST(req: NextRequest) {
  const json = req.headers.get("accept")?.includes("application/json");
  const failed = (error = "credentials", status = 401) => json
    ? NextResponse.json({ok:false,error}, {status,headers:{"Cache-Control":"no-store"}})
    : NextResponse.redirect(new URL("/moxy?error=1", dashboardOrigin(req)),303);
  if (!trustedFormOrigin(req) || req.headers.has("next-action")) return NextResponse.json({ok:false,error:"origin"},{status:403});
  try {
    const fd = await req.formData();
    const login = String(fd.get("email") ?? "").trim().toLowerCase();
    // Named operator accounts use the existing internal Moxy email namespace.
    // Auth and the active Moxy membership still independently gate access below.
    const email = login.includes("@") ? login
      : /^[a-z0-9][a-z0-9._-]{2,63}$/.test(login) ? `${login}@dashboard.lynqai.co` : "";
    const password = String(fd.get("password") ?? "");
    if (!email || email.length > 254 || !password || password.length > 256) return failed();
    // The portal target is fixed server-side. A LYNQ login cannot become Moxy
    // by changing a form field, cookie, URL, email metadata, or creator scope.
    const target = await serviceClient().from("partner_agencies").select("id").eq("slug","moxy").eq("active",true).maybeSingle();
    if (target.error || !target.data) return failed("unavailable",503);
    const auth = createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data,error} = await auth.auth.signInWithPassword({email,password});
    const token = data.session?.access_token;
    const identity = !error && token ? await agencyIdentity(token) : null;
    if (!token || !identity || identity.id !== target.data.id) return failed();
    const response = json ? NextResponse.json({ok:true}) : NextResponse.redirect(new URL("/revenue",dashboardOrigin(req)),303);
    const cookieOptions = {httpOnly:true,secure:process.env.NODE_ENV === "production",sameSite:"strict" as const,path:"/"};
    response.cookies.set(AGENCY_COOKIE,token,{...cookieOptions,maxAge:Math.min(data.session?.expires_in ?? 3600,3600)});
    // Non-authoritative hint, used only to return to the right sign-in page.
    response.cookies.set(AGENCY_PORTAL_COOKIE,"moxy",{...cookieOptions,maxAge:60*60*24*30});
    response.cookies.delete(SESSION_COOKIE);
    response.cookies.delete(CLONE_SCOPE_COOKIE);
    response.headers.set("Cache-Control","no-store");
    return response;
  } catch {
    console.error("Moxy sign-in request failed before completing");
    return failed("unavailable",503);
  }
}
