"use server";

// app/mtproto-campaign/actions.ts
//
// Server actions behind the MTProto Campaign UI's own buttons — the same
// role app/clones/actions.ts plays for /clones, and the same functions the
// admin API's app/api/admin/v1/mtproto/write/route.ts wraps for external
// callers.
//
// AGENCY LOCKOUT, TWO LAYERS. (1) middleware.ts's agencyDashboardPath()
// allowlist never lists "/mtproto-campaign", so an agency session 403s on the
// page and on /live and /runs/*/csv. (2) A Next server action id is callable
// from ANY page an agency may open (see lib/agency-management.ts), so route
// filtering alone is not enough: every exported action below calls
// guardDashboardAction FIRST. This file is deliberately absent from that
// guard's allowlist, so for an agency session it falls through to "throw
// Administrator access required"; for the operator session it is a no-op.
//
// EVERY check that matters is repeated server-side in lib/mtproto/*: the typed
// GO LIVE / RESUME phrases, the dry-run-only creation, the status gates. Nothing
// here trusts the form.
//
// Errors the operator must see (a Stop that failed, a bad cap) are RETURNED as
// { ok: false, error } instead of thrown, because Next replaces the message of
// a thrown server-action error with a generic one in production.
//
// ACTOR: the dashboard has no per-operator login yet (N6 GAP — one shared
// session). Every write here logs actor "operator" into reengage_events; an
// admin-API caller logs "api-key" instead (see the write route).

import { revalidatePath } from "next/cache";
import { guardDashboardAction } from "@/lib/agency-management";
import { computeAudiencePreview } from "@/lib/mtproto/audience";
import { confirmLive, createDryRun, queueRun, recordDryRunReview, stopRun, type CreateRunInput } from "@/lib/mtproto/runs";
import { setConnectionDailyCap, setConnectionLiveEnabled, setConnectionPaused } from "@/lib/mtproto/connections";
import { getGlobalStop, setGlobalStop } from "@/lib/mtproto/global-stop";
import { getGlobalLiveArm, setGlobalLiveArm } from "@/lib/mtproto/global-live-arm";
import { sanitizeFilters, sanitizeMessageVariants, uuidList, validateCaps } from "@/lib/mtproto/validate";
import {
  cancelTelegramConnectionRequest,
  getTelegramConnectionRequest,
  requestTelegramConnection,
  submitTelegramTwoFactorPassword,
  type LoginRequestAction,
  type LoginRequestView,
} from "@/lib/mtproto/login-control";
import { DEFAULT_DAILY_CAP, DEFAULT_HOLDOUT_PCT } from "@/lib/mtproto/types";
import type { AudiencePreview, RunFilters } from "@/lib/mtproto/types";

const ACTOR = "operator";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : "action failed" };
}

function numOrUndef(v: FormDataEntryValue | null): number | undefined {
  if (v === null || String(v).trim() === "") return undefined;
  return Number(v);
}

function filtersFromForm(fd: FormData): { cloneIds: string[]; filters: RunFilters } {
  const cloneIds = uuidList(fd.getAll("cloneIds").map(String).filter(Boolean), "cloneIds", 100);
  const filters = sanitizeFilters(
    {
      segment: String(fd.get("segment") ?? "all_silent"),
      minSpendStars: numOrUndef(fd.get("minSpendStars")),
      lastActiveFromDays: numOrUndef(fd.get("lastActiveFromDays")),
      lastActiveToDays: numOrUndef(fd.get("lastActiveToDays")),
      language: String(fd.get("language") ?? ""),
    },
    cloneIds,
  );
  return { cloneIds, filters };
}

function capsFromForm(fd: FormData): { dailyCap: number; runCap: number | null; holdoutPct: number } {
  const dailyCap = numOrUndef(fd.get("dailyCap")) ?? DEFAULT_DAILY_CAP;
  const runCap = numOrUndef(fd.get("runCap")) ?? null;
  const holdoutPct = numOrUndef(fd.get("holdoutPct")) ?? DEFAULT_HOLDOUT_PCT;
  const caps = { dailyCap, runCap, holdoutPct };
  validateCaps(caps);
  return caps;
}

