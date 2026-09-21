"use server";

// app/mtproto-campaign/actions.ts
//
// Server actions behind the MTProto Campaign UI's own buttons — the same
// role app/clones/actions.ts plays for /clones, and the same functions the
// admin API's app/api/admin/v1/mtproto/write/route.ts wraps for external
// callers (mirroring app/api/admin/v1/clones/write/route.ts's shape: named
// actions over an allowlist, never a raw column update).
//
// NOT GATED BY guardDashboardAction (lib/agency-management.ts) ON PURPOSE.
// That guard is a no-op for the one real caller here anyway (Ronan's own
// operator session — getDashboardAccess() returns null for it, see that
// file), and the actual lockout for an agency session is middleware.ts's
// agencyDashboardPath() allowlist: "/mtproto-campaign" is deliberately never
// added there (2026-09-22 instruction), so an agency session 403s before any
// route or action here ever runs. Importing agency-management.ts anyway
// would just be a second, redundant coupling into a domain module this area
// is built to stay independent of.
//
// ACTOR: the dashboard has no per-operator login yet (N6 GAP — one shared
// session). Every write here logs actor "operator" into reengage_events; an
// admin-API caller logs "api-key" instead (see the write route).

import { revalidatePath } from "next/cache";
import { computeAudiencePreview } from "@/lib/mtproto/audience";
import { confirmLive, createDryRun, queueRun, stopRun, type CreateRunInput } from "@/lib/mtproto/runs";
import { setConnectionDailyCap, setConnectionPaused } from "@/lib/mtproto/connections";
import { getGlobalStop, setGlobalStop } from "@/lib/mtproto/global-stop";
import { DEFAULT_DAILY_CAP, DEFAULT_HOLDOUT_PCT } from "@/lib/mtproto/types";
import type { AudiencePreview, RunFilters } from "@/lib/mtproto/types";

const ACTOR = "operator";

function filtersFromForm(fd: FormData): RunFilters {
  const cloneIds = fd.getAll("cloneIds").map(String).filter(Boolean);
  const segment = String(fd.get("segment") ?? "all_silent");
  const minSpendStars = fd.get("minSpendStars") ? Number(fd.get("minSpendStars")) : undefined;
  const lastActiveFromDays = fd.get("lastActiveFromDays") ? Number(fd.get("lastActiveFromDays")) : undefined;
  const lastActiveToDays = fd.get("lastActiveToDays") ? Number(fd.get("lastActiveToDays")) : undefined;
  const language = String(fd.get("language") ?? "").trim() || undefined;
  return {
    cloneIds,
    segment: (["all_silent", "top_spenders", "lapsed_buyers", "never_bought"] as const).includes(segment as any)
      ? (segment as RunFilters["segment"])
      : "all_silent",
    minSpendStars,
    lastActiveFromDays,
    lastActiveToDays,
    language,
  };
}

function capsFromForm(fd: FormData): { dailyCap: number; runCap: number | null; holdoutPct: number } {
  const dailyCap = fd.get("dailyCap") ? Number(fd.get("dailyCap")) : DEFAULT_DAILY_CAP;
  const runCapRaw = fd.get("runCap");
  const runCap = runCapRaw && String(runCapRaw).trim() !== "" ? Number(runCapRaw) : null;
  const holdoutPct = fd.get("holdoutPct") ? Number(fd.get("holdoutPct")) : DEFAULT_HOLDOUT_PCT;
  return { dailyCap, runCap, holdoutPct };
}

/** Preview never writes (test gate: "preview never writes"). Pure read,
 *  callable directly from the client form's submit handler. */
export async function previewAudienceAction(fd: FormData): Promise<AudiencePreview> {
  const filters = filtersFromForm(fd);
  const caps = capsFromForm(fd);
  return computeAudiencePreview(filters, caps);
}

/** "Creates the run as DRY RUN (default)" then immediately queues it so the
 *  worker can claim and simulate it — dry_run stays true throughout, so
 *  nothing real ever sends from this call. Returns the new run id so the
 *  page can navigate to its detail view. */
export async function createRunAction(fd: FormData): Promise<{ id: string }> {
  const filters = filtersFromForm(fd);
  const caps = capsFromForm(fd);
  const input: CreateRunInput = { createdBy: ACTOR, cloneIds: filters.cloneIds ?? [], filters, ...caps };
  const run = await createDryRun(input);
  await queueRun(run.id, ACTOR);
  revalidatePath("/mtproto-campaign");
  return { id: run.id };
}

/** The separate, clearly-marked "Confirm LIVE" action (prompt step 5). */
export async function confirmLiveAction(fd: FormData): Promise<void> {
  const runId = String(fd.get("runId") ?? "");
  if (!runId) throw new Error("runId is required");
  await confirmLive(runId, ACTOR);
  revalidatePath(`/mtproto-campaign/runs/${runId}`);
  revalidatePath("/mtproto-campaign");
}

export async function stopRunAction(fd: FormData): Promise<void> {
  const runId = String(fd.get("runId") ?? "");
  if (!runId) throw new Error("runId is required");
  await stopRun(runId, ACTOR, String(fd.get("reason") ?? "") || undefined);
  revalidatePath(`/mtproto-campaign/runs/${runId}`);
  revalidatePath("/mtproto-campaign");
}

export async function globalStopAction(fd: FormData): Promise<void> {
  const stopped = fd.get("stopped") === "true";
  await setGlobalStop(stopped, ACTOR, String(fd.get("reason") ?? "") || undefined);
  revalidatePath("/mtproto-campaign");
}

export async function currentGlobalStop(): Promise<boolean> {
  return getGlobalStop();
}

export async function setConnectionPausedAction(fd: FormData): Promise<void> {
  const cloneId = String(fd.get("cloneId") ?? "");
  if (!cloneId) throw new Error("cloneId is required");
  const paused = fd.get("paused") === "true";
  await setConnectionPaused(cloneId, paused, String(fd.get("reason") ?? "") || null, ACTOR);
  revalidatePath("/mtproto-campaign/connections");
  revalidatePath("/mtproto-campaign");
}

export async function setConnectionDailyCapAction(fd: FormData): Promise<void> {
  const cloneId = String(fd.get("cloneId") ?? "");
  const dailyCap = Number(fd.get("dailyCap"));
  if (!cloneId) throw new Error("cloneId is required");
  await setConnectionDailyCap(cloneId, dailyCap, ACTOR);
  revalidatePath("/mtproto-campaign/connections");
}
