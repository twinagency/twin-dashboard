// KNOWN RED (W4 lib-dashboard-data-plus2 F3, F6, F8, F16, docs/review/W4/lib-dashboard-data-plus2.md): lib/media-repair.ts
// journals and the reviewed-preview binding.
// F3: loadPreview's sha256 covers preview.jsonl only, but holds.jsonl beside it is applied too: after a holds-only change,
//     an apply bound to the reviewed preview (its operator hold list carries the reviewed sha256) still runs. Green only
//     when that apply refuses or loadPreview throws; a moved hash alone is not enough.
// F6: readJsonl JSON.parses every line, so one torn final line (crash / ENOSPC mid-append) makes rollback restore nothing.
// F8: a crash between the preview.jsonl append and the state "proposed" mark makes resume analyse the row again and
//     append a second proposal, after which loadPreview refuses the whole preview.
// F16: rollbackRun takes `b.table` from the backup file unvalidated (assertWritable checks columns only), so an item line
//      naming photo_bundles is PATCHed.
// Temp dirs from fs.mkdtempSync only; the database is the in-memory PostgREST fake at fetch
// (tests/support/postgrest-wire.ts): any other host throws, any unmodelled request crashes the test (plain Error, not a red).
// Analysis results are test-local (tests/support/media-repair-fixture.ts), not lib's fakeAnalyser.
// Team's Claude owns the fix. Intended runner: init.sh's known-red loop; not wired yet: orchestrator item.
import assert from "node:assert/strict";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { useWire } from "../support/postgrest-wire";
import { A } from "../support/ids";
import { failedAnalysis, legacyRow, realAnalysis, repairCtx, rowId, serveRepairDb, tempRoot } from "../support/media-repair-fixture";
import { harness, outcomeOf } from "../support/outcome";
import { bindHoldList, loadPreview, rollbackRun, runRepair, type Analyser } from "../../lib/media-repair";

const wire = useWire();
const tmp = tempRoot("w4-dd-repair-journal-");
const PREVIEW = { mode: "preview" as const, scope: "all" as const, table: "photos" as const };

// ── F3 ───────────────────────────────────────────────────────────────────────
/** Row 2's analysis fails permanently, so the preview holds it as failed (holds.jsonl). */
const failRow2: Analyser = async (table, bytes, model) =>
  bytes.toString().endsWith("/p2.jpg")
    ? failedAnalysis({ error: "invalid json", model })
    : realAnalysis({ table, bytes, model });

/** A real preview run: row 1 proposed, row 2 held; plus an operator hold list bound to that preview's hash. */
async function reviewedPreview() {
  serveRepairDb(wire, [legacyRow(1), legacyRow(2)]);
  const dir = tmp.fresh();
  const s = await runRepair(repairCtx({ stateDir: dir, analyse: failRow2 }), PREVIEW);
  harness(s.proposed === 1 && s.failed === 1, `the preview proposes row 1 and holds row 2 (proposed ${s.proposed}, failed ${s.failed})`);
  const f = path.join(dir, "preview.jsonl");
  const holdList = path.join(dir, "hold-list.json");
  writeFileSync(holdList, JSON.stringify(bindHoldList(f, [{ table: "photos", id: rowId(1), reason: "reviewer: wrong garment" }])));
  return { dir, f, holdList };
}
/** Apply with every row gone from the table: nothing can be written, so a run that is not refused only records conflicts. */
const applyOutcome = (f: string, holdList: string) => {
  serveRepairDb(wire, []);
  return outcomeOf(runRepair(repairCtx({ stateDir: tmp.fresh() }), { mode: "apply", scope: "all", preview: f, holdList }));
};

test("control: a changed preview.jsonl changes the reviewed sha256", async () => {
  const { f } = await reviewedPreview();
  const before = loadPreview(f).sha256;
  appendFileSync(f, readFileSync(f, "utf8").replaceAll(rowId(1), rowId(3)));
  assert.notEqual(loadPreview(f).sha256, before);
});

test("control: apply with a hold list bound to the unchanged reviewed preview is not refused", async () => {
  const { f, holdList } = await reviewedPreview();
  const outcome = await applyOutcome(f, holdList);
  assert.ok(!(outcome instanceof Error), outcome instanceof Error ? `apply refused: ${outcome.message}` : "");
  harness(outcome.applied === 0, `no row exists to write (applied ${outcome.applied})`);
});

test("F3 after a holds-only change (holds.jsonl gains a row apply would write), apply bound to the reviewed preview refuses", async () => {
  const { dir, f, holdList } = await reviewedPreview();
  const before = loadPreview(f);
  const holds = path.join(dir, "holds.jsonl");
  appendFileSync(holds, readFileSync(holds, "utf8").replaceAll(rowId(2), rowId(3)));
  const now = await outcomeOf(() => loadPreview(f));
  if (now instanceof Error) return; // the preview refusing to load after the change is a correct fix
  harness(now.holds.length === before.holds.length + 1, `the extra hold is loaded for apply (${before.holds.length} -> ${now.holds.length})`);
  const applied = await applyOutcome(f, holdList);
  assert.ok(applied instanceof Error,
    `apply with the hold list bound to the reviewed preview ran after holds.jsonl gained a row (sha256 ${before.sha256.slice(0, 12)} -> ${now.sha256.slice(0, 12)}${applied instanceof Error ? "" : `, ${applied.conflicts} conflicts, ${applied.holdsApplied} holds applied`})`);
});