/** Preview never writes (test gate: "preview never writes"). Pure read. */
export async function previewAudienceAction(fd: FormData): Promise<ActionResult<{ preview: AudiencePreview }>> {
  await guardDashboardAction("app/mtproto-campaign/actions.ts#previewAudienceAction", [fd]);
  try {
    const { filters } = filtersFromForm(fd);
    const preview = await computeAudiencePreview(filters, capsFromForm(fd));
    return { ok: true, preview };
  } catch (e) {
    return fail(e);
  }
}

/** Creates the run as DRY RUN (always) then queues it so the worker can claim
 *  and simulate it. dry_run stays true throughout: this action has no way to
 *  ask for a live run, and lib/mtproto/runs.ts createDryRun hardcodes it. */
export async function createRunAction(fd: FormData): Promise<ActionResult<{ id: string }>> {
  await guardDashboardAction("app/mtproto-campaign/actions.ts#createRunAction", [fd]);
  try {
    const { cloneIds, filters } = filtersFromForm(fd);
    const note = String(fd.get("note") ?? "").trim();
    const input: CreateRunInput = {
      createdBy: ACTOR,
      cloneIds,
      filters,
      messageVariants: sanitizeMessageVariants(fd.getAll("messageVariants").map(String)),
      note: note || null,
      ...capsFromForm(fd),
    };
    const run = await createDryRun(input);
    await queueRun(run.id, ACTOR);
    revalidatePath("/mtproto-campaign");
    return { ok: true, id: run.id };
  } catch (e) {
    return fail(e);
  }
}

/** "I reviewed this dry run". The counts recorded are recomputed server-side
 *  from the episodes; nothing the browser sends is trusted or stored. */
export async function reviewDryRunAction(fd: FormData): Promise<ActionResult> {
  await guardDashboardAction("app/mtproto-campaign/actions.ts#reviewDryRunAction", [fd]);
  const runId = String(fd.get("runId") ?? "");
  try {
    await recordDryRunReview(runId, ACTOR);
    return { ok: true };
  } catch (e) {
    return fail(e);
  } finally {
    revalidatePath(`/mtproto-campaign/runs/${runId}`);
  }
}

/** The separate, typed "Confirm LIVE" action. The phrase is re-checked in
 *  confirmLive(); the form field is only where it is collected. */
