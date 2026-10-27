import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { hasInternalAdminAccess } from "@/lib/internal-admin";
import { dashboardOrigin, trustedFormOrigin } from "@/lib/form-origin";
import { serviceClient } from "@/lib/supabase-service";
import { parseStaffCreatorCommand } from "@/lib/staff-creator-scope";

export async function POST(request: NextRequest) {
  if (!await hasInternalAdminAccess()) return new NextResponse("Unauthorized", { status: 401 });
  if (!trustedFormOrigin(request) || ![null, "same-origin"].includes(request.headers.get("sec-fetch-site"))) return new NextResponse("Forbidden", { status: 403 });
  let command;
  try { command = parseStaffCreatorCommand(await request.formData()); } catch { command = null; }
  const done = (result: string) => {
    const target = new URL("/agency-admin", dashboardOrigin(request)); target.searchParams.set("result", result);
    if (command) target.searchParams.set("agency", command.agencyId);
    return NextResponse.redirect(target, 303);
  };
  if (!command) return done("error");
  const db = serviceClient();
  const [agency, assigned] = await Promise.all([
    db.from("partner_agencies").select("id").eq("id", command.agencyId).eq("active", true).maybeSingle(),
    db.from("agency_creators").select("clone_id").eq("agency_id", command.agencyId),
  ]);
  if (agency.error || !agency.data || assigned.error || command.creatorIds.some(id => !(assigned.data ?? []).some(row => row.clone_id === id))) return done("conflict");
  const result = await db.from("agency_memberships").update({ creator_scope: command.mode, creator_ids: command.creatorIds, creator_access_revision: randomUUID() })
    .eq("agency_id", command.agencyId).eq("user_id", command.userId).eq("creator_access_revision", command.expectedRevision).select("user_id");
  return done(!result.error && result.data?.length === 1 ? "updated" : "conflict");
}
