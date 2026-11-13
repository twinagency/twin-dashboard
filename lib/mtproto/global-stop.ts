// lib/mtproto/global-stop.ts
//
// Kill-switch layer 1 (plan section G / migration 158's header): a single
// app_settings row, key GLOBAL_STOP_KEY, that the worker polls. NOT a new
// table (additive-only rule) — same app_settings mechanism app/settings/
// actions.ts uses for other fleet-wide flags, reimplemented here directly
// (self-contained instruction: this file does not import that module).
//
// The worker reads value === "true" (twin-userbot/src/store.ts isGlobalStopped).

import { mtDb } from "./db";
import { insertEvent } from "./events";
import { RunValidationError } from "./validate";
import { GLOBAL_STOP_KEY, RESUME_PHRASE } from "./types";

/** Throws when the flag cannot be read: callers must NOT show "not stopped"
 *  for a state they could not verify. */
export async function getGlobalStop(): Promise<boolean> {
  const { data, error } = await mtDb().from("app_settings").select("value").eq("key", GLOBAL_STOP_KEY).maybeSingle();
  if (error) throw new Error(`could not read global stop: ${error.message}`);
  return data?.value === "true";
}

/** Sets or lifts the fleet-wide stop. STOP needs nothing (the safe direction
 *  must always be one call). LIFTING requires the typed phrase, checked here
 *  server-side. The write is read back to prove it landed, and a control_action
 *  event with before/after is recorded; any failure is thrown, never swallowed.
 *  A write that landed but could not be read back says "state unknown".
 *  Returns the read-back value. */
export async function setGlobalStop(stopped: boolean, actor: string, reason?: string, typed?: string | null): Promise<boolean> {
  if (!stopped && (typed ?? "").trim().toUpperCase() !== RESUME_PHRASE) {
    throw new RunValidationError(`type ${RESUME_PHRASE} to lift the global stop`);
  }
  let before: boolean | null = null;
  try {
    before = await getGlobalStop();
  } catch {
    before = null; // unknown; still let a STOP through
  }
  const now = new Date().toISOString();
  const { error } = await mtDb()
    .from("app_settings")
    .upsert({ key: GLOBAL_STOP_KEY, value: stopped ? "true" : "false", updated_at: now });
  if (error) throw new Error(`global ${stopped ? "stop" : "resume"} failed: ${error.message}`);
  let after: boolean;
  try {
    after = await getGlobalStop();
  } catch (e) {
    throw new Error(`global ${stopped ? "stop" : "resume"} was written but could not be read back, state unknown (${e instanceof Error ? e.message : e}). Treat sending as possibly active`);
  }
  if (after !== stopped) throw new Error(`global ${stopped ? "stop" : "resume"} did not take effect (flag reads ${after}); try again`);
  try {
    await insertEvent({
      runId: null,
      episodeId: null,
      cloneId: null,
      userId: null,
      eventType: "control_action",
      actor,
      detail: { action: stopped ? "global_stop" : "global_resume", reason: reason?.slice(0, 500) ?? null, before: { stopped: before }, after: { stopped: after } },
    });
  } catch (e) {
    throw new Error(`global ${stopped ? "stop" : "resume"} WAS applied, but the audit event failed: ${e instanceof Error ? e.message : e}`);
  }
  return after;
}
