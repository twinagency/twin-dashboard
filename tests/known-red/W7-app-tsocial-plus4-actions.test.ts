// KNOWN RED (W7 lane app-tsocial-plus4, docs/review/W7/app-tsocial-plus4.md findings 1-4). Team's Claude owns the fixes.
// Finding 1 (high, money/entitlement): setAccountPlan (app/tsocial/actions.ts:84-90) writes plan + plan_until:null with no
//   check of the plan the operator saw and no confirmation. "Set free" (Controls.tsx:63-64) on a paid account, or a stale
//   free->staff pick on an account that has since paid, wipes the buyer's paid plan and its expiry in one click.
// Finding 2 (high, false success): approvePost/rejectPost (actions.ts:35,45) guard on status=review but only check `error`.
//   A guarded PATCH that matches 0 rows returns 204 with no error, so a second admin's Reject on a post another admin
//   already approved resolves OK, the queue item disappears on revalidate, and the post stays live.
// Finding 3 (high, evidence loss): dismissReports (actions.ts:64) hard-deletes every report on the item, including ones
//   filed after the operator loaded the page. The page already has the reviewed report ids (lib/tsocial.ts groupReports
//   reportIds) but never passes them. Test passes the reviewed ids as a third argument (cast: a fix must accept them).
// Finding 4 (high, brake overwrite): saveSetting (actions.ts:93-101) upserts the whole value with no check against what
//   the operator saw. Two triggers: the settings read failed (page.tsx:77,162 ignore the error, so every field starts
//   blank) or another admin saved meanwhile. Either way adding one domain replaces the live blocked_domains list (a
//   brake, not in MONEY_KEYS, so no confirm). Test passes the value the operator saw as a fourth argument (cast).
// Faked at the wire: a stateful fake PostgREST on its own 127.0.0.1 port (never the running stack). Only next/cache and
// lib/auth (cookie session) are module-mocked. Run:
//   node --experimental-test-module-mocks --import tsx --test tests/known-red/W7-app-tsocial-plus4-actions.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import test, { mock } from "node:test";
import { withModuleMocks } from "../support/module-mocks-rerun";

// W7 close: init.sh runs plain `node --import tsx --test`; without module mocks this re-runs the file with the flag.
if (withModuleMocks(import.meta.url, { controls: 4, rest: 4 })) {

type Row = Record<string, unknown>;
// A refusal by the action is fine; a harness or runtime failure must not pass as one.
const refused = (p: Promise<unknown>) => p.catch((e: unknown) => {
  if (!(e instanceof Error) || e instanceof TypeError || e instanceof ReferenceError || /fetch failed|ECONNREFUSED|Cannot find module/i.test(e.message)) throw e;
});
// The UI must send what the action needs: a server-only fix with an unwired caller stays red.
const controlsSrc = () => readFileSync(new URL("../../app/tsocial/Controls.tsx", import.meta.url), "utf8");
const tables: Record<string, Row[]> = {};
let server: Server;
let actions: typeof import("../../app/tsocial/actions");

const POST = "11111111-1111-4111-8111-111111111111";
const ACCOUNT = "22222222-2222-4222-8222-222222222222";
const FUTURE = "2099-01-01T00:00:00+00:00";

// Minimal PostgREST filter grammar used by these actions: col=eq.v, col=neq.v, col=in.(a,b), col=is.null.
function matches(row: Row, params: URLSearchParams): boolean {
  for (const [col, expr] of params) {
    if (col === "select" || col === "on_conflict") continue;
    const dot = expr.indexOf("."); const op = expr.slice(0, dot); const v = expr.slice(dot + 1);
    const cell = row[col] == null ? null : String(row[col]);
    if (op === "eq" && cell !== v) return false;
    if (op === "neq" && cell === v) return false;
    if (op === "in" && !v.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/^"|"$/g, "")).includes(cell ?? "")) return false;
    if (op === "is" && v === "null" && cell !== null) return false;
    if (!["eq", "neq", "in", "is"].includes(op)) throw new Error(`fake PostgREST: unsupported filter ${col}=${expr}`);
  }
  return true;
}

test.before(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const url = new URL(req.url!, "http://fake");
      const table = url.pathname.replace("/rest/v1/", "");
      const rows = (tables[table] ??= []);
      const hit = rows.filter((r) => matches(r, url.searchParams));
      let out = hit;
      if (req.method === "PATCH") for (const r of hit) Object.assign(r, JSON.parse(body));
      else if (req.method === "POST") { // upsert on ?on_conflict=<col>
        const key = url.searchParams.get("on_conflict") ?? "id";
        const incoming = ([] as Row[]).concat(JSON.parse(body));
        out = incoming.map((n) => { const old = rows.find((r) => r[key] === n[key]); if (old) return Object.assign(old, n); rows.push(n); return n; });
      }
      else if (req.method === "DELETE") tables[table] = rows.filter((r) => !hit.includes(r));
      else if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "POST") { res.writeHead(405); res.end(); return; }
      const prefer = String(req.headers.prefer ?? "");
      const range = out.length ? `0-${out.length - 1}/${out.length}` : "*/0";
      if (req.method === "GET" || prefer.includes("return=representation")) {
        res.writeHead(200, { "content-type": "application/json", "content-range": range });
        res.end(JSON.stringify(out));
      } else { res.writeHead(204, { "content-range": range }); res.end(); }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  process.env.SUPABASE_URL = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  process.env.SUPABASE_SERVICE_KEY = "synthetic-service-key";
  mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });
  mock.module("@/lib/auth", { namedExports: { isAuthed: async () => true } });
  actions = await import("../../app/tsocial/actions");
});
test.after(() => new Promise<void>((r) => server.close(() => r())));

