import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { agencyTeamOwner, teamTokenHash } from "@/lib/agency-team";
import { parseTeamCommand } from "@/lib/agency-team-command";
import { agencyCanManage } from "@/lib/agency-management-policy";
import { serviceClient } from "@/lib/supabase-service";
import { dashboardOrigin, trustedFormOrigin } from "@/lib/form-origin";

export async function POST(req: NextRequest) {
  if (!trustedFormOrigin(req) || ![null,"same-origin"].includes(req.headers.get("sec-fetch-site"))) return new NextResponse("Forbidden",{status:403});
  const owner = await agencyTeamOwner();
  if (!owner) return new NextResponse("Agency owner access required",{status:403});
  let command;
  try { command = parseTeamCommand(await req.formData(),agencyCanManage({...owner,canManage:true})); } catch { command=null; }
  const url = new URL("/agency/team",dashboardOrigin(req));
  if (!command) url.searchParams.set("result","error");
  else {
    const token = command.operation === "invite" ? randomBytes(32).toString("hex") : null;
    const result = await serviceClient().rpc("agency_team_command",{p_actor:owner.userId,p_agency:owner.id,p_command:{...command,...(token ? {token_hash:teamTokenHash(token)} : {})}});
    url.searchParams.set("result",result.error ? "conflict" : token ? "created" : "updated");
    if (!result.error && token) url.searchParams.set("created",token);
  }
  const response = NextResponse.redirect(url,303);
  response.headers.set("Cache-Control","private, no-store"); response.headers.set("Referrer-Policy","no-referrer");
  return response;
}
