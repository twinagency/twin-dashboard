import { NextRequest, NextResponse } from "next/server";
import { assignedCreatorAccount, getAgencyOnboardingAccess } from "@/lib/agency-onboarding-access";
import { serviceClient } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(message: string, status: number) {
  return new NextResponse(message, { status, headers: PRIVATE_HEADERS });
}

export async function GET(req: NextRequest) {
  try {
    const access = await getAgencyOnboardingAccess();
    if (!access) return fail("Please sign in to view this file.", 401);
    const accountId = req.nextUrl.searchParams.get("account") || "";
    const fileId = req.nextUrl.searchParams.get("file") || "";
    if (!uuid.test(accountId) || !uuid.test(fileId)) return fail("File not found.", 404);
    if (!await assignedCreatorAccount(access, accountId)) return fail("File not found.", 404);

    // Intake files always live in the local database, independently of bot links.
    const db = serviceClient();
    const { data: file, error } = await db.from("creator_files")
      .select("bucket,storage_path,storage_transfer_status,original_name")
      .eq("id", fileId).eq("creator_account_id", accountId).maybeSingle();
    if (error) return fail("This file is temporarily unavailable. Please try again.", 503);
    if (!file) return fail("File not found.", 404);
    if (file.storage_transfer_status !== "verified") return fail("This upload is not ready to view yet.", 409);
    // Storage signing interpolates this key into an HTTP URL. Reject encoded
    // traversal, backslashes, query/fragment delimiters and control characters
    // before the URL implementation has a chance to normalize them.
    if (!["onboarding-content", "voice-samples"].includes(file.bucket)
      || typeof file.storage_path !== "string" || !file.storage_path.startsWith(`creators/${accountId}/`)
      || /[\\%?#\x00-\x1f\x7f]/.test(file.storage_path)
      || file.storage_path.split("/").some(part => !part || part === ".." || part === ".")) return fail("File not found.", 404);

    const download = req.nextUrl.searchParams.get("download") === "1";
    const name = String(file.original_name || "upload").replace(/[\r\n/\\]/g, "_").slice(0, 180);
    const { data, error: signingError } = await db.storage.from(file.bucket)
      .createSignedUrl(file.storage_path, 900, download ? { download: name } : undefined);
    if (signingError || !data?.signedUrl) return fail("This file is temporarily unavailable. Please try again.", 503);
    return new NextResponse(null, { status: 307, headers: { ...PRIVATE_HEADERS, Location: data.signedUrl } });
  } catch {
    return fail("This file is temporarily unavailable. Please sign in again or retry.", 503);
  }
}
