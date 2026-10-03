import { NextRequest, NextResponse } from "next/server";
import { getAgencyOnboardingAccess, assignedCreatorAccount } from "@/lib/agency-onboarding-access";
import { buildClonePacket, CloneBuildRefusal, flirtClonePipelineEnabled } from "@/lib/flirt-clone-build";
import { flirtCloneBuildStore } from "@/lib/flirt-clone-pipeline-server";
import { serviceClient } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

// Read-only hand-off for the manual steps: her answers plus one-hour signed links to
// her verified uploads (FLIRT storage). The operator drops the files into the new
// clone's /media page in Twin's dashboard, where captioning and pricing run.
// Touches the FLIRT project only. 404 while the pipeline flag is off.
export async function GET(req: NextRequest) {
  if (!flirtClonePipelineEnabled()) return new NextResponse("Not found", { status: 404 });
  const access = await getAgencyOnboardingAccess();
  if (!access) return new NextResponse("Agency sign in required", { status: 401 });
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!await assignedCreatorAccount(access, id)) return new NextResponse("Creator access denied", { status: 403 });
  const record = await flirtCloneBuildStore().load(id);
  if (!record) return new NextResponse("Not found", { status: 404 });
  try {
    const packet = buildClonePacket(record.input);
    const files = await Promise.all(packet.files.map(async (file) => {
      const signed = await serviceClient().storage.from(file.bucket).createSignedUrl(file.storage_path, 3600);
      return { id: file.id, kind: file.kind, name: file.original_name, mime_type: file.mime_type, size_bytes: file.size_bytes, download_url: signed.data?.signedUrl ?? null };
    }));
    return NextResponse.json({ ...packet, files }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof CloneBuildRefusal) return NextResponse.json({ refused: error.code, message: error.message }, { status: 409 });
    throw error;
  }
}
