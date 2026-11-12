// KNOWN RED (W4 lib-dashboard-data-plus2 F5, F10, F12, F14, docs/review/W4/lib-dashboard-data-plus2.md): lib/media-repair.ts
// preview runs and the pilot plan.
// F5: analyseRow calls withRetry(download) outside any try: one missing storage object (404) aborts the whole run, the row
//     never reaches failed.jsonl and report.txt is not written.
// F10: run knobs are not validated: concurrency NaN starts 0 workers ("selected N", 0 processed, resolves); retries
//      Infinity re-calls the paid analyser for as long as it answers a transient error.
// F12: planPilotFromPreview prints a conflicting row as "-> APPLIED", counts it in the APPLIED header, and states
//      fabricated zero counts (empty newSummary) whatever the preview recorded.
// F14: a retried analyser attempt's costUsd is dropped; only the final attempt's cost is summed.
// Temp dirs from fs.mkdtempSync only; the database is the in-memory PostgREST fake at fetch
// (tests/support/postgrest-wire.ts): any other host throws, any unmodelled request crashes the test (plain Error, not a red).
// Analysis results are test-local (tests/support/media-repair-fixture.ts), not lib's fakeAnalyser.
// Team's Claude owns the fix. Intended runner: init.sh's known-red loop; not wired yet: orchestrator item.
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { useWire } from "../support/postgrest-wire";
import { A } from "../support/ids";
import { failedAnalysis, legacyRow, realAnalysis, realAnalyser, repairCtx, rowId, serveRepairDb, tempRoot } from "../support/media-repair-fixture";
import { harness, outcomeOf } from "../support/outcome";
import { bindHoldList, buildProposal, planPilotFromPreview, runRepair, type Analyser, type Ctx, type Hold } from "../../lib/media-repair";
import { ANALYSIS_VERSION } from "../../lib/media-analysis-contract";

const wire = useWire();
const tmp = tempRoot("w4-dd-repair-run-");
/** What one successful analyser call reports it cost (USD). */
const CALL_COST_USD = 0.02;
/** What a charged transient failure (429 after the provider billed the tokens) reports it cost (USD). */
const FAILED_CALL_COST_USD = 0.01;
/** RunSummary.costUsd in 1/10000 USD, so float sums compare exactly. */
const tenthMilli = (usd: number) => Math.round(usd * 1e4);
const paid = realAnalyser({ costUsd: CALL_COST_USD });
const mkCtx = (over: Partial<Ctx> = {}): Ctx => repairCtx({ stateDir: tmp.fresh(), analyse: paid, ...over });
const PREVIEW = { mode: "preview" as const, scope: "all" as const, table: "photos" as const };

// ── F5 ───────────────────────────────────────────────────────────────────────
test("control: a preview run over two downloadable rows proposes both and writes report.txt", async () => {
  serveRepairDb(wire, [legacyRow(1), legacyRow(2)]);
  const ctx = mkCtx();
  const s = await runRepair(ctx, PREVIEW);
  assert.equal(s.proposed, 2);
  assert.ok(existsSync(path.join(ctx.stateDir, "report.txt")));
});

test("F5 a missing storage object (404) is a failed row in failed.jsonl, and the run completes with report.txt", async () => {
  serveRepairDb(wire, [legacyRow(1), legacyRow(2)]);
  const ctx = mkCtx({
    download: async (p) => { if (p.endsWith("/p1.jpg")) throw new Error("storage download: Object not found (404)"); return Buffer.from(`bytes:${p}`); },
  });
  const outcome = await outcomeOf(runRepair(ctx, PREVIEW));
  assert.ok(!(outcome instanceof Error), outcome instanceof Error
    ? `run aborted: "${outcome.message}"; failed.jsonl ${existsSync(path.join(ctx.stateDir, "failed.jsonl")) ? "exists" : "missing"}, report.txt ${existsSync(path.join(ctx.stateDir, "report.txt")) ? "exists" : "missing"}`
    : "");
  assert.equal(outcome.failed, 1);
  assert.equal(outcome.proposed, 1);
  assert.match(readFileSync(path.join(ctx.stateDir, "failed.jsonl"), "utf8"), new RegExp(`photos:${rowId(1)}`));
  assert.ok(existsSync(path.join(ctx.stateDir, "report.txt")));
});

