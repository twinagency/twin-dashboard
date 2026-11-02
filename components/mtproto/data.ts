// components/mtproto/data.ts
//
// Request-scoped, de-duplicated reads for the MTProto Campaign screens. The
// layout's safety strip and the page underneath both need the creators, the
// safety snapshots, the global stop flag and the recent runs; React's cache()
// makes each of those one read per page load instead of two. Same lib
// functions, same arguments, same results: this only shares them.

import { cache } from "react";
import { currentGlobalLiveArm, currentGlobalStop } from "@/app/mtproto-campaign/actions";
import { listCreators } from "@/lib/mtproto/clones";
import { listRuns } from "@/lib/mtproto/runs";
import { computeSafetySnapshots } from "@/lib/mtproto/safety";
import type { SafetySnapshot } from "@/lib/mtproto/types";

export const getCreators = cache(() => listCreators());

export const getRecentRuns = cache(() => listRuns(20));

/** Never throws: an unreadable safety read is reported, not shown as zero. */
export const getSafety = cache(async (): Promise<{ snapshots: SafetySnapshot[]; error: string | null }> => {
  try {
    return { snapshots: await computeSafetySnapshots(await getCreators()), error: null };
  } catch (e) {
    return { snapshots: [], error: e instanceof Error ? e.message : "unreadable" };
  }
});

/** `stopped` is null when the flag could not be read (treated as unknown). */
export const getGlobalStop = cache(async (): Promise<{ stopped: boolean | null; error: string | null }> => {
  try {
    return { stopped: await currentGlobalStop(), error: null };
  } catch (e) {
    return { stopped: null, error: e instanceof Error ? e.message : "unreadable" };
  }
});

/** `armed` is null when the flag could not be read. Unknown is NOT shown as
 *  disarmed: an operator must never be told "nothing can send" about a state
 *  nobody could verify. */
export const getGlobalLiveArm = cache(async (): Promise<{ armed: boolean | null; error: string | null }> => {
  try {
    return { armed: await currentGlobalLiveArm(), error: null };
  } catch (e) {
    return { armed: null, error: e instanceof Error ? e.message : "unreadable" };
  }
});
