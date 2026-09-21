import { withAdmin, ok, jsonError } from "@/lib/api-route";
import { getRun, listRuns } from "@/lib/mtproto/runs";
import { listEpisodesForRun } from "@/lib/mtproto/episodes";
import { computeFunnel } from "@/lib/mtproto/funnel";
import { computeLift } from "@/lib/mtproto/attribution";

export const dynamic = "force-dynamic";

// GET /api/admin/v1/mtproto/runs            -> list, newest first
// GET /api/admin/v1/mtproto/runs?id=<uuid>  -> one run + its funnel + lift
export const GET = withAdmin(async (req) => {
  const params = new URL(req.url).searchParams;
  const id = params.get("id");
  if (id) {
    const run = await getRun(id);
    if (!run) return jsonError(`no run matching "${id}"`, 404);
    const { episodes, truncated } = await listEpisodesForRun(id);
    const [funnel, lift] = await Promise.all([computeFunnel(episodes), computeLift(episodes)]);
    return ok({ run, funnel, lift, truncated });
  }
  const limit = params.get("limit") ? Number(params.get("limit")) : 50;
  const runs = await listRuns(limit);
  return ok({ runs });
});
