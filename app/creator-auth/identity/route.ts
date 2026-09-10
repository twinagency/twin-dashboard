import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { trustedFormOrigin } from "@/lib/form-origin";
import { creatorRequestUrl } from "@/lib/creator-origin";
import { CREATOR_SESSION_COOKIE } from "@/lib/creator-session";
import { resolveCreatorDashboardIdentity } from "@/lib/creator-dashboard-access";
import { CREATOR_IDENTITY_FIELDS, creatorIdentityFormAllowed } from "@/lib/creator-identity-fields";
import { serviceClient } from "@/lib/supabase-service";
import { INTAKE_FIELD_KEYS, assembleAnswers } from "@/lib/intake";
import { invalidateCloneCaches } from "@/lib/query-cache";
function back(req: NextRequest, query: string) { return NextResponse.redirect(creatorRequestUrl(req, `/creator/edit?${query}`), 303); }
export async function POST(req: NextRequest) {
  if (!trustedFormOrigin(req) || req.headers.has("next-action")) return new NextResponse("Forbidden", { status: 403 });
  const identity = await resolveCreatorDashboardIdentity(req.cookies.get(CREATOR_SESSION_COOKIE)?.value);
  if (!identity?.ready || !identity.cloneId) return new NextResponse("Creator access denied", { status: 403 });
  const fd = await req.formData();
  if (!creatorIdentityFormAllowed(fd)) return new NextResponse("Only identity fields may be changed", { status: 403 });
  const name = String(fd.get("name") || "").trim();
  const revision = String(fd.get("revision") || "");
  if (!name || name.length > 100 || !revision || !Number.isFinite(Date.parse(revision))) return back(req, "error=invalid");
  const dob = String(fd.get("date_of_birth") || "");
  if (dob && (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || !Number.isFinite(Date.parse(dob)))) return back(req, "error=invalid");
  const db = serviceClient();
  const prior = await db.from("clones").select("id,intake,updated_at").eq("id", identity.cloneId).single();
  if (prior.error || !prior.data) return back(req, "error=failed");
  const intake = (prior.data.intake || {}) as Record<string, unknown> & { fields?: Record<string, string> };
  const fields = { ...(intake.fields || {}) };
  for (const key of INTAKE_FIELD_KEYS) if (fd.has(`intake_${key}`)) fields[key] = String(fd.get(`intake_${key}`) || "").trim();
  const patch: Record<string, unknown> = {};
  for (const [key] of CREATOR_IDENTITY_FIELDS) if (fd.has(key)) patch[key] = String(fd.get(key) || "").trim() || null;
  patch.intake = { ...intake, fields, answers: assembleAnswers(fields, name) };
  patch.updated_at = new Date().toISOString();
  // Ownership was resolved above; the revision prevents silently overwriting an agency edit.
  const updated = await db.from("clones").update(patch).eq("id", identity.cloneId).eq("updated_at", revision).select("id").maybeSingle();
  if (updated.error) return back(req, "error=failed");
  if (!updated.data) return back(req, "error=conflict");
  invalidateCloneCaches(identity.cloneId);
  revalidatePath("/creator/edit");
  revalidatePath(`/clones/${identity.cloneId}`);
  return back(req, "saved=1");
}