// ── F10 ──────────────────────────────────────────────────────────────────────
test("control: concurrency 2 and retries 1 analyse every selected row", async () => {
  serveRepairDb(wire, [legacyRow(1), legacyRow(2)]);
  let calls = 0;
  const s = await runRepair(mkCtx({ concurrency: 2, retries: 1, analyse: async (t, b, m) => { calls++; return paid(t, b, m); } }), PREVIEW);
  assert.deepEqual([s.selected, s.proposed, calls], [2, 2, 2]);
});

test("F10 concurrency NaN is refused before any row is analysed", async () => {
  serveRepairDb(wire, [legacyRow(1), legacyRow(2)]);
  let calls = 0;
  const outcome = await outcomeOf(runRepair(mkCtx({ concurrency: Number("abc"), analyse: async (t, b, m) => { calls++; return paid(t, b, m); } }), PREVIEW));
  assert.ok(outcome instanceof Error, outcome instanceof Error ? "" : `resolved: selected ${outcome.selected}, proposed ${outcome.proposed}, failed ${outcome.failed}, analyser calls ${calls}`);
  assert.equal(calls, 0);
});

test("F10 retries Infinity is refused before the analyser is called", async () => {
  serveRepairDb(wire, [legacyRow(1)]);
  let calls = 0;
  // Transient for 4 calls, then a permanent failure, so today's unbounded loop ends and the red finishes.
  const analyse: Analyser = async (_t, _b, m) => {
    calls++;
    return failedAnalysis({ error: calls < 5 ? "OpenRouter 429: rate limited" : "invalid json", costUsd: FAILED_CALL_COST_USD, model: m });
  };
  const outcome = await outcomeOf(runRepair(mkCtx({ retries: Infinity, analyse }), PREVIEW));
  assert.ok(outcome instanceof Error, outcome instanceof Error ? "" : `resolved after ${calls} paid analyser calls for 1 row (retries Infinity accepted)`);
  assert.equal(calls, 0);
});

// ── F14 ──────────────────────────────────────────────────────────────────────
test("control: one successful analyser call reports its cost", async () => {
  serveRepairDb(wire, [legacyRow(1)]);
  const s = await runRepair(mkCtx(), PREVIEW);
  assert.equal(tenthMilli(s.costUsd), tenthMilli(CALL_COST_USD));
});

test("F14 a charged transient failure that is retried counts both attempts' cost", async () => {
  serveRepairDb(wire, [legacyRow(1)]);
  let calls = 0;
  const analyse: Analyser = async (t, b, m) => {
    calls++;
    if (calls === 1) return failedAnalysis({ error: "OpenRouter 429: rate limited", costUsd: FAILED_CALL_COST_USD, model: m });
    return paid(t, b, m);
  };
  const s = await runRepair(mkCtx({ retries: 1, analyse }), PREVIEW);
  harness(calls === 2, `one retry (${calls} analyser calls)`);
  assert.equal(tenthMilli(s.costUsd), tenthMilli(FAILED_CALL_COST_USD + CALL_COST_USD), `costUsd ${s.costUsd}: the first (charged, ${FAILED_CALL_COST_USD}) attempt was dropped`);
});

