// lib/mtproto/tests/check-flows.ts
//
// Run: npm run test:mtproto (chained after check-mtproto.ts)
//
// MTProto follow-up flows: the step validator against the twin-bot contract
// (docs/MTPROTO-FLOWS.md), CRUD on the in-memory fake db, tolerance of the
// migration not being applied, run creation with and without the flow_id
// column, and the "global switch off means no flow can be turned on" rule.
// No Supabase, no network.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { FlowValidationError, archiveFlow, createFlow, flowStats, flowStatsMany, getFlow, getFlowsGlobalSwitch, listFlows, setFlowEnabled, updateFlow, validateFlowSteps } from "../flows";
import { draftsToSteps, moveStep, newDraftStep, nextStepId, stepToDraft } from "../flow-draft";
import { createDryRun, type CreateRunInput } from "../runs";
import { __setMtDbForTest } from "../db";
import { FakeDb } from "./fake-db";

let passed = 0;
const failures: string[] = [];
const checks: { name: string; fn: () => void | Promise<void> }[] = [];
function check(name: string, fn: () => void | Promise<void>): void {
  checks.push({ name, fn });
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function eq(actual: unknown, expected: unknown, what: string): void {
  if (actual !== expected) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
async function rejects(p: Promise<unknown>, pattern?: RegExp): Promise<Error> {
  try {
    await p;
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    if (pattern && !pattern.test(err.message)) throw new Error(`rejected with the wrong message: ${err.message}`);
    return err;
  }
  throw new Error("expected a rejection, but it resolved");
}
function throws(fn: () => unknown, pattern?: RegExp): void {
  try {
    fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    assert(e instanceof FlowValidationError, `expected a FlowValidationError, got ${msg}`);
    if (pattern && !pattern.test(msg)) throw new Error(`wrong message: ${msg}`);
    return;
  }
  throw new Error("expected a throw, but it returned");
}
function source(relPath: string): string {
  return readFileSync(fileURLToPath(new URL(relPath, import.meta.url)), "utf8");
}
const stripComments = (s: string) => s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

const CLONE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLONE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PHOTO_A = "11111111-1111-4111-8111-111111111111";
const VIDEO_A = "22222222-2222-4222-8222-222222222222";
const BUNDLE_A = "33333333-3333-4333-8333-333333333333";
const SEQ_A = "44444444-4444-4444-8444-444444444444";
const PHOTO_B = "55555555-5555-4555-8555-555555555555";

const text = (id: string, when = "reply", lines = ["hey you"]) => ({ id, when, action: { type: "text", lines } });

function freshDb(opts: { globalOn?: boolean | "TRUE" } = {}): FakeDb {
  const db = new FakeDb();
  db.seed("clones", [
    { id: CLONE_A, name: "Alpha", status: "active" },
    { id: CLONE_B, name: "Beta", status: "active" },
  ]);
  db.seed("photos", [{ id: PHOTO_A, clone_id: CLONE_A }, { id: PHOTO_B, clone_id: CLONE_B }]);
  db.seed("videos", [{ id: VIDEO_A, clone_id: CLONE_A }]);
  db.seed("photo_bundles", [{ id: BUNDLE_A, clone_id: CLONE_A }]);
  db.seed("video_sequences", [{ id: SEQ_A, clone_id: CLONE_A }]);
  if (opts.globalOn !== undefined) db.seed("app_settings", [{ key: "mtproto_flows_enabled", value: opts.globalOn === true ? "true" : opts.globalOn === false ? "false" : opts.globalOn }]);
  __setMtDbForTest(db);
  return db;
}

// ── A. validateFlowSteps ─────────────────────────────────────────────────────

check("A1 accepts every action type and rebuilds the step without unknown keys", () => {
  const out = validateFlowSteps([
    { id: "s1", when: "reply", evil: 1, action: { type: "text", lines: ["hi", "hello"], extra: true } },
    { id: "s2", when: "yes", action: { type: "free_media", photoIds: [PHOTO_A], videoIds: [VIDEO_A], caption: "for you" } },
    { id: "s3", when: "after_minutes", afterMinutes: 10, action: { type: "bundle_offer", bundleId: BUNDLE_A } },
    { id: "s4", when: "purchased", action: { type: "sequence_offer", sequenceId: SEQ_A } },
    { id: "s5", when: "reply", action: { type: "handoff" } },
  ]);
  eq(out.length, 5, "steps");
  eq(JSON.stringify(out[0]), JSON.stringify({ id: "s1", when: "reply", action: { type: "text", lines: ["hi", "hello"] } }), "rebuilt step");
});
check("A2 empty list is a valid draft; non-array is refused", () => {
  eq(validateFlowSteps([]).length, 0, "empty");
  throws(() => validateFlowSteps(null));
  throws(() => validateFlowSteps({}));
});
check("A3 at most 12 steps", () => {
  const mk = (n: number) => Array.from({ length: n }, (_, i) => text(`s${i + 1}`));
  eq(validateFlowSteps(mk(12)).length, 12, "12 ok");
  throws(() => validateFlowSteps(mk(13)), /at most 12/);
});
check("A4 step ids: [a-z0-9_-]{1,24}, unique", () => {
  for (const bad of ["", "S1", "a b", "x".repeat(25), "é", "a.b"]) throws(() => validateFlowSteps([text(bad)]), /id/);
  throws(() => validateFlowSteps([text("s1"), text("s1")]), /duplicate/);
  validateFlowSteps([text("a_b-9"), text("x".repeat(24))]);
});
check("A5 unknown trigger / unknown action refused", () => {
  throws(() => validateFlowSteps([text("s1", "sometime")]), /trigger/);
  throws(() => validateFlowSteps([{ id: "s1", when: "reply", action: { type: "voice" } }]), /action/);
  throws(() => validateFlowSteps([{ id: "s1", when: "reply" }]), /action/);
});
check("A6 afterMinutes: whole number 1..1380, only on after_minutes", () => {
  const am = (afterMinutes: unknown) => [{ id: "s1", when: "after_minutes", afterMinutes, action: { type: "handoff" } }];
  validateFlowSteps(am(1));
  validateFlowSteps(am(1380));
  for (const bad of [0, -5, 1381, 1.5, "10", null, undefined, NaN]) throws(() => validateFlowSteps(am(bad)), /minutes/);
  throws(() => validateFlowSteps([{ id: "s1", when: "reply", afterMinutes: 5, action: { type: "handoff" } }]), /minutes/);
});
check("A7 text: 1..10 lines, <=280 chars, none empty", () => {
  validateFlowSteps([text("s1", "reply", Array.from({ length: 10 }, (_, i) => `line ${i}`))]);
  validateFlowSteps([text("s1", "reply", ["x".repeat(280)])]);
  throws(() => validateFlowSteps([text("s1", "reply", [])]), /1 to 10/);
  throws(() => validateFlowSteps([text("s1", "reply", Array.from({ length: 11 }, () => "x"))]), /1 to 10/);
  throws(() => validateFlowSteps([text("s1", "reply", ["x".repeat(281)])]), /280/);
  throws(() => validateFlowSteps([text("s1", "reply", ["ok", "  "])]), /empty/);
  throws(() => validateFlowSteps([{ id: "s1", when: "reply", action: { type: "text", lines: "hey" } }]), /lines/);
});
check("A8 no links and no em/en dashes in any fan-facing text", () => {
  for (const bad of ["see https://example.com", "go to www.example.org", "t.me/somebody", "tg://resolve?domain=x", "my site foo.com", "hi — there", "hi – there"]) {
    throws(() => validateFlowSteps([text("s1", "reply", [bad])]), /links|dash/);
    throws(() => validateFlowSteps([{ id: "s1", when: "reply", action: { type: "free_media", photoIds: [PHOTO_A], caption: bad } }]), /links|dash/);
    throws(() => validateFlowSteps([{ id: "s1", when: "reply", action: { type: "bundle_offer", bundleId: BUNDLE_A, caption: bad } }]), /links|dash/);
  }
  validateFlowSteps([text("s1", "reply", ["hey, how are you?", "its 3.5 hours away"])]);
});
check("A9 free_media: 1..5 items in total, real ids", () => {
  const fm = (photoIds: unknown, videoIds: unknown = []) => [{ id: "s1", when: "reply", action: { type: "free_media", photoIds, videoIds } }];
  validateFlowSteps(fm([PHOTO_A]));
  throws(() => validateFlowSteps(fm([])), /1 to 5/);
  const six = Array.from({ length: 6 }, (_, i) => `00000000-0000-4000-8000-00000000000${i}`);
  throws(() => validateFlowSteps(fm(six)), /1 to 5/);
  throws(() => validateFlowSteps(fm(six.slice(0, 3), six.slice(3, 6))), /1 to 5/);
  validateFlowSteps(fm(six.slice(0, 3), six.slice(3, 5)));
  throws(() => validateFlowSteps(fm(["nope"])), /invalid id/);
  throws(() => validateFlowSteps(fm("x")), /list/);
});
check("A10 offers need a real id", () => {
  throws(() => validateFlowSteps([{ id: "s1", when: "reply", action: { type: "bundle_offer", bundleId: "abc" } }]), /bundle/);
  throws(() => validateFlowSteps([{ id: "s1", when: "reply", action: { type: "bundle_offer" } }]), /bundle/);
  throws(() => validateFlowSteps([{ id: "s1", when: "reply", action: { type: "sequence_offer", sequenceId: 5 } }]), /sequence/);
});

// ── B. CRUD on the fake db ───────────────────────────────────────────────────

check("B1 createFlow is always Off and not archived, whatever the caller smuggles in", async () => {
  const db = freshDb();
  const f = await createFlow({ name: "  Welcome  ", cloneId: null, steps: [text("s1")], enabled: true, archived: true } as never, "operator");
  eq(f.enabled, false, "enabled");
  eq(f.archived, false, "archived");
  eq(f.name, "Welcome", "trimmed name");
  eq(db.rows("mtproto_flows")[0].enabled, false, "stored enabled");
  eq(db.rows("mtproto_flows")[0].created_by, "operator", "created_by");
});
check("B2 createFlow rejects bad input and writes nothing", async () => {
  const db = freshDb();
  await rejects(createFlow({ name: "", cloneId: null, steps: [] }, "o"), /name/);
  await rejects(createFlow({ name: "x".repeat(81), cloneId: null, steps: [] }, "o"), /name/);
  await rejects(createFlow({ name: "ok", cloneId: "nope", steps: [] }, "o"), /girl/);
  await rejects(createFlow({ name: "ok", cloneId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", steps: [] }, "o"), /does not exist/);
  await rejects(createFlow({ name: "ok", cloneId: null, steps: [text("s1", "reply", ["a https://x.com"])] }, "o"), /links/);
  eq(db.rows("mtproto_flows").length, 0, "rows written");
});
check("B3 media and offers need a girl, and must be that girl's own", async () => {
  const db = freshDb();
  const media = [{ id: "s1", when: "reply", action: { type: "free_media", photoIds: [PHOTO_A], videoIds: [VIDEO_A] } }];
  await rejects(createFlow({ name: "a", cloneId: null, steps: media }, "o"), /tied to one girl/);
  await rejects(createFlow({ name: "a", cloneId: CLONE_B, steps: media }, "o"), /different girl/);
  await rejects(createFlow({ name: "a", cloneId: CLONE_A, steps: [{ id: "s1", when: "reply", action: { type: "bundle_offer", bundleId: "99999999-9999-4999-8999-999999999999" } }] }, "o"), /no longer exists/);
  const ok = await createFlow({ name: "a", cloneId: CLONE_A, steps: [...media, { id: "s2", when: "yes", action: { type: "bundle_offer", bundleId: BUNDLE_A } }, { id: "s3", when: "purchased", action: { type: "sequence_offer", sequenceId: SEQ_A } }] }, "o");
  eq(ok.steps.length, 3, "steps stored");
  eq(db.rows("mtproto_flows").length, 1, "one row");
});
check("B4 getFlow / listFlows: archived hidden unless asked, newest first", async () => {
  freshDb();
  const a = await createFlow({ name: "A", cloneId: null, steps: [text("s1")] }, "o");
  const b = await createFlow({ name: "B", cloneId: CLONE_A, steps: [] }, "o");
  await archiveFlow(a.id, "o");
  eq((await listFlows()).data.map((f) => f.name).join(), "B", "default list");
  eq((await listFlows({ includeArchived: true })).data.length, 2, "with archived");
  eq((await listFlows({ cloneId: CLONE_B })).data.length, 0, "other girl's list excludes B");
  eq((await listFlows({ cloneId: CLONE_A })).data.length, 1, "her own flow shows");
  eq((await getFlow(b.id)).data?.name, "B", "getFlow");
  eq((await getFlow("not-a-uuid")).data, null, "bad id");
});
check("B5 updateFlow edits name/girl/steps, never enabled; refuses archived", async () => {
  const db = freshDb();
  const f = await createFlow({ name: "A", cloneId: null, steps: [text("s1")] }, "o");
  const u = await updateFlow(f.id, { name: "A2", cloneId: CLONE_A, steps: [text("s1"), text("s2", "yes")], enabled: true } as never, "o");
  eq(u.name, "A2", "name");
  eq(u.steps.length, 2, "steps");
  eq(u.enabled, false, "enabled untouched");
  eq(db.rows("mtproto_flows")[0].clone_id, CLONE_A, "clone");
  await archiveFlow(f.id, "o");
  await rejects(updateFlow(f.id, { name: "again", cloneId: null, steps: [] }, "o"), /archived/);
  await rejects(updateFlow("dddddddd-dddd-4ddd-8ddd-dddddddddddd", { name: "x", cloneId: null, steps: [] }, "o"), /not found/);
});
check("B6 moving a flow with media to another girl is refused", async () => {
  freshDb();
  const f = await createFlow({ name: "A", cloneId: CLONE_A, steps: [{ id: "s1", when: "reply", action: { type: "free_media", photoIds: [PHOTO_A], videoIds: [] } }] }, "o");
  await rejects(updateFlow(f.id, { name: "A", cloneId: CLONE_B, steps: f.steps }, "o"), /different girl/);
});
check("B7 archiveFlow forces Off and keeps the row", async () => {
  const db = freshDb({ globalOn: true });
  const f = await createFlow({ name: "A", cloneId: null, steps: [text("s1")] }, "o");
  await setFlowEnabled(f.id, true, "o");
  const a = await archiveFlow(f.id, "o");
  eq(a.archived, true, "archived");
  eq(a.enabled, false, "enabled");
  eq(db.rows("mtproto_flows").length, 1, "row kept");
});

// ── C. enabling: needs the global switch ─────────────────────────────────────

check("C1 enable is refused while the global switch is absent, false, or not exactly 'true'", async () => {
  for (const g of [undefined, false, "TRUE", "1", ""] as const) {
    const db = freshDb(g === undefined ? {} : { globalOn: g as never });
    const f = await createFlow({ name: "A", cloneId: null, steps: [text("s1")] }, "o");
    await rejects(setFlowEnabled(f.id, true, "o"), /global flows switch is Off/);
    eq(db.rows("mtproto_flows")[0].enabled, false, `stored enabled with global ${JSON.stringify(g)}`);
  }
});
check("C2 enable is refused when the global switch cannot be read", async () => {
  const db = freshDb({ globalOn: true });
  const f = await createFlow({ name: "A", cloneId: null, steps: [text("s1")] }, "o");
  db.fail("app_settings", "select", { message: "boom" });
  await rejects(setFlowEnabled(f.id, true, "o"), /could not be read/);
  eq(db.rows("mtproto_flows")[0].enabled, false, "stored enabled");
  eq((await getFlowsGlobalSwitch()).on, null, "unknown is null, not off");
});
check("C3 with the global switch on, a flow with steps can be turned On, and Off again even if the switch goes away", async () => {
  const db = freshDb({ globalOn: true });
  const f = await createFlow({ name: "A", cloneId: null, steps: [text("s1")] }, "o");
  eq((await setFlowEnabled(f.id, true, "o")).enabled, true, "on");
  db.rows("app_settings")[0].value = "false";
  eq((await setFlowEnabled(f.id, false, "o")).enabled, false, "off still works");
  const cfg = db.rows("reengage_events").filter((e) => e.event_type === "config_change").map((e) => e.detail.action);
  assert(cfg.includes("flow_enabled") && cfg.includes("flow_disabled"), `audit events: ${cfg.join()}`);
});
check("C4 an empty or archived flow cannot be turned On; an On flow cannot be saved empty", async () => {
  freshDb({ globalOn: true });
  const empty = await createFlow({ name: "E", cloneId: null, steps: [] }, "o");
  await rejects(setFlowEnabled(empty.id, true, "o"), /at least one step/);
  const f = await createFlow({ name: "A", cloneId: null, steps: [text("s1")] }, "o");
  await setFlowEnabled(f.id, true, "o");
  await rejects(updateFlow(f.id, { name: "A", cloneId: null, steps: [] }, "o"), /needs at least one step/);
  await archiveFlow(f.id, "o");
  await rejects(setFlowEnabled(f.id, true, "o"), /archived/);
});
check("C5 nothing in the flow code or UI writes the global switch", () => {
  for (const rel of ["../flows.ts", "../flow-steps.ts", "../flow-media.ts", "../../../app/mtproto-campaign/flows/actions.ts", "../../../components/mtproto/flows/FlowEditor.tsx", "../../../app/mtproto-campaign/flows/page.tsx"]) {
    const src = stripComments(source(rel));
    assert(!/app_settings["'`]\s*\)\s*\.(upsert|insert|update|delete)/.test(src), `${rel} writes app_settings`);
    assert(!/setGlobal|mtproto_flows_enabled["'`]?\s*[:,]\s*["'`]true/.test(src), `${rel} sets the global switch`);
  }
});

// ── D. migration not applied ─────────────────────────────────────────────────

check("D1 reads treat missing tables as 'not installed', never throw", async () => {
  const db = freshDb();
  db.missingTables.add("mtproto_flows");
  db.missingTables.add("mtproto_flow_events");
  const l = await listFlows();
  eq(l.installed, false, "list installed");
  eq(l.error, null, "list error");
  eq(l.data.length, 0, "list rows");
  const g = await getFlow("dddddddd-dddd-4ddd-8ddd-dddddddddddd");
  eq(g.installed, false, "get installed");
  const s = await flowStats("dddddddd-dddd-4ddd-8ddd-dddddddddddd");
  eq(s.installed, false, "stats installed");
  eq(s.stats.enrolled, 0, "stats empty");
  eq((await getFlowsGlobalSwitch()).on, false, "global switch still readable");
});
check("D2 writes say 'not installed' plainly", async () => {
  const db = freshDb({ globalOn: true });
  db.missingTables.add("mtproto_flows");
  await rejects(createFlow({ name: "A", cloneId: null, steps: [] }, "o"), /not installed/);
  await rejects(setFlowEnabled("dddddddd-dddd-4ddd-8ddd-dddddddddddd", true, "o"), /not installed/);
});
check("D3 other read failures are reported, not hidden as 'empty and installed'", async () => {
  const db = freshDb();
  db.fail("mtproto_flows", "select", { message: "connection reset", code: "08006" });
  const l = await listFlows();
  assert(l.error && /connection reset/.test(l.error), "error surfaced");
});

// ── E. stats ─────────────────────────────────────────────────────────────────

check("E1 stats: per step sent/failed/bought/stars, plus entered/replied totals", async () => {
  const db = freshDb();
  const F = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const OTHER = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  const ev = (flow_id: string, event: string, step_index: number | null, detail: object = {}) => ({ flow_id, event, step_index, detail });
  db.seed("mtproto_flow_events", [
    ev(F, "enrolled", null), ev(F, "enrolled", null), ev(F, "enrolled", null),
    ev(F, "replied", null), ev(F, "replied", null),
    ev(F, "step_sent", 0), ev(F, "step_sent", 0), ev(F, "step_sent", 1),
    ev(F, "step_failed", 1),
    ev(F, "purchased", 1, { stars: 200 }), ev(F, "purchased", 1, { stars: "50" }), ev(F, "purchased", 1, {}),
    ev(F, "completed", null), ev(F, "stopped", null), ev(F, "expired", null),
    ev(OTHER, "enrolled", null), ev(OTHER, "step_sent", 0),
  ]);
  const { stats, installed } = await flowStats(F);
  eq(installed, true, "installed");
  eq(stats.enrolled, 3, "enrolled");
  eq(stats.replied, 2, "replied");
  eq(stats.steps[0].sent, 2, "step0 sent");
  eq(stats.steps[1].sent, 1, "step1 sent");
  eq(stats.steps[1].failed, 1, "step1 failed");
  eq(stats.steps[1].purchased, 3, "step1 purchased");
  eq(stats.steps[1].stars, 250, "step1 stars");
  eq(stats.stars, 250, "total stars");
  eq(stats.completed + stats.stopped + stats.expired, 3, "outcomes");
  const many = await flowStatsMany([F, OTHER]);
  eq(many.stats.get(OTHER)?.enrolled, 1, "other flow isolated");
});
check("E2 stats pages through more than one page of events", async () => {
  const db = freshDb();
  const F = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  db.seed("mtproto_flow_events", Array.from({ length: 2500 }, (_, i) => ({ id: i + 1, flow_id: F, event: "step_sent", step_index: 0, detail: {} })));
  eq((await flowStats(F)).stats.steps[0].sent, 2500, "sent across pages");
});

// ── F. run creation with a flow ──────────────────────────────────────────────

const RUN: CreateRunInput = { createdBy: "operator", cloneIds: [CLONE_A], filters: {}, dailyCap: 30, runCap: null, holdoutPct: 15 };

check("F1 a run can carry a flow: flow_id stored, event records it", async () => {
  const db = freshDb();
  const f = await createFlow({ name: "A", cloneId: CLONE_A, steps: [text("s1")] }, "o");
  const run = await createDryRun({ ...RUN, flowId: f.id });
  eq(run.flowId, f.id, "run.flowId");
  eq(db.rows("reengage_runs")[0].flow_id, f.id, "stored flow_id");
  eq(db.rows("reengage_runs")[0].dry_run, true, "still a dry run");
  eq(db.rows("reengage_events").find((e) => e.detail.action === "run_created")?.detail.flowId, f.id, "event flowId");
});
check("F2 a run without a flow never writes flow_id", async () => {
  const db = freshDb();
  const run = await createDryRun(RUN);
  eq(run.flowId, null, "run.flowId");
  assert(!("flow_id" in db.rows("reengage_runs")[0]), "flow_id key must be absent");
});
check("F3 flow_id column missing: the run is still created, without it", async () => {
  const db = freshDb();
  const f = await createFlow({ name: "A", cloneId: null, steps: [text("s1")] }, "o");
  db.missingColumns["reengage_runs"] = ["flow_id"];
  const run = await createDryRun({ ...RUN, flowId: f.id });
  eq(db.rows("reengage_runs").length, 1, "run created");
  assert(!("flow_id" in db.rows("reengage_runs")[0]), "no flow_id stored");
  eq(run.flowId, null, "run.flowId");
  eq(db.rows("reengage_events").find((e) => e.detail.action === "run_created")?.detail.flowSkipped, true, "event says the flow was skipped");
});
check("F4 other insert errors still fail the run (only a flow_id column error is stripped)", async () => {
  const db = freshDb();
  const f = await createFlow({ name: "A", cloneId: null, steps: [text("s1")] }, "o");
  db.missingColumns["reengage_runs"] = ["holdout_pct"];
  await rejects(createDryRun({ ...RUN, flowId: f.id }), /holdout_pct/);
  eq(db.rows("reengage_runs").length, 0, "nothing created");
});
check("F5 the flow must exist, be installed, not archived, and fit the creators", async () => {
  const db = freshDb();
  const mine = await createFlow({ name: "A", cloneId: CLONE_A, steps: [text("s1")] }, "o");
  const any = await createFlow({ name: "T", cloneId: null, steps: [text("s1")] }, "o");
  const gone = await createFlow({ name: "G", cloneId: null, steps: [text("s1")] }, "o");
  await archiveFlow(gone.id, "o");
  await rejects(createDryRun({ ...RUN, flowId: "nope" }), /flow must be a valid id/);
  await rejects(createDryRun({ ...RUN, flowId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" }), /does not exist/);
  await rejects(createDryRun({ ...RUN, flowId: gone.id }), /archived/);
  await rejects(createDryRun({ ...RUN, cloneIds: [CLONE_B], flowId: mine.id }), /one girl/);
  await rejects(createDryRun({ ...RUN, cloneIds: [CLONE_A, CLONE_B], flowId: mine.id }), /one girl/);
  eq(db.rows("reengage_runs").length, 0, "nothing created by any refusal");
  await createDryRun({ ...RUN, cloneIds: [CLONE_A, CLONE_B], flowId: any.id });
  eq(db.rows("reengage_runs").length, 1, "template works on a multi-girl run");
  db.missingTables.add("mtproto_flows");
  await rejects(createDryRun({ ...RUN, flowId: any.id }), /not installed/);
});
check("F6 a disabled flow can be attached (it stays inert until both switches are on)", async () => {
  const db = freshDb();
  const f = await createFlow({ name: "A", cloneId: null, steps: [text("s1")] }, "o");
  eq(f.enabled, false, "starts off");
  await createDryRun({ ...RUN, flowId: f.id });
  eq(db.rows("reengage_runs")[0].flow_id, f.id, "attached");
});
check("F7 the run builder form posts flowId and createRunAction passes it on", () => {
  const form = stripComments(source("../../../components/mtproto/RunBuilderForm.tsx"));
  assert(/name="flowId"/.test(form), "RunBuilderForm needs a select named flowId");
  const act = stripComments(source("../../../app/mtproto-campaign/actions.ts"));
  assert(/flowId:\s*String\(fd\.get\("flowId"\)/.test(act), "createRunAction must read flowId");
  const nav = stripComments(source("../../../components/mtproto/MtprotoNav.tsx"));
  assert(/\/mtproto-campaign\/flows/.test(nav), "nav must link to the flows page");
});

// ── G. editor helpers ────────────────────────────────────────────────────────

check("G1 draft round trip: steps survive stepToDraft then draftsToSteps and still validate", () => {
  const steps = validateFlowSteps([
    { id: "s1", when: "reply", action: { type: "text", lines: ["a", "b"] } },
    { id: "s2", when: "after_minutes", afterMinutes: 30, action: { type: "free_media", photoIds: [PHOTO_A], videoIds: [VIDEO_A], caption: "c" } },
    { id: "s3", when: "yes", action: { type: "bundle_offer", bundleId: BUNDLE_A, caption: "d" } },
    { id: "s4", when: "purchased", action: { type: "sequence_offer", sequenceId: SEQ_A } },
    { id: "s5", when: "reply", action: { type: "handoff" } },
  ]);
  const back = validateFlowSteps(draftsToSteps(steps.map(stepToDraft)));
  eq(JSON.stringify(back), JSON.stringify(steps), "round trip");
});
check("G2 blank text lines are dropped, so an all-blank step fails validation with a clear message", () => {
  const d = newDraftStep([]);
  throws(() => validateFlowSteps(draftsToSteps([d])), /1 to 10/);
});
check("G3 new step ids never collide; moveStep swaps and clamps", () => {
  eq(nextStepId([{ id: "s1" }, { id: "s7" }, { id: "custom" }]), "s8", "next id");
  eq(moveStep([1, 2, 3], 0, -1).join(), "1,2,3", "clamp top");
  eq(moveStep([1, 2, 3], 2, 1).join(), "1,2,3", "clamp bottom");
  eq(moveStep([1, 2, 3], 0, 1).join(), "2,1,3", "swap down");
});
check("G4 no em or en dashes in the flow UI, actions or lib source (comments excluded)", () => {
  for (const rel of ["../flows.ts", "../flow-steps.ts", "../flow-draft.ts", "../flow-media.ts", "../../../app/mtproto-campaign/flows/actions.ts", "../../../app/mtproto-campaign/flows/page.tsx", "../../../app/mtproto-campaign/flows/new/page.tsx", "../../../app/mtproto-campaign/flows/[id]/page.tsx", "../../../components/mtproto/flows/FlowEditor.tsx"]) {
    // flow-steps legitimately names the characters in its regexes as escapes, so scan the raw text for literal ones
    assert(!/[–—]/.test(stripComments(source(rel))), `${rel} contains a literal em/en dash`);
  }
  assert(!/[–—]/.test(stripComments(source("../../../components/mtproto/RunBuilderForm.tsx"))), "RunBuilderForm has a dash");
});

async function main(): Promise<void> {
  for (const c of checks) {
    try {
      await c.fn();
      passed++;
    } catch (e) {
      failures.push(`${c.name}\n      ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      __setMtDbForTest(null);
    }
  }
  const total = passed + failures.length;
  if (failures.length) {
    console.error(`\n  ${failures.length} of ${total} CHECKS FAILED (flows)\n`);
    for (const f of failures) console.error(`  ✗ ${f}\n`);
    process.exit(1);
  }
  console.log(`\n  ALL ${total} CHECKS PASSED (lib/mtproto flows)\n`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
