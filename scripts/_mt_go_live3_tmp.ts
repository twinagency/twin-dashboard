// Temporary operator script (not committed). Round 2 confirm-live for the
// fresh dry runs (bri/dan/callace) that just finished 'done'.
import { recordDryRunReview, confirmLive, getRun } from "../lib/mtproto/runs";

const ACTOR = "ronan (via claude)";

const RUN_IDS: Record<string, string> = {
  "briana-redd": "0f222fd1-54eb-4b39-8426-bd014c600927",
  "dan-dangler": "4c2942b1-fbcb-4c7b-a9db-21ce70e8b381",
  "mrs-callace": "83987685-22a2-4f72-9ed2-8841856a9445",
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