// ── F6 / F16 (rollback) ──────────────────────────────────────────────────────
const backupLine = (kind: "row" | "item", table: string, id: string) =>
  JSON.stringify({ kind, table, id, clone_id: A, storage_path: `${A}/${id}.jpg`, before: { caption: "old" }, after: { caption: "new" }, run: "r1", at: "2026-11-12T05:00:00.000Z" }) + "\n";
/** A guarded restore that matches its one row. */
const patchOk = () => ({ body: [{ id: "matched" }] });
/** The tables a rollback may restore: rows live in photos/videos, item lines in photo_bundle_items (syncItems). */
const MEDIA_PATHS = new Set(["/rest/v1/photos", "/rest/v1/videos", "/rest/v1/photo_bundle_items"]);
const backupFile = (name: string, body: string) => {
  const f = path.join(tmp.fresh(), name);
  writeFileSync(f, body);
  return f;
};

test("control: rollback of a well-formed backup.jsonl restores its row", async () => {
  wire.on("PATCH /rest/v1/photos", patchOk);
  const s = await rollbackRun(repairCtx({ stateDir: tmp.fresh() }), backupFile("backup.jsonl", backupLine("row", "photos", rowId(1))));
  assert.equal(s.restored, 1);
  assert.equal(wire.calls("PATCH /rest/v1/photos").length, 1);
});

test("control: rollback of an item line restores its photo_bundle_items row", async () => {
  wire.on("PATCH /rest/v1/photo_bundle_items", patchOk);
  const s = await rollbackRun(repairCtx({ stateDir: tmp.fresh() }), backupFile("backup.jsonl", backupLine("item", "photo_bundle_items", rowId(1))));
  assert.equal(s.itemsRestored, 1);
  assert.equal(wire.calls("PATCH /rest/v1/photo_bundle_items").length, 1);
});

test("F6 a torn final backup line (crash mid-append) does not stop rollback restoring the complete lines", async () => {
  wire.on("PATCH /rest/v1/photos", patchOk);
  const f = backupFile("torn.jsonl", backupLine("row", "photos", rowId(1)) + backupLine("row", "photos", rowId(2)).slice(0, 40));
  // Today's failure is JSON.parse's SyntaxError on the torn line: that IS the finding, not a harness crash.
  const outcome = await outcomeOf(rollbackRun(repairCtx({ stateDir: tmp.fresh() }), f), { allow: [SyntaxError] });
  assert.ok(!(outcome instanceof Error), outcome instanceof Error ? `rollback threw: ${outcome.message}` : "");
  assert.equal(outcome.restored, 1);
});

test("F16 rollback refuses an item backup line naming a non-media table (photo_bundles) before any PATCH", async () => {
  wire.on("PATCH /rest/v1/photo_bundles", patchOk);
  const f = backupFile("bundles.jsonl", backupLine("item", "photo_bundles", rowId(1)));
  const outcome = await outcomeOf(rollbackRun(repairCtx({ stateDir: tmp.fresh() }), f));
  const foreign = wire.requests.filter((r) => r.method === "PATCH" && !MEDIA_PATHS.has(r.path)).map((r) => r.path);
  assert.deepEqual(foreign, [],
    `PATCHed ${foreign.join(", ")} (caption restored on a sales table); outcome ${outcome instanceof Error ? outcome.message : JSON.stringify(outcome)}`);
  assert.ok(outcome instanceof Error || outcome.errors.length === 1, "refusal is reported");
});

// ── F8 ───────────────────────────────────────────────────────────────────────
test("control: a preview run that completes leaves one proposal per row and loads", async () => {
  serveRepairDb(wire, [legacyRow(1)]);
  const dir = tmp.fresh();
  const s = await runRepair(repairCtx({ stateDir: dir }), PREVIEW);
  assert.equal(s.proposed, 1);
  assert.equal(loadPreview(path.join(dir, "preview.jsonl")).proposals.length, 1);
});

test("F8 a crash after the proposal is written but before it is marked does not make the preview unloadable on resume", async () => {
  serveRepairDb(wire, [legacyRow(1)]);
  const dir = tmp.fresh();
  await runRepair(repairCtx({ stateDir: dir }), PREVIEW);
  // The crash: preview.jsonl was appended + fsynced, the state "proposed" line never reached the disk.
  const stateFile = path.join(dir, "state.jsonl");
  writeFileSync(stateFile, readFileSync(stateFile, "utf8").split("\n").filter((l) => l && !l.includes('"proposed"')).map((l) => l + "\n").join(""));
  const resumed = await outcomeOf(runRepair(repairCtx({ stateDir: dir }), PREVIEW));
  harness(!(resumed instanceof Error), `the resume itself runs${resumed instanceof Error ? `: ${resumed.message}` : ""}`);
  const loaded = await outcomeOf(() => loadPreview(path.join(dir, "preview.jsonl")));
  assert.ok(!(loaded instanceof Error), loaded instanceof Error ? `loadPreview after resume: ${loaded.message}` : "");
});
