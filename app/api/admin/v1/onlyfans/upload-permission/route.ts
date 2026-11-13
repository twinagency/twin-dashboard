import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-route";
import { currentUploadPermission, UPLOAD_PERMISSION_VERSION, type SessionActor } from "@/lib/onlyfans/upload-permission";

export const dynamic = "force-dynamic";
export const GET = withAdmin(async request => {
  const query = new URL(request.url).searchParams;
  const keys = [...query.keys()];
  if (keys.length !== 2 || new Set(keys).size !== 2 || keys.some(key => !["actor", "creatorId"].includes(key))) {
    return NextResponse.json({ ok: false, error: "Invalid upload authority scope." }, { status: 400 });
  }
  const actor = query.get("actor") ?? "", creatorId = query.get("creatorId") ?? "";
  // The backend's lease actor off the wire: the runtime check inside is the authority, a named-owner hash verifies as no session.
  const permitted = await currentUploadPermission(actor as SessionActor, creatorId);
  return NextResponse.json({ version: UPLOAD_PERMISSION_VERSION, actor, creatorId, permitted,
    observedAt: new Date().toISOString() }, { headers: { "Cache-Control": "private, no-store" } });
});
