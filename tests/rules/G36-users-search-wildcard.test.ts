// G36 regression guard (was KNOWN RED W7 app-users F4, bug/load; promoted from fix-sweep
// tests/known-red/W7-app-users-search-wildcard.test.ts). A fan search for `_` or `%` used to reach PostgREST ILIKE as a
// wildcard, matching every fan, while in-memory fanMatches matched literally and rejected them, so the refill loop
// read the whole users table 100 rows at a time. Now app/users/page.tsx escapes `\ % _` so DB and memory agree.
// Bound: ceil(FAN_MAX/FAN_PAGE)+1 = 11 list reads over 5000 fans. Control: q="zz" costs at most 2.
// Harness: page.tsx transpiled (react-jsx) and FansPage awaited with stubbed components; a fake `@/lib/supabase`
// emulates PostgREST `.or(...ilike...)` (ILIKE semantics), order and range over 5000 fans; no rendering, no network.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import * as jsxRuntime from "react/jsx-runtime";
import * as liveTelegramModel from "../../lib/live-telegram-model";
import * as chatHistoryWindow from "../../lib/chat-history-window";
import * as starDedupe from "../../lib/star-dedupe";
import * as fanDossier from "../../lib/fan-dossier";
import * as flowLabels from "../../lib/flow-labels";
import * as drip from "../../lib/drip";
import * as money from "../../lib/money";
import * as selectAll from "../../lib/select-all";

const FANS = Array.from({ length: 5000 }, (_, i) => {
  const n = String(i + 1).padStart(4, "0");
  return {
    id: `00000000-0000-4000-8000-00000000${n}`, clone_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", telegram_id: 100000 + i,
    name: `fan${n}`, stated_name: null, username: `fan${n}`, business_connection_id: null,
    last_message_received: new Date(Date.UTC(2026, 10, 1) + i * 60_000).toISOString(), first_seen_at: "2026-10-01T00:00:00.000Z",
    blocked: false, paused: false, purchase_count: 0, total_spent_stars: 0, message_credits: 0, total_messages_sent: 1,
  };
});

// PostgREST ILIKE: `*` (PostgREST alias) and `%` match any run, `_` one char, backslash escapes; case-insensitive.
const compiled = new Map<string, RegExp>();
function ilike(value: unknown, pattern: string): boolean {
  if (typeof value !== "string") return false;
  const cached = compiled.get(pattern);
  if (cached) return cached.test(value);
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "\\" && i + 1 < pattern.length) re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    else if (c === "*" || c === "%") re += ".*";
    else if (c === "_") re += ".";
    else re += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  const regex = new RegExp(`^${re}$`, "is");
  compiled.set(pattern, regex);
  return regex.test(value);
}
function orClause(row: Record<string, unknown>, clause: string): boolean {
  const [col, op] = clause.split(".", 2);
  const value = clause.slice(col.length + op.length + 2);
  if (op === "ilike") return ilike(row[col], value);
  if (op === "eq") return String(row[col]) === value;
  throw new Error("fake PostgREST: unsupported or-op " + op);
}

let listReads = 0;
function builder(table: string) {
  const b: any = {
    filters: [] as ((r: Record<string, unknown>) => boolean)[], orders: [] as [string, boolean][],
    select(_cols: string, opts?: { head?: boolean }) { b.head = !!opts?.head; return b; },
    or(expr: string) { const clauses = expr.split(","); b.filters.push((r: Record<string, unknown>) => clauses.some(c => orClause(r, c))); return b; },
    eq(k: string, v: unknown) { b.filters.push((r: Record<string, unknown>) => String(r[k]) === String(v)); return b; },
    gte() { return b; }, gt() { return b; }, lt() { return b; }, in() { return b; }, limit() { return b; },
    order(k: string, o?: { ascending?: boolean }) { b.orders.push([k, !!o?.ascending]); return b; },
    range(from: number, to: number) { b.range = [from, to]; return b; },
    maybeSingle() { b.single = true; return b; },
    then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) {
      let out: unknown = { data: [], error: null };
      if (b.head) out = { data: null, count: 0, error: null };
      else if (table === "users") {
        listReads++;
        let rows = FANS.filter(r => b.filters.every((f: (r: Record<string, unknown>) => boolean) => f(r)));
        rows = [...rows].sort((x: any, y: any) => {
          for (const [k, asc] of b.orders) { const c = x[k] < y[k] ? -1 : x[k] > y[k] ? 1 : 0; if (c) return asc ? c : -c; }
          return 0;
        });
        if (b.range) rows = rows.slice(b.range[0], b.range[1] + 1);
        out = { data: b.single ? rows[0] ?? null : rows, error: null };
      }
      return Promise.resolve(out).then(resolve, reject);
    },
  };
  return b;
}
const db = { from: (table: string) => builder(table) };

const real: Record<string, unknown> = {
  "react/jsx-runtime": jsxRuntime, "@/lib/live-telegram-model": liveTelegramModel, "@/lib/chat-history-window": chatHistoryWindow,
  "@/lib/star-dedupe": starDedupe, "@/lib/fan-dossier": fanDossier, "@/lib/flow-labels": flowLabels, "@/lib/drip": drip,
  "@/lib/money": money, "@/lib/select-all": selectAll,
};
const component = new Proxy({}, { get: (_t, key) => (key === "__esModule" ? true : function Stub() { return null; }) });
const output = ts.transpileModule(readFileSync("app/users/page.tsx", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const page: Record<string, any> = {};
new Function("require", "exports", output)((name: string) => {
  if (name in real) return real[name];
  if (name === "@/lib/supabase") return { supabaseAdmin: db };
  if (name === "@/lib/clone-scope") return { getCloneScope: async () => null };
  if (name === "@/lib/live-telegram") return {
    loadV2Fans: async () => ({ fans: [], originals: new Map(), unavailable: [] }),
    loadTelegramHistory: async () => ({ rows: [], hasMore: false, combined: false, unavailable: false }),
  };
  if (name === "next/navigation") return { redirect() { throw new Error("unexpected redirect"); } };
  if (name === "./actions") return component;
  if (name.startsWith("@/components/") || name === "lucide-react") return component;
  throw new Error("Unexpected page import: " + name);
}, page);

async function readsFor(q: string): Promise<number> {
  listReads = 0;
  await page.default({ searchParams: Promise.resolve({ q }) });
  return listReads;
}

test("control: a no-match search without wildcards costs at most 2 users list reads", async () => {
  const reads = await readsFor("zz");
  assert.ok(reads <= 2, `q="zz" made ${reads} users list reads`);
});

// ceil(FAN_MAX / FAN_PAGE) + 1 (page.tsx:221, :227): the most a capped refill loop needs for one screen.
const BOUNDED_READS = Math.ceil(1000 / 100) + 1;
for (const q of ["_", "%"]) {
  test(`a search for a literal ${q} does not scan the whole users table`, async () => {
    const reads = await readsFor(q);
    assert.ok(reads <= BOUNDED_READS, `q="${q}" made ${reads} users list reads over ${FANS.length} fans, bound ${BOUNDED_READS} (DB ILIKE "${q}" matched every row, memory rejected them all)`);
  });
}
