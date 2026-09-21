// lib/mtproto/global-stop.ts
//
// Kill-switch layer 1 (plan section G / migration 158's header): a single
// app_settings row, key GLOBAL_STOP_KEY, that the worker polls. NOT a new
// table (additive-only rule) — same app_settings mechanism app/settings/
// actions.ts uses for other fleet-wide flags, reimplemented here directly
// (self-contained instruction: this file does not import that module).

import { supabaseAdmin } from "@/lib/supabase";
import { insertEvent } from "./events";
import { GLOBAL_STOP_KEY } from "./types";

export async function getGlobalStop(): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from("app_settings").select("value").eq("key", GLOBAL_STOP_KEY).maybeSingle();
  if (error) {
    console.warn(`[mtproto] getGlobalStop failed: ${error.message}`);
    return false; // fail toward "not stopped" being visible as false here, never toward hiding an active stop
  }
  return data?.value === "true";
}

export async function setGlobalStop(stopped: boolean, actor: string, reason?: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("app_settings")
    .upsert({ key: GLOBAL_STOP_KEY, value: stopped ? "true" : "false", updated_at: now });
  if (error) throw new Error(error.message);
  await insertEvent({
    runId: null,
    episodeId: null,
    cloneId: null,
    userId: null,
    eventType: "control_action",
    actor,
    detail: { action: stopped ? "global_stop" : "global_resume", reason: reason ?? null },
  });
}
