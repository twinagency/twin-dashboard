import { withAdmin, ok } from "@/lib/api-route";
import { listTargets } from "@/lib/posting";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// What can be posted where, right now. Read only.
//
// stories.available   girls whose bot holds an enabled business connection
//                     with the manage-stories right
// channels.available  girls whose profile channel has her bot as an admin
//                     with Post Messages (canPin: also Edit Messages)
// *.unavailable       everyone else, each with the reason, so a caller can
//                     skip them instead of firing posts that will 409
//
// Probes the whole fleet against Telegram, so it is cached for 60s; ?fresh=1
// skips the cache. The posting route re-checks its own target live anyway.
export const GET = withAdmin(async (req) => {
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  return ok({ targets: await listTargets({ fresh }) });
});
