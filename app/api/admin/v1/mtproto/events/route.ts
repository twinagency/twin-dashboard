import { withAdmin, ok, jsonError } from "@/lib/api-route";
import { listEvents } from "@/lib/mtproto/events";
import { EVENT_TYPES, type EventType } from "@/lib/mtproto/types";

export const dynamic = "force-dynamic";

// Bounded event read for external tooling / sim testing — same data the
// dashboard's own live feed polls, over the bearer-key surface instead of
// the session cookie. Requires ?run= or ?clone= (no unfiltered scan).
export const GET = withAdmin(async (req) => {
  const params = new URL(req.url).searchParams;
  const runId = params.get("run") ?? undefined;
  const cloneId = params.get("clone") ?? undefined;
  if (!runId && !cloneId) return jsonError("run or clone is required", 400);

  const eventTypeRaw = params.get("eventType");
  if (eventTypeRaw && !(EVENT_TYPES as readonly string[]).includes(eventTypeRaw)) {
    return jsonError(`eventType must be one of ${EVENT_TYPES.join(", ")}`, 400);
  }

  const events = await listEvents({
    runId,
    cloneId,
    eventType: eventTypeRaw as EventType | undefined,
    sinceIso: params.get("since") ?? undefined,
    limit: params.get("limit") ? Number(params.get("limit")) : undefined,
  });
  return ok({ events });
});
