// G36 r1 regression guard (Flash blocker, #409). The legacy fan page app/clones/[id]/fans/[userId] kept its own
// setCredits (Math.max/Math.floor coercion: blank = 0 wipes the balance) and deleteUser (ignored the chat_history
// error and keyed it by hidden form fields, so a stale form erased another fan's transcript). Now both delegate to
// the canonical app/users/actions.ts handlers. The page also read the users row without checking it belongs to the
// clone in the URL; a mismatch is now notFound().
// Harness: both action files transpiled; the canonical one is what "@/app/users/actions" resolves to. A fake
// `@/lib/supabase` keeps in-memory users + chat_history; admin caller via the real guard. No network.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import * as jsxRuntime from "react/jsx-runtime";
import { guardDashboardAction } from "../../lib/agency-management";
import * as dashboardAccess from "../../lib/dashboard-access";
import * as fanCredits from "../../lib/fan-credits";
import * as starDedupe from "../../lib/star-dedupe";
import * as money from "../../lib/money";
const { withDashboardAccess } = dashboardAccess;

const FAN = "11111111-1111-4111-8111-111111111111";
const OTHER_FAN = "22222222-2222-4222-8222-222222222222";
const CLONE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_CLONE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
type Rec = Record<string, unknown>;
let store: Record<string, Rec[]>;
let failDelete: Record<string, { message: string } | undefined>;
function reset() {
  failDelete = {};
  store = {
    users: [
      { id: FAN, clone_id: CLONE, telegram_id: 4242, message_credits: 5, name: "Sam" },
      { id: OTHER_FAN, clone_id: OTHER_CLONE, telegram_id: 9999, message_credits: 5, name: "Other" },
    ],
    chat_history: [
      { id: 1, clone_id: CLONE, telegram_id: 4242 },
      { id: 2, clone_id: OTHER_CLONE, telegram_id: 9999 },
    ],
    clones: [{ id: CLONE, name: "Clone A" }, { id: OTHER_CLONE, name: "Clone B" }],
  };
}
const matches = (r: Rec, eqs: Record<string, string>) => Object.entries(eqs).every(([k, v]) => String(r[k]) === v);
function builder(table: string) {
  const b: any = {
    eqs: {} as Record<string, string>,
    select(cols: string) { b.cols = cols; return b; },
    update(patch: Rec) { b.patch = patch; return b; },
    delete() { b.del = true; return b; },
    eq(k: string, v: unknown) { b.eqs[k] = String(v); return b; },
    order() { return b; }, limit() { return b; },
    maybeSingle() { b.single = true; return b; },
    then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) {
      const rows = (store[table] ??= []);
      let out: unknown = { data: null, error: null };
      if (b.del) {
        if (failDelete[table]) out = { data: null, error: failDelete[table] };
        else store[table] = rows.filter(r => !matches(r, b.eqs));
      } else if (b.patch) {
        for (const r of rows) if (matches(r, b.eqs)) Object.assign(r, JSON.parse(JSON.stringify(b.patch)));
      } else if (b.cols !== undefined) {
        const hit = rows.filter(r => matches(r, b.eqs)).map(r => ({ ...r }));
        out = { data: b.single ? hit[0] ?? null : hit, error: null };
      }
      return Promise.resolve(out).then(resolve, reject);
    },
  };
  return b;
}
const db = { from: (table: string) => builder(table) };