export async function confirmLiveAction(fd: FormData): Promise<ActionResult> {
  await guardDashboardAction("app/mtproto-campaign/actions.ts#confirmLiveAction", [fd]);
  try {
    const runId = String(fd.get("runId") ?? "");
    await confirmLive(runId, ACTOR, String(fd.get("confirmText") ?? ""));
    revalidatePath(`/mtproto-campaign/runs/${runId}`);
    revalidatePath("/mtproto-campaign");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function stopRunAction(fd: FormData): Promise<ActionResult> {
  await guardDashboardAction("app/mtproto-campaign/actions.ts#stopRunAction", [fd]);
  const runId = String(fd.get("runId") ?? "");
  try {
    await stopRun(runId, ACTOR, String(fd.get("reason") ?? "") || undefined);
    return { ok: true };
  } catch (e) {
    return fail(e);
  } finally {
    revalidatePath(`/mtproto-campaign/runs/${runId}`);
    revalidatePath("/mtproto-campaign");
  }
}

export async function globalStopAction(fd: FormData): Promise<ActionResult> {
  await guardDashboardAction("app/mtproto-campaign/actions.ts#globalStopAction", [fd]);
  try {
    const stopped = fd.get("stopped") === "true";
    await setGlobalStop(stopped, ACTOR, String(fd.get("reason") ?? "") || undefined, String(fd.get("confirmText") ?? ""));
    return { ok: true };
  } catch (e) {
    return fail(e);
  } finally {
    revalidatePath("/mtproto-campaign");
  }
}

export async function currentGlobalStop(): Promise<boolean> {
  await guardDashboardAction("app/mtproto-campaign/actions.ts#currentGlobalStop", []);
  return getGlobalStop();
}

/** The fleet-wide LIVE ARM (migration 165), gate 2's database half. Arming
 *  needs the typed phrase, re-checked in setGlobalLiveArm; the form only
 *  collects it. Disarming is never gated. */
export async function globalLiveArmAction(fd: FormData): Promise<ActionResult> {
  await guardDashboardAction("app/mtproto-campaign/actions.ts#globalLiveArmAction", [fd]);
  try {
    const armed = fd.get("armed") === "true";
    await setGlobalLiveArm(armed, ACTOR, String(fd.get("reason") ?? "") || undefined, String(fd.get("confirmText") ?? ""));
    return { ok: true };
  } catch (e) {
    return fail(e);
  } finally {
    revalidatePath("/mtproto-campaign");
  }
}

export async function currentGlobalLiveArm(): Promise<boolean> {
  await guardDashboardAction("app/mtproto-campaign/actions.ts#currentGlobalLiveArm", []);
  return getGlobalLiveArm();
}

export async function setConnectionPausedAction(fd: FormData): Promise<ActionResult> {
  await guardDashboardAction("app/mtproto-campaign/actions.ts#setConnectionPausedAction", [fd]);
  try {
    await setConnectionPaused(String(fd.get("cloneId") ?? ""), fd.get("paused") === "true", String(fd.get("reason") ?? "") || null, ACTOR, String(fd.get("confirmText") ?? ""));
    return { ok: true };
  } catch (e) {
    return fail(e);
  } finally {
    revalidatePath("/mtproto-campaign/connections");
    revalidatePath("/mtproto-campaign");
  }
}

/** Per-creator LIVE/DRY switch (userbot_connections.live_enabled, migration
 *  164). Same shape as setConnectionPausedAction next door, including the
 *  typed phrase: the form only COLLECTS confirmText, setConnectionLiveEnabled
 *  re-checks it server-side before the write. Turning a creator OFF (back to
 *  dry) needs no phrase. */
export async function setConnectionLiveEnabledAction(fd: FormData): Promise<ActionResult> {
  await guardDashboardAction("app/mtproto-campaign/actions.ts#setConnectionLiveEnabledAction", [fd]);
  try {
    await setConnectionLiveEnabled(String(fd.get("cloneId") ?? ""), fd.get("liveEnabled") === "true", ACTOR, String(fd.get("confirmText") ?? ""));
    return { ok: true };
  } catch (e) {
    return fail(e);
  } finally {
    revalidatePath("/mtproto-campaign/connections");
    revalidatePath("/mtproto-campaign");
  }
}

export async function setConnectionDailyCapAction(fd: FormData): Promise<ActionResult> {
  await guardDashboardAction("app/mtproto-campaign/actions.ts#setConnectionDailyCapAction", [fd]);
  try {
    await setConnectionDailyCap(String(fd.get("cloneId") ?? ""), Number(fd.get("dailyCap")), ACTOR);
    return { ok: true };
  } catch (e) {
    return fail(e);
  } finally {
    revalidatePath("/mtproto-campaign/connections");
  }
}



export async function requestTelegramConnectionAction(fd: FormData): Promise<ActionResult<{ request: LoginRequestView }>> {
  await guardDashboardAction("app/mtproto-campaign/actions.ts#requestTelegramConnectionAction", [fd]);
  try {
    const cloneId = String(fd.get("cloneId") ?? "");
    const action = String(fd.get("action") ?? "") as LoginRequestAction;
    const request = await requestTelegramConnection(cloneId, action, ACTOR);
    revalidatePath("/mtproto-campaign/connections");
    return { ok: true, request };
  } catch (e) {
    return fail(e);
  }
}

export async function pollTelegramConnectionAction(fd: FormData): Promise<ActionResult<{ request: LoginRequestView }>> {
  await guardDashboardAction("app/mtproto-campaign/actions.ts#pollTelegramConnectionAction", [fd]);
  try {
    const request = await getTelegramConnectionRequest(String(fd.get("requestId") ?? ""));
    return { ok: true, request };
  } catch (e) {
    return fail(e);
  }
}

export async function submitTelegramTwoFactorAction(fd: FormData): Promise<ActionResult<{ request: LoginRequestView }>> {
  await guardDashboardAction("app/mtproto-campaign/actions.ts#submitTelegramTwoFactorAction", [fd]);
  try {
    const request = await submitTelegramTwoFactorPassword(
      String(fd.get("requestId") ?? ""),
      String(fd.get("password") ?? ""),
      ACTOR,
    );
    return { ok: true, request };
  } catch (e) {
    return fail(e);
  }
}

export async function cancelTelegramConnectionAction(fd: FormData): Promise<ActionResult> {
  await guardDashboardAction("app/mtproto-campaign/actions.ts#cancelTelegramConnectionAction", [fd]);
  try {
    await cancelTelegramConnectionRequest(String(fd.get("requestId") ?? ""), ACTOR);
    revalidatePath("/mtproto-campaign/connections");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
