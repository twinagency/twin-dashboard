// Temporary operator script (not committed): review + confirm-live the 3 v2
// dry runs from last night (28/29 Sep) that finished 'done', for Ronan's
// explicit "start live" order. Reuses the documented lib/mtproto/runs.ts
// lifecycle (recordDryRunReview -> confirmLive), same actor string the
// previous session used ("ronan (via claude)"), no raw SQL writes.
import { recordDryRunReview, confirmLive, getRun } from "../lib/mtproto/runs";

const ACTOR = "ronan (via claude)";

const RUN_IDS: Record<string, string> = {
  "briana-redd": "d0b8344e-6f0a-4630-8c82-e52e3236a9f9",
  "dan-dangler": "732f94fc-0db5-4800-88f7-23eae446d33c",
  "mrs-callace": "4129a1a1-2b57-4f4d-b7e3-7a7e96534acc",
};

(async () => {
  for (const [name, id] of Object.entries(RUN_IDS)) {
    console.log(`\n=== ${name} (${id}) ===`);
    try {
      const before = await getRun(id);
      console.log("before:", before?.status, "dryRun=", before?.dryRun);
      const summary = await recordDryRunReview(id, ACTOR);
      console.log("reviewed:", JSON.stringify({ wouldSendCount: summary.wouldSendCount, holdoutCount: summary.holdoutCount, episodeCount: summary.episodeCount, excludedTotal: summary.excludedTotal }));
      const live = await confirmLive(id, ACTOR, "GO LIVE");
      console.log("LIVE:", JSON.stringify({ id: live.id, status: live.status, dryRun: live.dryRun, confirmLiveAt: live.confirmLiveAt }));
    } catch (e) {
      console.error(`FAILED for ${name}:`, e instanceof Error ? e.message : e);
    }
  }
})();
