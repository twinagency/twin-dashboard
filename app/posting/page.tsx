import { supabaseAdmin } from "@/lib/supabase";
import PostingStudio from "./PostingStudio";

export const dynamic = "force-dynamic";

// Posting: stories on a girl's own profile and posts in her Telegram channel,
// from her content bucket or an upload, through her own clone bot. Operator
// only (absent from agencyDashboardPath, actions guarded). Everything it does
// goes through lib/posting.ts, the same code as /api/admin/v1/posting/*.
export default async function PostingPage() {
  const { data } = await supabaseAdmin.from("clones").select("id,slug,name").order("name", { ascending: true });
  const clones = ((data ?? []) as { id: string; slug: string; name: string }[]).map((c) => ({ id: c.id, slug: c.slug, name: c.name }));
  return <PostingStudio clones={clones} />;
}
