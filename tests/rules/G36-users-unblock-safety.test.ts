// G36 regression guard (was KNOWN RED W7 app-users F1, security/safety; promoted from fix-sweep
// tests/known-red/W7-app-users-unblock-safety.test.ts). setBlocked used to write `blocked` whatever the reason, and
// the guard lets agency managers call it, so an agency manager could lift a minor or us_location safety block. Now
// setBlocked(false) from a non-admin is ONE conditional update (blocked_reason "operator", minor_flagged_at null) and
// rejects on 0 rows: a null reason is admin-only, and a verdict landing after the last read is never lifted (r1).
// Added in G36: a missing or garbage `blocked` value is refused, never read as "unblock".
// Controls: admin unblock of a minor-flagged fan and agency unblock of a plain block both write {blocked:false}.
// Harness: actions.ts transpiled with a fake `@/lib/supabase`; the REAL guard runs under withDashboardAccess, and its
// ownedResource read (serviceClient, lib/supabase-service.ts) is answered by a stubbed globalThis.fetch at the wire.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { guardDashboardAction } from "../../lib/agency-management";
import * as dashboardAccess from "../../lib/dashboard-access";
import * as fanCredits from "../../lib/fan-credits";
import { TOP_ONLYFANS_AGENCY } from "../../lib/partner-portals";
const { withDashboardAccess } = dashboardAccess;

// serviceClient() is lazy: these are read on the guard's first call, after module load.
process.env.SUPABASE_URL = "https://offline.supabase.invalid";
process.env.SUPABASE_SERVICE_KEY = "fake-service-key-for-offline-test";

const assigned = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const manager = { ...TOP_ONLYFANS_AGENCY, cloneIds: [assigned], canManage: true };
const FAN = "11111111-1111-4111-8111-111111111111";
type Row = { id: string; clone_id: string; telegram_id: number; paused: boolean; blocked: boolean; blocked_reason: string | null; minor_flagged_at: string | null };
let row: Row;
const noReasonBlock = (): Row => ({ id: FAN, clone_id: assigned, telegram_id: 4242, paused: false, blocked: true, blocked_reason: null, minor_flagged_at: null });
const plainBlock = (): Row => ({ ...noReasonBlock(), blocked_reason: "operator" });
const minorBlock = (): Row => ({ ...plainBlock(), blocked_reason: "minor", minor_flagged_at: "2026-11-01T00:00:00Z" });
const usBlock = (): Row => ({ ...plainBlock(), blocked_reason: "us_location" });

// Wire fake for the guard's serviceClient read: GET /rest/v1/users?select=id,clone_id,telegram_id,paused&id=eq.<FAN>...
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  assert.equal(url.host, "offline.supabase.invalid", "only the fake host may be fetched");
  assert.equal(url.pathname, "/rest/v1/users");
  assert.equal((init?.method ?? "GET").toUpperCase(), "GET");
  const hit = url.searchParams.get("id") === `eq.${row.id}` ? [{ id: row.id, clone_id: row.clone_id, telegram_id: row.telegram_id, paused: row.paused }] : [];
  const accept = new Headers(init?.headers).get("accept") ?? "";
  const body = accept.includes("vnd.pgrst.object") ? JSON.stringify(hit[0] ?? null) : JSON.stringify(hit);
  return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;
test.after(() => { globalThis.fetch = realFetch; });

// Fake supabaseAdmin over the one `row`: eq/is filters apply to select AND update, like PostgREST, so a conditional
// update that no longer matches changes nothing. `writes` records only patches that matched (and were applied);
// update().select() returns the matched rows.
const writes: { table: string; patch: Record<string, unknown> }[] = [];
let raceBeforeWrite: Partial<Row> | null = null;
function builder(table: string) {
  const b: any = {
    filters: [] as ((r: Record<string, unknown>) => boolean)[],
    select(cols: string) { b.cols = cols; return b; },
    update(patch: Record<string, unknown>) { b.patch = patch; return b; },
    eq(key: string, value: unknown) { b.filters.push((r: Record<string, unknown>) => r[key] !== null && String(r[key]) === String(value)); return b; },
    is(key: string, value: null) { b.filters.push((r: Record<string, unknown>) => r[key] === value); return b; },
    // Only the flat "col.eq.v,col.is.null" form setBlocked sends.
    or(list: string) {
      const alts = list.split(",").map((p) => { const [k, op, ...v] = p.split("."); return { k, op, v: v.join(".") }; });
      b.filters.push((r: Record<string, unknown>) => alts.some(({ k, op, v }) => op === "is" ? r[k] === null : op === "eq" ? r[k] !== null && String(r[k]) === v : assert.fail(`unsupported or filter ${list}`)));
      return b;
    },
    maybeSingle() { b.one = true; return b; },
    single() { b.one = true; return b; },
    then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) {
      if (b.patch && raceBeforeWrite) { Object.assign(row, raceBeforeWrite); raceBeforeWrite = null; } // lands after every read
      const hit = table === "users" && b.filters.every((f: (r: Record<string, unknown>) => boolean) => f(row)) ? [row] : [];
      if (b.patch) for (const r of hit) { Object.assign(r, b.patch); writes.push({ table, patch: { ...b.patch } }); }
      const data = b.cols === undefined ? null : b.one ? (hit[0] ? { ...hit[0] } : null) : hit.map(r => ({ ...r }));
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    },
  };
  return b;
}
const db = { from: (table: string) => builder(table) };

