/**
 * Known red (W6 app-mtproto-campaign-plus5 F2): the Activity tab (app/mtproto-campaign/page.tsx:21-22) reads the 20
 * newest runs (`getRecentRuns` = `listRuns(20)`, components/mtproto/data.ts) and only then drops dry runs. A live run
 * that is still sending falls off the list once 20 newer runs exist (dry or live), and the Activity list is the only
 * in-app link to its run page, where its Stop button lives. Control: with no newer runs the live run is listed.
 * The 20 newer runs are finished LIVE runs, so only "always list non-terminal runs" turns this green; a database-side
 * dry_run filter does not (and would contradict listing dry runs awaiting review, F2b).
 * Fake db only, no network.
 */
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { __setMtDbForTest } from "../../lib/mtproto/db";
import { FakeDb } from "../../lib/mtproto/tests/fake-db";
import MtprotoCampaignPage from "../../app/mtproto-campaign/page";

const CLONE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LIVE = "11111111-1111-4111-8111-000000000000";
const run = (id: string, createdAt: string, dryRun: boolean, status: string, finishedAt: string | null = null) => ({
  id, created_at: createdAt, created_by: "operator", status, dry_run: dryRun, clone_ids: [CLONE_A], filters: {},
  daily_cap: 30, run_cap: null, holdout_pct: 15, message_variants: [], confirm_live_at: dryRun ? null : createdAt,
  started_at: createdAt, finished_at: finishedAt, stop_requested: false, note: null,
});

Object.assign(globalThis, { React });

function seed(newerRuns: number): void {
  const db = new FakeDb();
  db.seed("clones", [{ id: CLONE_A, name: "Alpha", status: "active" }]);
  db.seed("reengage_runs", [
    run(LIVE, "2026-11-01T00:00:00.000Z", false, "running"),
    ...Array.from({ length: newerRuns }, (_, i) =>
      run(`22222222-2222-4222-8222-${String(i).padStart(12, "0")}`, `2026-11-02T00:${String(i).padStart(2, "0")}:00.000Z`, false, "done", "2026-11-03T00:00:00.000Z")),
  ]);
  __setMtDbForTest(db);
}
async function listedRunIds(): Promise<string[]> {
  const el = (await MtprotoCampaignPage()) as { props: { runs: { id: string }[] } };
  return el.props.runs.map((r) => r.id);
}
test.after(() => __setMtDbForTest(null));

test("control: a running live run with no newer runs is listed", async () => {
  seed(0);
  assert.ok((await listedRunIds()).includes(LIVE));
});

test("a running live run stays listed after 20 newer finished live runs", async () => {
  seed(20);
  assert.ok((await listedRunIds()).includes(LIVE), "running live run missing from Activity");
});
