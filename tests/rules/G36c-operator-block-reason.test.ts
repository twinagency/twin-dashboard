// G36c (batch review 3): setBlocked(true) wrote only `blocked`, while a non-admin unblock needs blocked_reason
// "operator" (G36). So every dashboard-made block was admin-only to unblock: agency managers had a block switch with
// no way back (dead switch). A dashboard block now records reason "operator" + blocked_at, but only on a fan it
// actually flipped, and only where no reason and no minor flag are recorded: a safety reason is never overwritten and a
// legacy reason-less block stays admin-only. The block write lands first and its failure rejects.
// Harness: tests/rules/G27-harness.ts (real actions, real supabase-js, fake PostgREST on the wire); the fake below
// applies eq/is/in filters to GET and PATCH like PostgREST, so a conditional update that no longer matches writes nothing.
import { inServerAction, startFakePostgrest, type WireCall } from "./G27-harness";
import assert from "node:assert/strict";
import test from "node:test";
import { setBlocked } from "../../app/users/actions";
import { withDashboardAccess } from "../../lib/dashboard-access";
import { TOP_ONLYFANS_AGENCY } from "../../lib/partner-portals";

const CLONE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FAN = "11111111-1111-4111-8111-111111111111";
const manager = { ...TOP_ONLYFANS_AGENCY, cloneIds: [CLONE], canManage: true };
type Row = Record<string, unknown>;
const fan = (over: Row = {}): Row => ({
  id: FAN, clone_id: CLONE, telegram_id: 4242, paused: false,
  blocked: false, blocked_reason: null, blocked_at: null, minor_flagged_at: null, ...over,
});

let pg!: Awaited<ReturnType<typeof startFakePostgrest>>;
let row: Row;
let failBlockWrite = false;
test.before(async () => { pg = await startFakePostgrest(); });
test.after(() => pg.close());

// Top-level comma split of a PostgREST logic list: "a.eq.1,or(b.is.null,b.eq.x)" -> ["a.eq.1", "or(b.is.null,b.eq.x)"].
function split(list: string): string[] {
  const out: string[] = []; let depth = 0, cur = "";
  for (const ch of list) {
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; continue; }
    if (ch === "(") depth++; else if (ch === ")") depth--;
    cur += ch;
  }
  return cur ? [...out, cur] : out;
}
function cond(r: Row, key: string, expr: string): boolean {
  if (key === "and" || key === "or") {
    const parts = split(expr.replace(/^\(|\)$/g, "")).map((p) => {
      const m = p.match(/^(and|or)(\(.*\))$/);
      if (m) return cond(r, m[1], m[2]);
      const [col, ...rest] = p.split(".");
      return cond(r, col, rest.join("."));
    });
    return key === "and" ? parts.every(Boolean) : parts.some(Boolean);
  }
  const [op, ...rest] = expr.split(".");
  const v = rest.join(".");
  if (op === "eq") return r[key] !== null && String(r[key]) === v;
  if (op === "is" && v === "null") return r[key] === null;
  if (op === "in") return v.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/"/g, "")).includes(String(r[key]));
  throw new Error(`fake PostgREST: unsupported filter ${key}=${expr}`);
}
const matches = (r: Row, q: URLSearchParams) =>
  [...q].filter(([k]) => !["select", "columns", "limit", "order"].includes(k)).every(([k, e]) => cond(r, k, e));
function serve(c: WireCall) {
  // The agency response path reads the viewer's cut terms; none recorded (as W4-payments-paging serves them).
  if (c.method === "GET" && ["platform_cuts", "agency_creators", "agency_creator_cuts"].some((t) => c.path === `/rest/v1/${t}`)) return { status: 200, body: [] };
  if (c.path !== "/rest/v1/users" || !["GET", "PATCH"].includes(c.method)) return { status: 400, body: { message: `fake PostgREST: unexpected ${c.method} ${c.path}` } };
  let hit: Row[];
  try { hit = matches(row, c.query) ? [row] : []; } catch (e) { return { status: 400, body: { message: (e as Error).message } }; }
  if (c.method === "PATCH") {
    if (failBlockWrite && "blocked" in c.body) return { status: 500, body: { message: "block write failed", code: "XX000" } };
    for (const r of hit) Object.assign(r, c.body);
  }
  return { status: 200, body: hit.map((r) => ({ ...r })) };
}

async function submit(who: typeof manager | null, blocked: "true" | "false") {
  pg.reset();
  pg.respond(serve);
  const fd = new FormData();
  fd.set("userId", FAN);
  fd.set("blocked", blocked);
  return inServerAction(() => withDashboardAccess(who, () => setBlocked(fd))).then(() => "resolved", (e: Error) => `rejected: ${e.message}`);
}

test("agency manager blocks a fan, then unblocks him (the dashboard block is an operator block)", async () => {
  row = fan();
  assert.equal(await submit(manager, "true"), "resolved");
  assert.equal(row.blocked, true);
  assert.equal(row.blocked_reason, "operator", "a dashboard block must record reason operator");
  assert.ok(typeof row.blocked_at === "string" && !Number.isNaN(Date.parse(row.blocked_at)), "blocked_at recorded");
  assert.equal(await submit(manager, "false"), "resolved", "agency manager could not lift his own block");
  assert.equal(row.blocked, false);
});

for (const [label, over] of [
  ["a minor-flagged fan", { blocked_reason: "minor", minor_flagged_at: "2026-11-01T00:00:00Z" }],
  ["a minor-flagged fan with no recorded reason", { minor_flagged_at: "2026-11-01T00:00:00Z" }],
  ["a us_location fan", { blocked_reason: "us_location" }],
] as const) {
  for (const already of [false, true]) {
    test(`blocking ${label} (${already ? "already blocked, stale form" : "admin had lifted the block"}) keeps the safety reason and stays admin-only`, async () => {
      row = fan({ ...over, blocked: already, blocked_at: already ? "2026-11-01T00:00:00Z" : null });
      assert.equal(await submit(manager, "true"), "resolved");
      assert.equal(row.blocked, true);
      assert.equal(row.blocked_reason, over.blocked_reason ?? null, "a safety reason was overwritten");
      assert.equal(row.minor_flagged_at, over.minor_flagged_at ?? null);
      assert.match(await submit(manager, "false"), /^rejected/, "agency manager lifted a safety block");
      assert.equal(row.blocked, true);
    });
  }
}

test("a stale block of a legacy reason-less block leaves it reason-less, so still admin-only", async () => {
  row = fan({ blocked: true });
  assert.equal(await submit(manager, "true"), "resolved");
  assert.equal(row.blocked_reason, null, "a legacy block was turned into an agency-liftable operator block");
  assert.match(await submit(manager, "false"), /^rejected/);
  assert.equal(row.blocked, true);
});

test("a failed block write rejects, never reports success", async () => {
  row = fan();
  failBlockWrite = true;
  try {
    assert.match(await submit(null, "true"), /^rejected/);
    assert.match(await submit(manager, "true"), /^rejected/);
  } finally { failBlockWrite = false; }
  assert.equal(row.blocked, false);
});
