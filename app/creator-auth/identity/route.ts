import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { CREATOR_SESSION_COOKIE } from "@/lib/creator-session";
import { creatorDashboardIdentity } from "@/lib/creator-dashboard-identity";
import { creatorIdentityPatch } from "@/lib/creator-identity-fields";
import { serviceClient } from "@/lib/supabase-service";
import { trustedFormOrigin } from "@/lib/form-origin";
import { invalidateCloneCaches } from "@/lib/query-cache";
export const runtime = "nodejs";
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function POST(req: NextRequest) {
  if (req.headers.has("next-action") || !trustedFormOrigin(req)) return reply({ error: "Untrusted request" }, 403);
  const creator = await creatorDashboardIdentity((await cookies()).get(CREATOR_SESSION_COOKIE)?.value);
  if (!creator?.onboarded || creator.cloneIds.length !== 1) return reply({ error: "Creator access denied" }, 403);
  try {
    const fd = await req.formData();
    const id = creator.cloneIds[0]; // NEVER use an account/clone ID from the form.
    const db = serviceClient();
    const { data: current, error } = await db.from("clones").select("id,name,intake,updated_at").eq("id", id).maybeSingle();
    if (error || !current) return reply({ error: "Identity could not be loaded" }, 503);
    const revision = String(fd.get("revision") || "");
    if (!revision || revision !== current.updated_at) return reply({ error: "Your identity changed in another window. Refresh before saving." }, 409);
    const patch = creatorIdentityPatch(fd, current);
    if (!Object.keys(patch).length) return reply({ error: "No identity changes were supplied" }, 400);
    const result = await db.from("clones").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).eq("updated_at", revision).select("id").maybeSingle();
    if (result.error) return reply({ error: "Identity could not be saved. Check the entered values." }, 400);
    if (!result.data) return reply({ error: "Your identity changed in another window. Refresh before saving." }, 409);
    invalidateCloneCaches();
    revalidatePath("/creator/edit"); revalidatePath("/creator"); revalidatePath(`/clones/${id}`);
    return reply({ ok: true });
  } catch (error) {
    return reply({ error: error instanceof Error && !/supabase|sql|column|constraint/i.test(error.message) ? error.message : "Identity could not be saved" }, 400);
  }
}
