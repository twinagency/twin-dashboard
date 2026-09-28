import { cookies } from "next/headers";
import { serviceClient } from "@/lib/supabase-service";
import { isAuthed } from "@/lib/auth";
import { AGENCY_COOKIE } from "@/lib/agency-policy";
import { CREATOR_SESSION_COOKIE } from "@/lib/creator-session";
import { createCatalogueHandler } from "@/lib/catalogue-api";
import { renderPreview } from "@/lib/catalogue-preview";
import { renderVideoPreview, videoPreviewSources } from "@/lib/catalogue-video-preview";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = createCatalogueHandler({
  db: serviceClient,
  admin: async () => {
    const jar = await cookies();
    return !jar.has(AGENCY_COOKIE) && !jar.has(CREATOR_SESSION_COOKIE) && await isAuthed();
  },
  preview: renderPreview,
  videoPreview: renderVideoPreview,
  videoSources: videoPreviewSources,
  content: async (path) => {
    const {data,error}=await serviceClient().storage.from('media').createSignedUrl(path,300);
    if(error||!data?.signedUrl)throw new Error('Original temporarily unavailable.');
    return data.signedUrl;
  },
});
