"use server";

// app/mtproto-campaign/flows/actions.ts
//
// Server actions for the MTProto follow-up flow builder. Same shape as
// ../actions.ts: guardDashboardAction first (this file is absent from the
// agency allowlist, so an agency session is refused), every check repeated in
// lib/mtproto/flows.ts, errors RETURNED not thrown.
//
// NOTHING HERE TURNS FLOWS ON GLOBALLY. There is no action that writes
// app_settings. setFlowEnabledAction only flips ONE flow, and lib refuses that
// while the global switch is not 'true'.

import { revalidatePath } from "next/cache";
import { guardDashboardAction } from "@/lib/agency-management";
import { signMedia } from "@/lib/mtproto/flow-sign";
import { archiveFlow, createFlow, setFlowEnabled, updateFlow, FlowValidationError } from "@/lib/mtproto/flows";
import { loadFlowPicker, type FlowPicker } from "@/lib/mtproto/flow-media";

const ACTOR = "operator";

export type FlowActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : "action failed" };
}

function parseSteps(fd: FormData): unknown {
  const raw = String(fd.get("steps") ?? "[]");
  try {
    return JSON.parse(raw);
  } catch {
    throw new FlowValidationError("the steps could not be read, reload the page and try again");
  }
}

function formInput(fd: FormData) {
  const cloneId = String(fd.get("cloneId") ?? "").trim();
  return { name: String(fd.get("name") ?? ""), cloneId: cloneId || null, steps: parseSteps(fd) };
}

function refresh(id?: string) {
  revalidatePath("/mtproto-campaign/flows");
  if (id) revalidatePath(`/mtproto-campaign/flows/${id}`);
}

export async function createFlowAction(fd: FormData): Promise<FlowActionResult<{ id: string }>> {
  await guardDashboardAction("app/mtproto-campaign/flows/actions.ts#createFlowAction", [fd]);
  try {
    const flow = await createFlow(formInput(fd), ACTOR);
    refresh();
    return { ok: true, id: flow.id };
  } catch (e) {
    return fail(e);
  }
}

export async function saveFlowAction(fd: FormData): Promise<FlowActionResult> {
  await guardDashboardAction("app/mtproto-campaign/flows/actions.ts#saveFlowAction", [fd]);
  const id = String(fd.get("flowId") ?? "");
  try {
    await updateFlow(id, formInput(fd), ACTOR);
    refresh(id);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function archiveFlowAction(fd: FormData): Promise<FlowActionResult> {
  await guardDashboardAction("app/mtproto-campaign/flows/actions.ts#archiveFlowAction", [fd]);
  const id = String(fd.get("flowId") ?? "");
  try {
    await archiveFlow(id, ACTOR);
    refresh(id);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setFlowEnabledAction(fd: FormData): Promise<FlowActionResult<{ enabled: boolean }>> {
  await guardDashboardAction("app/mtproto-campaign/flows/actions.ts#setFlowEnabledAction", [fd]);
  const id = String(fd.get("flowId") ?? "");
  try {
    const want = String(fd.get("enabled") ?? "") === "true";
    const flow = await setFlowEnabled(id, want, ACTOR);
    refresh(id);
    return { ok: true, enabled: flow.enabled };
  } catch (e) {
    return fail(e);
  }
}

/** Read-only: one girl's photos, videos, bundles and sequences for the pickers. */
export async function loadFlowPickerAction(cloneId: string): Promise<FlowActionResult<{ picker: FlowPicker }>> {
  await guardDashboardAction("app/mtproto-campaign/flows/actions.ts#loadFlowPickerAction", [cloneId]);
  try {
    return { ok: true, picker: await loadFlowPicker(cloneId, signMedia) };
  } catch (e) {
    return fail(e);
  }
}