const post = (status: string) => { tables.tsocial_posts = [{ id: POST, status, reject_reason: null }]; return tables.tsocial_posts[0]; };
const account = (plan: string, plan_until: string | null) => { tables.tsocial_accounts = [{ id: ACCOUNT, plan, plan_until }]; return tables.tsocial_accounts[0]; };

test("control: approve and reject move a post that is in review", async () => {
  const a = post("review");
  await actions.approvePost(POST);
  assert.equal(a.status, "live");
  const r = post("review");
  await actions.rejectPost(POST, "spam");
  assert.deepEqual([r.status, r.reject_reason], ["rejected", "spam"]);
});

test("finding 2: reject on a post another admin already approved is refused, not reported as done", async () => {
  const p = post("live"); // admin A approved it after admin B loaded the queue
  await assert.rejects(actions.rejectPost(POST, "spam"), "a reject that changed nothing must not resolve as success");
  assert.equal(p.status, "live");
});

test("control: a free account can be set to staff by hand", async () => {
  const a = account("free", null);
  await actions.setAccountPlan(ACCOUNT, "staff");
  assert.equal(a.plan, "staff");
});

test("finding 1: an unconfirmed plan change does not wipe a paid plan and its expiry", async () => {
  // "Set free" button path: setAccountPlan(id, "free") with nothing else (Controls.tsx:64).
  const paid = account("paid", FUTURE);
  await refused(actions.setAccountPlan(ACCOUNT, "free"));
  assert.deepEqual([paid.plan, paid.plan_until], ["paid", FUTURE], "one unconfirmed click must not end a plan the buyer paid for");
  // Stale page: operator loaded the row as free, the fan paid meanwhile, operator picks staff.
  const raced = account("paid", FUTURE);
  await refused(actions.setAccountPlan(ACCOUNT, "staff"));
  assert.deepEqual([raced.plan, raced.plan_until], ["paid", FUTURE], "a stale free->staff pick must not overwrite a paid plan");
});

type Loose = (...args: unknown[]) => Promise<void>;
const reports = () => {
  tables.tsocial_reports = [
    { id: 1, post_id: POST, chat_post_id: null, tg_user_id: 501, reason: "spam" }, // on screen when the operator loaded the page
    { id: 2, post_id: POST, chat_post_id: null, tg_user_id: 502, reason: "underage" }, // filed after the page loaded
  ];
};

test("control: dismiss removes the reports the operator reviewed", async () => {
  reports();
  await (actions.dismissReports as Loose)("clip", POST, [1]);
  const seen = tables.tsocial_reports.find((r) => r.id === 1);
  assert.ok(!seen || seen.dismissed_at != null, "the reviewed report is resolved");
});

test("finding 3: dismiss keeps a report filed after the page loaded", async () => {
  reports();
  await refused((actions.dismissReports as Loose)("clip", POST, [1]));
  const unseen = tables.tsocial_reports.find((r) => r.id === 2);
  assert.ok(unseen, "a report the operator never saw must not be deleted");
  assert.equal(unseen.dismissed_at ?? null, null, "a report the operator never saw must stay open");
  assert.doesNotMatch(controlsSrc(), /dismissReports\(\s*kind\s*,\s*itemId\s*\)/, "ReportControls must pass the reviewed report ids");
});

const domains = (value: string[]) => { tables.tsocial_settings = [{ key: "blocked_domains", value }]; return () => tables.tsocial_settings.find((r) => r.key === "blocked_domains")!.value; };

test("control: adding a domain to the list the operator saw saves it", async () => {
  const stored = domains(["a.com"]);
  await (actions.saveSetting as Loose)("blocked_domains", "a.com\nc.com", false, "a.com");
  assert.deepEqual(stored(), ["a.com", "c.com"]);
});

test("finding 4: a save from a stale or blank baseline does not drop live blocked domains", async () => {
  // Another admin added b.com after this operator loaded ["a.com"].
  const raced = domains(["a.com", "b.com"]);
  await refused((actions.saveSetting as Loose)("blocked_domains", "a.com\nc.com", false, "a.com"));
  assert.ok((raced() as string[]).includes("b.com"), "a domain another admin added must survive");
  // Settings read failed, so the field rendered blank; operator types one domain.
  const blank = domains(["a.com", "b.com"]);
  await refused((actions.saveSetting as Loose)("blocked_domains", "c.com", false, ""));
  assert.ok(["a.com", "b.com"].every((d) => (blank() as string[]).includes(d)), "a blank baseline must not replace the live list");
  assert.doesNotMatch(controlsSrc(), /saveSetting\(\s*settingKey\s*,\s*value\s*,\s*confirmed\s*\)/, "SettingRow must pass the value the operator saw");
});
}
