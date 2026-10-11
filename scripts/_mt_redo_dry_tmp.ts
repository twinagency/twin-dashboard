// Temporary operator script (not committed): alanna-pow and fit-sid's v2 dry
// runs from last night CRASHED (status 'failed', no run_finished event) before
// finalizing, even though their episodes were fully processed (28831/20305
// acked). recordDryRunReview() hard-requires status 'done', and the worker's
// only recovery CLI (recoverRun) only handles status 'running', not 'failed' —
// there is no documented way to revive a 'failed' run. So: create a fresh dry
// run with the exact same v2 settings/filters/variants, queue it, and let the
// worker run it through to 'done' before it can be reviewed + confirmed live.
import { createDryRun, queueRun } from "../lib/mtproto/runs";

const ACTOR = "ronan (via claude)";

const V2_VARIANTS = [
  "hey you 🥰 been thinking about you lately, what have you been up to?",
  "hiii stranger 😏 i made something special just for my favourite people, want me to show you?",
  "babe i missed you 🥺 i've got a little surprise waiting for you, wanna see?",
  "ok i have to tell you something 🙈 i finally did the thing i kept talking about, guess what it is?",
  "you still there? 😏 i've got something new i think you'd love, want it?",
];

const TARGETS: { name: string; cloneId: string; failedRunId: string }[] = [
  { name: "alanna-pow", cloneId: "6ca0782d-b5cf-433d-8329-f3ef7ec5f011", failedRunId: "d922e44e-4ac3-475a-b6b2-661e59ccefe1" },
  { name: "fit-sid", cloneId: "faf84489-b556-40ff-81d6-6fb6c6fe3bac", failedRunId: "cb329cdc-4f7f-41b6-984b-c051e9173e0a" },
];

(async () => {
  for (const t of TARGETS) {
    console.log(`\n=== ${t.name} ===`);
    try {
      const run = await createDryRun({
        createdBy: ACTOR,
        cloneIds: [t.cloneId],
        filters: { segment: "all_silent", cloneIds: [t.cloneId], includeLegacy: true },
        dailyCap: 2400,
        runCap: null,
        holdoutPct: 0,
        messageVariants: V2_VARIANTS,
        note: `Mini App announcement v2, link-free copy (5 variants), re-run: replaces failed ${t.failedRunId}: ${t.name} Mini App announcement to ALL fans (recontact), 5 variants`,
      });
      await queueRun(run.id, ACTOR);
      console.log("queued fresh dry run:", run.id);
    } catch (e) {
      console.error(`FAILED for ${t.name}:`, e instanceof Error ? e.message : e);
    }
  }
})();
