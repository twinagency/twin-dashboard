// G36 regression guard (was KNOWN RED W7 app-users F3, data-risk; promoted from fix-sweep
// tests/known-red/W7-app-users-delete-wipe.test.ts). deleteUser used to ignore the chat_history delete error and
// delete the user row anyway, and keyed the history delete by hidden form fields, so a stale form erased another
// fan's transcript. Now it reads clone_id,telegram_id by userId, deletes history first, and a history error rejects
// with the user row kept. KNOWN LIMIT (todo, not a pass): a users delete that fails AFTER history is gone still loses
// the history; only a transactional RPC (bot migration) fixes that, out of G36 scope.
// Harness: actions.ts transpiled with a fake `@/lib/supabase` (in-memory tables); admin caller via the real guard.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { guardDashboardAction } from "../../lib/agency-management";
import * as dashboardAccess from "../../lib/dashboard-access";
const { withDashboardAccess } = dashboardAccess;

const FAN = "11111111-1111-4111-8111-111111111111";
const OTHER_FAN = "22222222-2222-4222-8222-222222222222";
const CLONE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_CLONE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type Rec = Record<string, unknown>;
let store: Record<"users" | "chat_history", Rec[]>;
let failDelete: Partial<Record<string, { message: string }>>;
function reset() {
  failDelete = {};
  store = {
    users: [
      { id: FAN, clone_id: CLONE, telegram_id: 4242, paused: false },
      { id: OTHER_FAN, clone_id: OTHER_CLONE, telegram_id: 9999, paused: false },
    ],
    chat_history: [
      { id: 1, clone_id: CLONE, telegram_id: 4242, content: "hi" },
      { id: 2, clone_id: CLONE, telegram_id: 4242, content: "hello" },
      { id: 3, clone_id: OTHER_CLONE, telegram_id: 9999, content: "other fan" },
    ],
  };
}
const matches = (r: Rec, eqs: Record<string, string>) => Object.entries(eqs).every(([k, v]) => String(r[k]) === v);

function builder(table: "users" | "chat_history") {
  const b: any = {
    eqs: {} as Record<string, string>,
    select(cols: string) { b.cols = cols; return b; },
    delete() { b.del = true; return b; },
    eq(key: string, value: unknown) { b.eqs[key] = String(value); return b; },
    maybeSingle() { b.single = true; return b; },
    single() { b.single = true; return b; },
    then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) {
      let out: unknown = { data: null, error: null };
      if (b.del) {
        if (failDelete[table]) out = { data: null, error: failDelete[table] };
        else store[table] = store[table].filter(r => !matches(r, b.eqs));
      } else if (b.cols !== undefined) {
        const hit = store[table].filter(r => matches(r, b.eqs)).map(r => ({ ...r }));
        out = { data: b.single ? hit[0] ?? null : hit, error: null };
      }
      return Promise.resolve(out).then(resolve, reject);
    },
  };
  return b;
}
const db = { from: (table: "users" | "chat_history") => builder(table) };

const output = ts.transpileModule(readFileSync("app/users/actions.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const actions: Record<string, (fd: FormData) => Promise<void>> = {};
new Function("require", "exports", output)((name: string) => {
  if (name === "@/lib/agency-management") return { guardDashboardAction };
  if (name === "@/lib/dashboard-access") return dashboardAccess;
  if (name === "@/lib/supabase") return { supabaseAdmin: db };
  if (name === "next/cache") return { revalidatePath() {} };
  throw new Error("Unexpected action import: " + name);
}, actions);

const form = (cloneId: string, telegramId: string) => {
  const fd = new FormData(); fd.set("userId", FAN); fd.set("cloneId", cloneId); fd.set("telegramId", telegramId); return fd;
};
const run = (fd: FormData) => withDashboardAccess(null, () => actions.deleteUser(fd)).then(() => "resolved", (e: Error) => `rejected: ${e.message}`);
const historyOf = (cloneId: string, telegramId: number) => store.chat_history.filter(r => r.clone_id === cloneId && r.telegram_id === telegramId).length;
const userExists = (id: string) => store.users.some(r => r.id === id);

test("control: matching form wipes the fan's history and user row, other fan untouched", async () => {
  reset();
  assert.equal(await run(form(CLONE, "4242")), "resolved");
  assert.equal(historyOf(CLONE, 4242), 0, "fan's chat_history survived the wipe");
  assert.equal(userExists(FAN), false, "fan's users row survived the wipe");
  assert.equal(historyOf(OTHER_CLONE, 9999), 1, "other fan's chat_history was touched");
  assert.equal(userExists(OTHER_FAN), true, "other fan's users row was touched");
});

test("a failed chat_history delete fails the wipe and keeps the user row", async () => {
  reset(); failDelete.chat_history = { message: "boom" };
  const outcome = await run(form(CLONE, "4242"));
  assert.match(outcome, /^rejected/, `chat_history delete error was ignored: deleteUser ${outcome}, user row exists=${userExists(FAN)}`);
  assert.equal(userExists(FAN), true, "user row deleted although its chat_history survived");
});

// TEST-CHANGE: todo, not removed. Two PostgREST deletes cannot be atomic; this goes green only with a transactional
// RPC (bot migration + db.rpc in this fake). History-first ordering was chosen so the other failure keeps the user row.
test("a failed users delete fails the wipe and keeps the fan's chat_history", { todo: "needs a transactional delete RPC (bot migration)" }, async () => {
  reset(); failDelete.users = { message: "boom" };
  const outcome = await run(form(CLONE, "4242"));
  assert.match(outcome, /^rejected/, `users delete error was ignored: deleteUser ${outcome}`);
  assert.equal(historyOf(CLONE, 4242), 2, `fan's chat_history erased although the user row delete failed (${historyOf(CLONE, 4242)} of 2 rows left)`);
});

test("chat_history delete is keyed by the deleted row, not the form", async () => {
  reset();
  await run(form(OTHER_CLONE, "9999"));
  assert.equal(historyOf(OTHER_CLONE, 9999), 1, "stale form erased ANOTHER fan's transcript (keyed by form fields, not the users row)");
  assert.equal(historyOf(CLONE, 4242), 0, "the deleted fan's own chat_history survived");
});
