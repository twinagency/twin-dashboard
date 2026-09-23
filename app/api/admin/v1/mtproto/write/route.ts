import { withAdmin, ok, jsonError, logAdminWrite } from "@/lib/api-route";
import { confirmLive, createDryRun, queueRun, recordDryRunReview, stopRun, validateCreateRunInput, RunValidationError, type CreateRunInput } from "@/lib/mtproto/runs";
import { setConnectionDailyCap, setConnectionPaused } from "@/lib/mtproto/connections";
import { getGlobalStop, setGlobalStop } from "@/lib/mtproto/global-stop";
import { getGlobalLiveArm, setGlobalLiveArm } from "@/lib/mtproto/global-live-arm";
import { DEFAULT_DAILY_CAP, DEFAULT_HOLDOUT_PCT, type RunFilters } from "@/lib/mtproto/types";
import { sanitizeMessageVariants } from "@/lib/mtproto/validate";

export const dynamic = "force-dynamic";

// ── The write half of the MTProto admin API ──────────────────────────────────
//
// Named actions over an allowlist, mirroring app/api/admin/v1/clones/write/
// route.ts's shape exactly: every action calls the SAME functions
// app/mtproto-campaign/actions.ts uses for the dashboard's own buttons
// (lib/mtproto/runs.ts, connections.ts, global-stop.ts), so an external
// caller (sim testing, an AI assistant) can never do anything the UI itself
// couldn't. Every write logs via logAdminWrite (system_logs) IN ADDITION to
// the reengage_events row the underlying function already writes — the
// domain audit trail (N1) and the dashboard's admin-API audit trail are both
// kept, not one instead of the other.
//
// Actor for API-key writes is "api-key", distinct from the dashboard UI's
// own "operator" (N6 GAP: no per-user roles yet, so this is a label).
const ACTOR = "api-key";

type Action =
  | "create_run"
  | "review_dry_run"
  | "confirm_live"
  | "stop_run"
  | "global_stop"
  | "global_resume"
  | "global_arm_live"
  | "global_disarm_live"
  | "set_connection_pause"
  | "set_connection_cap";

export const POST = withAdmin(async (req) => {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError("body must be JSON", 400);
  }
  const action = String(body.action ?? "") as Action;

  try {
    switch (action) {
      // ── create a dry run (never live on creation, see lib/mtproto/runs.ts) ──
      case "create_run": {
        const cloneIds = Array.isArray(body.cloneIds) ? body.cloneIds.map(String) : [];
        const filters: RunFilters = { ...(typeof body.filters === "object" && body.filters ? (body.filters as RunFilters) : {}), cloneIds };
        const input: CreateRunInput = {
          createdBy: ACTOR,
          cloneIds,
          filters,
          // A value that is present but not a number is a 400, never a silent default.
          dailyCap: body.dailyCap === undefined ? DEFAULT_DAILY_CAP : (body.dailyCap as number),
          runCap: body.runCap === undefined || body.runCap === null ? null : (body.runCap as number),
          holdoutPct: body.holdoutPct === undefined ? DEFAULT_HOLDOUT_PCT : (body.holdoutPct as number),
          messageVariants: sanitizeMessageVariants(body.messageVariants),
          note: typeof body.note === "string" ? body.note : null,
        };
        for (const k of ["dailyCap", "runCap", "holdoutPct"] as const) {
          const v = input[k];
          if (v !== null && typeof v !== "number") return jsonError(`${k} must be a number`, 400);
        }
        // body.dryRun / body.confirmLiveAt are ignored on purpose: creation is dry-run only.
        validateCreateRunInput(input);
        const run = await createDryRun(input);
        await queueRun(run.id, ACTOR);
        logAdminWrite("mtproto:create_run", null, { runId: run.id, cloneIds, filters });
        return ok({ run, action });
      }

      // Records "a human reviewed this finished dry run"; confirm_live refuses without it.
      case "review_dry_run": {
        const runId = String(body.runId ?? "");
        if (!runId) return jsonError("runId is required", 400);
        const summary = await recordDryRunReview(runId, ACTOR);
        logAdminWrite("mtproto:review_dry_run", null, { runId, wouldSendCount: summary.wouldSendCount });
        return ok({ action, summary: { ...summary, sample: undefined } });
      }

      // confirm_live needs body.confirmText === "GO LIVE"; global_resume needs "RESUME".
      case "confirm_live": {
        const runId = String(body.runId ?? "");
        if (!runId) return jsonError("runId is required", 400);
        const run = await confirmLive(runId, ACTOR, typeof body.confirmText === "string" ? body.confirmText : null);
        logAdminWrite("mtproto:confirm_live", null, { runId });
        return ok({ run, action });
      }

      case "stop_run": {
        const runId = String(body.runId ?? "");
        if (!runId) return jsonError("runId is required", 400);
        const run = await stopRun(runId, ACTOR, typeof body.reason === "string" ? body.reason : undefined);
        logAdminWrite("mtproto:stop_run", null, { runId });
        return ok({ run, action });
      }

      case "global_stop":
      case "global_resume": {
        const stopped = action === "global_stop";
        await setGlobalStop(stopped, ACTOR, typeof body.reason === "string" ? body.reason : undefined, typeof body.confirmText === "string" ? body.confirmText : null);
        logAdminWrite(`mtproto:${action}`, null, {});
        return ok({ action, stopped: await getGlobalStop() });
      }

      // The fleet-wide LIVE ARM (migration 165). global_arm_live needs
      // body.confirmText === "ARM LIVE" (checked in setGlobalLiveArm, not
      // here); disarming needs nothing.
      case "global_arm_live":
      case "global_disarm_live": {
        const armed = action === "global_arm_live";
        await setGlobalLiveArm(armed, ACTOR, typeof body.reason === "string" ? body.reason : undefined, typeof body.confirmText === "string" ? body.confirmText : null);
        logAdminWrite(`mtproto:${action}`, null, {});
        return ok({ action, armed: await getGlobalLiveArm() });
      }

      case "set_connection_pause": {
        const cloneId = String(body.cloneId ?? "");
        if (!cloneId) return jsonError("cloneId is required", 400);
        const paused = body.paused === true;
        // Resuming a spike AUTO-HALT needs body.confirmText = "RESUME <clone name or short id>" (checked in setConnectionPaused).
        await setConnectionPaused(cloneId, paused, typeof body.reason === "string" ? body.reason : null, ACTOR, typeof body.confirmText === "string" ? body.confirmText : null);
        logAdminWrite("mtproto:set_connection_pause", cloneId, { paused });
        return ok({ action, cloneId, paused });
      }

      case "set_connection_cap": {
        const cloneId = String(body.cloneId ?? "");
        const dailyCap = Number(body.dailyCap);
        if (!cloneId) return jsonError("cloneId is required", 400);
        await setConnectionDailyCap(cloneId, dailyCap, ACTOR);
        logAdminWrite("mtproto:set_connection_cap", cloneId, { dailyCap });
        return ok({ action, cloneId, dailyCap });
      }

      default:
        return jsonError(
          `unknown action: "${action}". Allowed: create_run, review_dry_run, confirm_live, stop_run, global_stop, global_resume, global_arm_live, global_disarm_live, set_connection_pause, set_connection_cap.`,
          400,
        );
    }
  } catch (e) {
    if (e instanceof RunValidationError) return jsonError(e.message, 400);
    return jsonError(e instanceof Error ? e.message : "write failed", 500);
  }
});
