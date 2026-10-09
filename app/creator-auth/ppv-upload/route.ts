// Live creator PPV upload. A plain POST (not a server action), because creator
// pages refuse server actions in middleware. Accepts ONE file and nothing else:
// price, caption and free flag all come from the clone's own pricing guide, the
// same path the operator upload uses. The clone is the signed-in creator's own
// link, never a request parameter. View-as stays read-only (middleware 403s it).
import { NextResponse, type NextRequest } from "next/server";
import { CREATOR_SESSION_COOKIE } from "@/lib/creator-session";
import { creatorDashboardIdentity } from "@/lib/creator-dashboard-identity";
import { withDashboardAccess } from "@/lib/dashboard-access";
import { trustedFormOrigin } from "@/lib/form-origin";
import { uploadPhoto, uploadVideo } from "@/app/media/actions";

export const runtime = "nodejs";
export const maxDuration = 300;

function fail(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: NextRequest) {
  if (!trustedFormOrigin(req)) return fail("Forbidden", 403);
  const creator = await creatorDashboardIdentity(req.cookies.get(CREATOR_SESSION_COOKIE)?.value);
  if (!creator || creator.readOnly) return fail("Please sign in again.", 401);
  const cloneId = creator.cloneIds[0];
  if (!cloneId || creator.cloneIds.length !== 1) return fail("Your profile is not connected yet.", 403);

  let form: FormData;
  try { form = await req.formData(); } catch { return fail("Upload failed, please try again.", 400); }
  const files = form.getAll("file");
  const kind = form.get("kind");
  if (files.length !== 1 || !(files[0] instanceof File) || (kind !== "photo" && kind !== "video")) return fail("Upload one file at a time.", 400);
  const clean = new FormData();
  clean.append("file", files[0]);

  const result = await withDashboardAccess(creator, () => kind === "video" ? uploadVideo(cloneId, clean) : uploadPhoto(cloneId, clean));
  return NextResponse.json(result, { status: result.ok ? 200 : 422, headers: { "Cache-Control": "private, no-store" } });
}
