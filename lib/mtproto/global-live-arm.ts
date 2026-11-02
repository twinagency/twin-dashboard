// lib/mtproto/global-live-arm.ts
//
// The GLOBAL LIVE ARM: the database half of the worker's live gate 2
// (twin-userbot/src/config.ts workerCanSendLive). A single app_settings row at
// GLOBAL_LIVE_ARM_KEY, seeded 'false' by twin-bot/db/migrations/165. NOT a new
// table — the same app_settings mechanism ./global-stop.ts uses for the global
// stop, deliberately reimplemented here in the same shape rather than shared,
// so each control is readable on its own.
//
// The worker reads value === "true" (twin-userbot/src/store.ts
// isGlobalLiveArmed), fresh on every pass, so a disarm bites within one send
// cycle with no restart and no redeploy.
//
// WHAT THIS REPLACED, AND WHAT IT COSTS. Arming live sending used to require
// REENGAGE_ALLOW_LIVE=true in the worker's environment on its EC2 box, i.e.
// out-of-band access over SSM. It now requires dashboard admin access and
// nothing else. That is a real reduction in defence, made on purpose so the
// operator can drive live/dry without a terminal. What stands in its place:
// the typed ARM_LIVE_PHRASE checked here (never in the form), a config_change
// event carrying the actor and before/after, a default of DISARMED, and the
// two other gates (a live-confirmed run; each creator's own live_enabled
// switch) which this cannot touch. What did NOT move: REENGAGE_DRY_RUN /
// --dry on the worker, which still forces dry run and which nothing here can
// lift.
//
// ARMING IS GATED, DISARMING NEVER IS. Same rule as the global stop's
// stop/resume and a creator's LIVE/DRY switch: the safe direction is always
// one call.

import { mtDb } from "./db";
import { insertEvent } from "./events";
import { armLivePhraseOk } from "./halt";
import { RunValidationError } from "./validate";
import { ARM_LIVE_PHRASE, GLOBAL_LIVE_ARM_KEY } from "./types";

/** Throws when the flag cannot be read: callers must NOT show "disarmed" for a
 *  state they could not verify. Only the exact text "true" is ARMED; a missing
 *  row, a null value and anything else are DISARMED. */
export async function getGlobalLiveArm(): Promise<boolean> {
  const { data, error } = await mtDb().from("app_settings").select("value").eq("key", GLOBAL_LIVE_ARM_KEY).maybeSingle();
  if (error) throw new Error(`could not read the global live arm: ${error.message}`);
  return data?.value === "true";
}

/** Arms or disarms live sending fleet-wide. DISARMING needs nothing (the safe
 *  direction must always be one call). ARMING requires the typed phrase,
 *  checked here server-side. The write is read back to prove it landed, and a
 *  config_change event with actor and before/after is recorded; any failure is
 *  thrown, never swallowed. */
export async function setGlobalLiveArm(armed: boolean, actor: string, reason?: string, typed?: string | null): Promise<void> {
  if (armed && !armLivePhraseOk(typed)) {
    throw new RunValidationError(`arming lets every LIVE creator on a confirmed live run send real messages to real fans. Type ${ARM_LIVE_PHRASE} to confirm`);
  }
  let before: boolean | null = null;
  try {
    before = await getGlobalLiveArm();
  } catch {
    before = null; // unknown; still let a DISARM through
  }
  const now = new Date().toISOString();
  const { error } = await mtDb()
    .from("app_settings")
    .upsert({ key: GLOBAL_LIVE_ARM_KEY, value: armed ? "true" : "false", updated_at: now });
  if (error) throw new Error(`global live ${armed ? "arm" : "disarm"} failed: ${error.message}`);
  const after = await getGlobalLiveArm();
  if (after !== armed) throw new Error(`global live ${armed ? "arm" : "disarm"} did not take effect (flag reads ${after}); try again`);
  try {
    await insertEvent({
      runId: null,
      episodeId: null,
      cloneId: null,
      userId: null,
      eventType: "config_change",
      actor,
      detail: {
        action: armed ? "global_live_arm" : "global_live_disarm",
        reason: reason?.slice(0, 500) ?? null,
        before: { armed: before },
        after: { armed: after },
        ...(armed ? { confirmed: true, confirmText: (typed ?? "").trim().replace(/\s+/g, " ") } : {}),
      },
    });
  } catch (e) {
    throw new Error(`global live ${armed ? "arm" : "disarm"} WAS applied, but the audit event failed: ${e instanceof Error ? e.message : e}`);
  }
}