const output = ts.transpileModule(readFileSync("app/users/actions.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const actions: Record<string, (fd: FormData) => Promise<void>> = {};
new Function("require", "exports", output)((name: string) => {
  if (name === "@/lib/agency-management") return { guardDashboardAction };
  if (name === "@/lib/dashboard-access") return dashboardAccess;
  if (name === "@/lib/fan-credits") return fanCredits;
  if (name === "@/lib/supabase") return { supabaseAdmin: db };
  if (name === "next/cache") return { revalidatePath() {} };
  throw new Error("Unexpected action import: " + name);
}, actions);

const unblock = () => { const fd = new FormData(); fd.set("userId", FAN); fd.set("blocked", "false"); return fd; };

test("control: admin unblock of a minor-flagged fan writes blocked:false (documented design)", async () => {
  row = minorBlock(); writes.length = 0;
  await withDashboardAccess(null, () => actions.setBlocked(unblock()));
  assert.deepEqual(writes, [{ table: "users", patch: { blocked: false } }]);
});

// TEST-CHANGE (G36c): the control seeded blocked_reason "operator", a state the dashboard never created, which hid that
// a dashboard block was admin-only to lift. It now blocks through setBlocked first, as the same agency manager.
test("control: agency manager blocks a fan, then his unblock writes blocked:false", async () => {
  row = { ...noReasonBlock(), blocked: false }; writes.length = 0;
  const block = new FormData(); block.set("userId", FAN); block.set("blocked", "true");
  await withDashboardAccess(manager, () => actions.setBlocked(block));
  assert.equal(row.blocked_reason, "operator");
  writes.length = 0;
  await withDashboardAccess(manager, () => actions.setBlocked(unblock()));
  // TEST-CHANGE (G36c r1 F2): the agency unblock also clears its operator stamp, in the same conditional update.
  assert.deepEqual(writes, [{ table: "users", patch: { blocked: false, blocked_reason: null, blocked_at: null } }]);
});

test("agency manager cannot lift a minor safety block", async () => {
  row = minorBlock(); writes.length = 0;
  const outcome = await withDashboardAccess(manager, () => actions.setBlocked(unblock())).then(() => "resolved", (e: Error) => `rejected: ${e.message}`);
  assert.deepEqual(writes, [], `agency manager lifted a minor safety block: wrote ${JSON.stringify(writes)} (outcome ${outcome})`);
  assert.match(outcome, /^rejected/, "agency unblock of a minor-flagged fan must reject");
});

test("agency manager cannot lift a us_location safety block", async () => {
  row = usBlock(); writes.length = 0;
  const outcome = await withDashboardAccess(manager, () => actions.setBlocked(unblock())).then(() => "resolved", (e: Error) => `rejected: ${e.message}`);
  assert.deepEqual(writes, [], `agency manager lifted a us_location safety block: wrote ${JSON.stringify(writes)} (outcome ${outcome})`);
  assert.match(outcome, /^rejected/, "agency unblock of a us_location-blocked fan must reject");
});

for (const value of [null, "", "no", "False"]) {
  test(`blocked=${JSON.stringify(value)} is refused, never read as unblock`, async () => {
    row = minorBlock(); writes.length = 0;
    const fd = new FormData(); fd.set("userId", FAN); if (value !== null) fd.set("blocked", value);
    const outcome = await withDashboardAccess(null, () => actions.setBlocked(fd)).then(() => "resolved", (e: Error) => `rejected: ${e.message}`);
    assert.deepEqual(writes, [], `blocked=${JSON.stringify(value)} wrote ${JSON.stringify(writes)}`);
    assert.match(outcome, /^rejected/);
  });
}

test("agency manager cannot lift a block with no recorded reason (admin-only)", async () => {
  row = noReasonBlock(); writes.length = 0;
  const outcome = await withDashboardAccess(manager, () => actions.setBlocked(unblock())).then(() => "resolved", (e: Error) => `rejected: ${e.message}`);
  assert.deepEqual(writes, [], `agency manager lifted a reason-less block: wrote ${JSON.stringify(writes)} (outcome ${outcome})`);
  assert.match(outcome, /^rejected/);
  assert.equal(row.blocked, true);
});

test("a safety block landing between the last read and the write is not lifted (conditional update)", async () => {
  row = plainBlock(); writes.length = 0;
  raceBeforeWrite = { blocked_reason: "minor", minor_flagged_at: "2026-11-01T00:00:00Z" };
  const outcome = await withDashboardAccess(manager, () => actions.setBlocked(unblock())).then(() => "resolved", (e: Error) => `rejected: ${e.message}`);
  raceBeforeWrite = null;
  assert.deepEqual(writes, [], `the unblock landed on a fan flagged after the check: wrote ${JSON.stringify(writes)} (outcome ${outcome})`);
  assert.equal(row.blocked, true, "fan is no longer blocked");
  assert.match(outcome, /^rejected/, "0 rows updated must reject");
});

test("/users shows the unblock control as admin-only for every block the server refuses to agency managers", () => {
  const page = readFileSync("app/users/page.tsx", "utf8");
  const m = page.match(/<MutationForm adminOnly=\{([^}]*)\}\s+action=\{setBlocked\}>/);
  assert.ok(m, "unblock form found");
  assert.doesNotMatch(m[1], /blocked_reason != null/, "a block with no recorded reason is admin-only on the server, so the UI must not offer it to agency managers");
  assert.match(m[1], /selected\.blocked_reason !== "operator"/);
});
