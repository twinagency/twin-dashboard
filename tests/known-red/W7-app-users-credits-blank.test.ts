/**
 * Known red (W7 app-users F2, data-risk/money): `setCredits` (app/users/actions.ts:14) coerces instead of validating:
 * `Math.max(0, Math.floor(Number(credits) || 0))` turns a blank box into 0 and `Infinity` into a value JSON sends as
 * `null`, floors `2.5` to 2 and clamps `-3` to 0. The inline credits form has no confirm and no `required`, so clearing the box and pressing Enter wipes the
 * fan's balance. Control: "7" writes {message_credits:7}. Turns green when setCredits requires a safe integer in range
 * and throws (writing nothing) otherwise.
 * Harness: actions.ts transpiled and run with a fake `@/lib/supabase` (recording builder) and the real guard (admin).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { guardDashboardAction } from "../../lib/agency-management";
import * as dashboardAccess from "../../lib/dashboard-access";
const { withDashboardAccess } = dashboardAccess;

const FAN = "11111111-1111-4111-8111-111111111111";
const writes: { table: string; patch: Record<string, unknown> }[] = [];

function builder(table: string) {
  const b: any = {
    update(patch: Record<string, unknown>) { b.patch = patch; return b; },
    eq() { return b; },
    then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) {
      if (b.patch) writes.push({ table, patch: JSON.parse(JSON.stringify(b.patch)) }); // wire shape, like PostgREST gets it
      return Promise.resolve({ data: null, error: null }).then(resolve, reject);
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
  if (name === "@/lib/supabase") return { supabaseAdmin: db };
  if (name === "next/cache") return { revalidatePath() {} };
  throw new Error("Unexpected action import: " + name);
}, actions);

const form = (credits: string) => { const fd = new FormData(); fd.set("userId", FAN); fd.set("credits", credits); return fd; };
const admin = <T>(fn: () => T) => withDashboardAccess(null, fn);

test("control: credits=7 writes message_credits 7", async () => {
  writes.length = 0;
  await admin(() => actions.setCredits(form("7")));
  assert.deepEqual(writes, [{ table: "users", patch: { message_credits: 7 } }]);
});

test("a blank credits box is refused, not written as 0", async () => {
  writes.length = 0;
  const outcome = await admin(() => actions.setCredits(form(""))).then(() => "resolved", () => "rejected");
  assert.deepEqual(writes, [], `blank credits wrote ${JSON.stringify(writes)} (balance wiped to 0)`);
  assert.equal(outcome, "rejected", "blank credits must reject");
});

test("credits=Infinity is refused, not written", async () => {
  writes.length = 0;
  const outcome = await admin(() => actions.setCredits(form("Infinity"))).then(() => "resolved", () => "rejected");
  assert.deepEqual(writes, [], `Infinity credits wrote ${JSON.stringify(writes)}`);
  assert.equal(outcome, "rejected", "Infinity credits must reject");
});

for (const value of ["2.5", "-3"]) {
  test(`credits=${value} is refused, not floored or clamped`, async () => {
    writes.length = 0;
    const outcome = await admin(() => actions.setCredits(form(value))).then(() => "resolved", () => "rejected");
    assert.deepEqual(writes, [], `credits=${value} wrote ${JSON.stringify(writes)}`);
    assert.equal(outcome, "rejected", `credits=${value} must reject`);
  });
}
