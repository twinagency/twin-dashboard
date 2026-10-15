// lib/mtproto/flow-sign.ts
//
// Thumbnail signing for the flow editor's media pickers. Kept out of the
// "use server" actions file on purpose: an exported function there becomes a
// callable server action, and this one signs whatever paths it is given. Only
// ever called with storage paths read from one girl's own photos/videos rows.
import { withDashboardAccess } from "@/lib/dashboard-access";
import { supabaseAdmin } from "@/lib/supabase";

export async function signMedia(paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths)].slice(0, 600);
  if (unique.length === 0) return new Map();
  const signed = await withDashboardAccess(null, () => supabaseAdmin.storage.from("media").createSignedUrls(unique, 3600));
  const out = new Map<string, string>();
  for (const s of signed.data ?? []) if (s.signedUrl && s.path) out.set(s.path, s.signedUrl);
  return out;
}
