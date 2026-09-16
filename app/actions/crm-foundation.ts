"use server";

import { revalidatePath } from "next/cache";
import { guardDashboardAction } from "@/lib/agency-management";
import type { CrmMutationResult } from "@/lib/crm-foundation-actions-model";
import {
  CrmMutationError,
  disconnectCrmChannelConnection,
  resolveCrmMappingConflict,
  setCrmCreatorBinding,
  updateCrmCreator,
  upsertCrmChannelConnection,
} from "@/lib/crm-foundation-write";

async function runCrmAction(action: string, mutation: () => Promise<void>): Promise<CrmMutationResult> {
  try {
    await mutation();
    revalidatePath("/workspace/creators");
    revalidatePath("/crm/connections");
    return { ok: true };
  } catch (error) {
    if (error instanceof CrmMutationError) return { ok: false, error: { code: error.code, message: error.message } };
    console.error("Hybrid CRM action failed", { action, error: error instanceof Error ? error.name : "unknown" });
    return { ok: false, error: { code: "FAILED", message: "The CRM change could not be completed." } };
  }
}

export async function updateCrmCreatorAction(input: unknown): Promise<CrmMutationResult> {
  await guardDashboardAction("app/actions/crm-foundation.ts#updateCrmCreatorAction", [input]);
  return runCrmAction("update_creator", () => updateCrmCreator(input));
}

export async function setCrmCreatorBindingAction(input: unknown): Promise<CrmMutationResult> {
  await guardDashboardAction("app/actions/crm-foundation.ts#setCrmCreatorBindingAction", [input]);
  return runCrmAction("set_creator_binding", () => setCrmCreatorBinding(input));
}

export async function upsertCrmChannelConnectionAction(input: unknown): Promise<CrmMutationResult> {
  await guardDashboardAction("app/actions/crm-foundation.ts#upsertCrmChannelConnectionAction", [input]);
  return runCrmAction("upsert_channel_connection", () => upsertCrmChannelConnection(input));
}

export async function disconnectCrmChannelConnectionAction(input: unknown): Promise<CrmMutationResult> {
  await guardDashboardAction("app/actions/crm-foundation.ts#disconnectCrmChannelConnectionAction", [input]);
  return runCrmAction("disconnect_channel_connection", () => disconnectCrmChannelConnection(input));
}

export async function resolveCrmMappingConflictAction(input: unknown): Promise<CrmMutationResult> {
  await guardDashboardAction("app/actions/crm-foundation.ts#resolveCrmMappingConflictAction", [input]);
  return runCrmAction("resolve_mapping_conflict", () => resolveCrmMappingConflict(input));
}
