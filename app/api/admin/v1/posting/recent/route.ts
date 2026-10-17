import { withAdmin, ok, jsonError } from "@/lib/api-route";
import { resolveClone } from "@/lib/api-read";
import { listRecentPosts } from "@/lib/posting";

export const dynamic = "force-dynamic";

// What was posted recently, newest first. Read only.
//   ?clone=<slug>   one girl (default all)
//   ?days=7         look-back, 1 to 30 (system_logs keeps 30 days)
//   ?limit=100      1 to 500
// Stories carry expiresAt and live (still up, not deleted). Deleted posts stay
// in the list with deleted=true. Source is our own send log, see lib/posting.ts.
export const GET = withAdmin(async (req) => {
  const p = new URL(req.url).searchParams;
  const days = Math.min(30, Math.max(1, Number(p.get("days") ?? 7) || 7));
  const limit = Math.min(500, Math.max(1, Number(p.get("limit") ?? 100) || 100));
  let cloneId: string | null = null;
  const key = p.get("clone");
  if (key) {
    const c = await resolveClone(key);
    if (!c) return jsonError(`no clone matching "${key}"`, 404);
    cloneId = c.id;
  }
  const posts = await listRecentPosts({ cloneId, days, limit });
  return ok({ days, count: posts.length, posts });
});