const NOT_FOUND = new Error("NEXT_NOT_FOUND");
const redirects: string[] = [];
const transpile = (path: string) => ts.transpileModule(readFileSync(path, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const component = new Proxy({}, { get: (_t, key) => (key === "__esModule" ? true : function Stub() { return null; }) });
const canonical: Record<string, (fd: FormData) => Promise<void>> = {};
const legacy: Record<string, (fd: FormData) => Promise<void>> = {};
const page: Record<string, any> = {};
const load = (path: string, exportsObj: object) => new Function("require", "exports", transpile(path))((name: string) => {
  if (name === "@/lib/agency-management") return { guardDashboardAction };
  if (name === "@/lib/dashboard-access") return dashboardAccess;
  if (name === "@/lib/fan-credits") return fanCredits;
  if (name === "@/lib/supabase") return { supabaseAdmin: db };
  if (name === "@/lib/star-dedupe") return starDedupe;
  if (name === "@/lib/money") return money;
  if (name === "react/jsx-runtime") return jsxRuntime;
  if (name === "next/cache") return { revalidatePath() {} };
  if (name === "next/navigation") return { redirect(to: string) { redirects.push(to); }, notFound() { throw NOT_FOUND; } };
  if (name === "@/app/users/actions") return canonical;
  if (name === "./actions") return legacy;
  if (name.startsWith("@/components/") || name === "next/link") return component;
  throw new Error(`Unexpected import in ${path}: ${name}`);
}, exportsObj);
load("app/users/actions.ts", canonical);
load("app/clones/[id]/fans/[userId]/actions.ts", legacy);
load("app/clones/[id]/fans/[userId]/page.tsx", page);

const admin = <T>(fn: () => Promise<T>) => withDashboardAccess(null, fn).then(() => "resolved", (e: Error) => `rejected: ${e.message}`);
const fd = (fields: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.set(k, v); return f; };
const credits = () => store.users.find(r => r.id === FAN)?.message_credits;

test("control: legacy setCredits 7 writes 7", async () => {
  reset();
  assert.equal(await admin(() => legacy.setCredits(fd({ userId: FAN, cloneId: CLONE, credits: "7" }))), "resolved");
  assert.equal(credits(), 7);
});

for (const value of ["", "2.5", "-3", "Infinity", "1e3", "1000001"]) {
  test(`legacy setCredits ${JSON.stringify(value)} is refused, balance kept`, async () => {
    reset();
    const outcome = await admin(() => legacy.setCredits(fd({ userId: FAN, cloneId: CLONE, credits: value })));
    assert.match(outcome, /^rejected/, `legacy setCredits(${JSON.stringify(value)}) ${outcome}, balance now ${credits()}`);
    assert.equal(credits(), 5);
  });
}

test("legacy deleteUser keys history by the users row, not a stale form", async () => {
  reset();
  assert.equal(await admin(() => legacy.deleteUser(fd({ userId: FAN, cloneId: OTHER_CLONE, telegramId: "9999" }))), "resolved");
  assert.equal(store.chat_history.filter(r => r.clone_id === OTHER_CLONE).length, 1, "stale legacy form erased ANOTHER fan's transcript");
  assert.equal(store.chat_history.filter(r => r.clone_id === CLONE).length, 0, "the deleted fan's own history survived");
  assert.equal(store.users.some(r => r.id === FAN), false);
});

test("legacy deleteUser: a failed history delete rejects and keeps the user row", async () => {
  reset(); failDelete.chat_history = { message: "boom" };
  const outcome = await admin(() => legacy.deleteUser(fd({ userId: FAN, cloneId: CLONE, telegramId: "4242" })));
  assert.match(outcome, /^rejected/, `legacy deleteUser ignored the chat_history error: ${outcome}`);
  assert.equal(store.users.some(r => r.id === FAN), true, "user row deleted although its chat_history survived");
});

test("control: legacy page renders a fan under its own clone", async () => {
  reset();
  await page.default({ params: Promise.resolve({ id: CLONE, userId: FAN }) });
});

test("legacy page is notFound for a fan of a different clone than the URL", async () => {
  reset();
  const outcome = await Promise.resolve(page.default({ params: Promise.resolve({ id: OTHER_CLONE, userId: FAN }) }))
    .then(() => "rendered", (e: Error) => (e === NOT_FOUND ? "notFound" : `threw: ${e.message}`));
  assert.equal(outcome, "notFound", "legacy page rendered a fan under another clone's URL (and that clone's chat_history)");
});
