// Temporary operator script (not committed). Round 2, 29 Sep ~18:40 AEST:
// texting bug fixed, restart the campaign. The previous live/dry runs
// (d0b8344e/732f94fc/4129a1a1 live, 24ed1c2b/344a8785 dry) are all
// stop_requested=true, status='stopped' — a terminal state, not resumable
// (queueRun needs 'draft', confirmLive needs 'done'+!stopRequested). So: fresh
// dry run per clone, same v2 text-only settings/filters/variants, then queue.
// Worker-side cooldown/episode-exists dedupe (policy.ts evaluateEligibility:
// isWithinCooldown 24h + episodeAlreadyExists, keyed per (clone,fan) across
// ANY run) will exclude fans already sent to since ~04:48 today automatically
// — no extra action needed.
import { createDryRun, queueRun } from "../lib/mtproto/runs";

const ACTOR = "ronan (via claude)";

const V2_VARIANTS = [
  "hey you 🥰 been thinking about you lately, what have you been up to?",
  "hiii stranger 😏 i made something special just for my favourite people, want me to show you?",
  "babe i missed you 🥺 i've got a little surprise waiting for you, wanna see?",
  "ok i have to tell you something 🙈 i finally did the thing i kept talking about, guess what it is?",
  "you still there? 😏 i've got something new i think you'd love, want it?",
];

const TARGETS: { name: string; cloneId: string; priorRunId: string }[] = [
  { name: "briana-redd", cloneId: "0328e7b3-a1e5-465a-9a30-c9cf6519cba1", priorRunId: "d0b8344e-6f0a-4630-8c82-e52e3236a9f9" },
  { name: "dan-dangler", cloneId: "ca55e1d3-30fa-4f71-8d48-b568c4151630", priorRunId: "732f94fc-0db5-4800-88f7-23eae446d33c" },
  { name: "mrs-callace", cloneId: "2e5eb05f-cc88-4ba6-870a-924948d4b09a", priorRunId: "4129a1a1-2b57-4f4d-b7e3-7a7e96534acc" },
  { name: "alanna-pow", cloneId: "6ca0782d-b5cf-433d-8329-f3ef7ec5f011", priorRunId: "24ed1c2b-5a38-40b8-ab97-5c7d310adabc" },
  { name: "fit-sid", cloneId: "faf84489-b556-40ff-81d6-6fb6c6fe3bac", priorRunId: "344a8785-2576-47ef-a6bd-f3330017d59b" },
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
        note: `Mini App announcement v2, link-free copy (5 variants), round 2 (texting bug fixed), replaces stopped ${t.priorRunId}: ${t.name} Mini App announcement to ALL fans (recontact), 5 variants`,
      });
      await queueRun(run.id, ACTOR);
      console.log("queued fresh dry run:", run.id);
    } catch (e) {
      console.error(`FAILED for ${t.name}:`, e instanceof Error ? e.message : e);
    }
  }
})();