// ── F12 ──────────────────────────────────────────────────────────────────────
// P1 clean (applies), P2 manually edited since the preview (conflicts), P3 held as failed by the preview.
// The preview recorded PREVIEW_COST_USD per proposal and one failed row.
const PREVIEW_COST_USD = 0.0123;
async function pilotPlan(): Promise<string> {
  const p1 = legacyRow(1), p2 = legacyRow(2), p3 = legacyRow(3);
  serveRepairDb(wire, [p1, { ...p2, metadata_edited_at: "2026-11-12T04:00:00Z" }, p3]);
  const pvDir = tmp.fresh();
  const ctxP = { runId: "r1", now: () => new Date("2026-11-12T05:00:00Z") };
  const res = realAnalysis({ costUsd: PREVIEW_COST_USD });
  const hold: Hold = {
    run: "r1", table: "photos", id: p3.id, clone_id: A, clone_slug: "alpha", storage_path: p3.storage_path, outcome: "failed",
    reason: "invalid json", model: "m", code_version: ANALYSIS_VERSION,
    before: { analysis_status: "legacy", analysis_error: null }, after: { analysis_status: "failed", analysis_error: "invalid json" },
  };
  const previewFile = path.join(pvDir, "preview.jsonl");
  writeFileSync(previewFile, [p1, p2].map((r) => JSON.stringify(buildProposal(ctxP, "photos", r, "alpha", res, true)) + "\n").join(""));
  writeFileSync(path.join(pvDir, "holds.jsonl"), JSON.stringify(hold) + "\n");
  const holdListFile = path.join(pvDir, "hold-list.json");
  writeFileSync(holdListFile, JSON.stringify(bindHoldList(previewFile, [{ table: "photos", id: rowId(99), reason: "not in this preview" }])));
  return (await planPilotFromPreview(mkCtx(), "alpha", previewFile, holdListFile)).plan;
}
/** Row n's block: from its `PHOTO <id>` line to the next blank line (or the end). No block is a harness error, not a red. */
const block = (plan: string, n: number) => {
  const lines = plan.split("\n");
  const at = lines.findIndex((l) => l.startsWith(`PHOTO ${rowId(n)}`));
  if (at < 0) throw new Error(`harness: no PHOTO block for ${rowId(n)} in the plan`);
  const end = lines.findIndex((l, i) => i > at && l === "");
  return lines.slice(at, end < 0 ? lines.length : end).join("\n");
};
/** The first plan line matching `anchor`; no such line is a harness error (the plan's shape changed), not a red. */
const planLine = (plan: string, anchor: RegExp) => {
  const line = plan.split("\n").find((l) => anchor.test(l));
  if (line === undefined) throw new Error(`harness: no plan line matches ${anchor}`);
  return line;
};

test("control: the clean proposal is shown as applied with no conflict", async () => {
  const plan = await pilotPlan();
  assert.match(block(plan, 1), /APPLIED/);
  assert.doesNotMatch(block(plan, 1), /CONFLICT/);
});

test("F12 a proposal that would conflict is not printed as APPLIED", async () => {
  const b = block(await pilotPlan(), 2);
  harness(/CONFLICT/.test(b), `the manual edit is detected (block: ${b.split("\n").slice(0, 2).join(" | ")})`);
  assert.doesNotMatch(b, /-> APPLIED/, `block reads: ${b.split("\n").slice(0, 3).join(" | ")}`);
});

test("F12 the APPLIED count in the header excludes the conflicting proposal", async () => {
  const header = planLine(await pilotPlan(), /^OPERATOR HOLD LIST: .*\bproposals? APPLIED\b/);
  const applied = Number(/(\d+) proposals? APPLIED/.exec(header)![1]);
  assert.equal(applied, 1, `header: "${header}" (only 1 of 2 proposals can apply)`);
});

test("F12 a plan from a saved preview prints the preview's real counts, or no counts line at all", async () => {
  // No counts line is an allowed fix (the finding: "or say nothing"); a present one must carry what the preview recorded:
  // 1 failed row (the P3 hold) and the two proposals' reported cost.
  const line = (await pilotPlan()).split("\n").find((l) => /model cost reported/.test(l));
  if (line === undefined) return;
  const cost = `${(2 * PREVIEW_COST_USD).toFixed(4)} USD`;
  assert.ok(/\bfailed 1\b/.test(line) && line.includes(cost), `counts line: "${line}" (preview recorded failed 1 and ${cost})`);
});
