import { NextRequest, NextResponse } from "next/server";
import { CREATOR_SESSION_COOKIE } from "@/lib/creator-session";
import { creatorDashboardIdentity } from "@/lib/creator-dashboard-identity";
import { creatorUploadsEditable } from "@/lib/creator-upload-policy";
import { activeViewAs } from "@/lib/view-as";
import { trustedFormOrigin } from "@/lib/form-origin";
import { serviceClient } from "@/lib/supabase-service";
import { nextQuestionnaireRevision } from "@/lib/creator-questionnaire-draft";
import { CONTENT_FOLDER_KEY, contentFolderUrl, contentFolders } from "@/lib/creator-content-intake";
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function POST(req: NextRequest) {
  if (req.headers.has("next-action") || !trustedFormOrigin(req) || await activeViewAs(req.cookies)) return reply({ error: "Access denied" }, 403);
  const creator = await creatorDashboardIdentity(req.cookies.get(CREATOR_SESSION_COOKIE)?.value);
  if (!creator || creator.readOnly) return reply({ error: "Sign in again to save this folder." }, 401);
  if (Number(req.headers.get("content-length") || 0) > 4096) return reply({ error: "Folder link is too long." }, 413);
  let body: { url?: unknown };
  try { body = await req.json(); } catch { return reply({ error: "Enter a Google Drive or Dropbox folder link." }, 400); }
  const folder = contentFolderUrl(body?.url);
  if (!folder) return reply({ error: "Paste an HTTPS Google Drive or Dropbox folder link." }, 400);
  const db = serviceClient();
  // Append with a revision lease; never replace questionnaire answers from stale input.
  for (let attempt = 0; attempt < 3; attempt++) {
    const loaded = await db.from("creator_applications").select("id,status,answers,updated_at").eq("creator_account_id", creator.accountId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (loaded.error) return reply({ error: "Could not save the link. Try again." }, 503);
    const app = loaded.data;
    if (!creatorUploadsEditable(app?.status, creator)) return reply({ error: "This application is locked." }, 409);
    const links = contentFolders(app?.answers || {});
    if (links.some(link => link.url === folder.url)) return reply({ folders: links });
    if (links.length >= 10) return reply({ error: "Ten folders are already saved. Contact your agency to replace a link." }, 400);
    links.push({ ...folder, submittedAt: new Date().toISOString() });
    const answers = { ...(app?.answers || {}), [CONTENT_FOLDER_KEY]: JSON.stringify(links) };
    const updated_at = nextQuestionnaireRevision(app?.updated_at);
    const saved = app
      ? await db.from("creator_applications").update({ answers, updated_at }).eq("id", app.id).eq("creator_account_id", creator.accountId).eq("status", app.status).eq("updated_at", app.updated_at).select("id").maybeSingle()
      : await db.from("creator_applications").insert({ id: creator.accountId, creator_account_id: creator.accountId, status: "draft", answers, updated_at }).select("id").single();
    if (!saved.error && saved.data) return reply({ folders: links });
    if (saved.error && saved.error.code !== "23505") return reply({ error: "Could not save the link. Try again." }, 503);
  }
  return reply({ error: "Your application changed in another window. Try saving the link again." }, 409);
}
