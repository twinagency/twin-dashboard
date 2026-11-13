// G29 (W5 app-catalogue-plus2 F3, money truth): the funnel never shows a capped read as the full week.
// F3: app/catalogue-funnel/page.tsx:61-66 asks `.limit(20_000)` for the week's catalogue_events, but PostgREST caps every
//     response at `max-rows` (1000 on Supabase's default, lib/select-all.ts:3-7) without an error. A busy week is rolled
//     up from the newest 1000 rows and shown as full-week totals with no warning; the oldest rows (here: the week's
//     sales) silently vanish.
// Fixed looks like: aggregate in SQL, or page with selectAllRows and show a visible "incomplete" warning when truncated.
// Offline: `@/lib/supabase` is swapped
// for an in-memory PostgREST-like builder (max-rows 1000, no error on the cap); no database is touched.
// The fake implements only `from(...)` with select/eq/neq/in/gte/gt/lte/lt/order/limit/range. `rpc` and every other
// client or builder method throw "fixture: extend this fake for the new query shape (F3 fix)". An RPC/SQL-aggregate fix
// must extend the fake with its RPC returning the aggregates of the seeded rows; the assertions stay as they are.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { after, beforeEach } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const requireHere = createRequire(import.meta.url);
const { JSDOM } = requireHere("jsdom");
Object.assign(globalThis, { React });

const MAX_ROWS = 1000; // PostgREST max-rows on Supabase's default config
type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
let requests: { table: string; returned: number }[];
class FakeQuery {
  private filters: ((row: Row) => boolean)[] = [];
  private sort: { column: string; ascending: boolean } | null = null;
  private max = Infinity;
  private window: [number, number] | null = null;
  constructor(private table: string) {}
  select(_columns?: string) { return this; }
  eq(c: string, v: unknown) { this.filters.push(r => r[c] === v); return this; }
  neq(c: string, v: unknown) { this.filters.push(r => r[c] !== v); return this; }
  in(c: string, v: unknown[]) { this.filters.push(r => v.includes(r[c])); return this; }
  gte(c: string, v: string) { this.filters.push(r => String(r[c]) >= v); return this; }
  gt(c: string, v: string) { this.filters.push(r => String(r[c]) > v); return this; }
  lte(c: string, v: string) { this.filters.push(r => String(r[c]) <= v); return this; }
  lt(c: string, v: string) { this.filters.push(r => String(r[c]) < v); return this; }
  order(column: string, opts: { ascending?: boolean } = {}) { this.sort = { column, ascending: opts.ascending ?? true }; return this; }
  limit(n: number) { this.max = n; return this; }
  range(from: number, to: number) { this.window = [from, to]; return this.run(); }
  private run() {
    let rows = (tables[this.table] ?? []).filter(r => this.filters.every(f => f(r)));
    if (this.sort) { const { column, ascending } = this.sort; rows = [...rows].sort((a, b) => (String(a[column]) < String(b[column]) ? -1 : String(a[column]) > String(b[column]) ? 1 : 0) * (ascending ? 1 : -1)); }
    if (this.window) rows = rows.slice(this.window[0], this.window[1] + 1);
    rows = rows.slice(0, Math.min(this.max, MAX_ROWS)); // the server cap: silently, no error
    requests.push({ table: this.table, returned: rows.length });
    return Promise.resolve({ data: rows, error: null });
  }
  then<T>(resolve: (v: { data: Row[]; error: null }) => T, reject?: (e: unknown) => T) { return this.run().then(resolve, reject); }
}
const UNSUPPORTED = "fixture: extend this fake for the new query shape (F3 fix)";
// Any method the fake does not implement throws instead of silently returning undefined.
function strict<T extends object>(target: T): T {
  return new Proxy(target, { get(t, prop, receiver) {
    if (typeof prop === "symbol" || prop in t) return Reflect.get(t, prop, receiver);
    return () => { throw new Error(`${UNSUPPORTED}: .${prop}()`); };
  } });
}
const fakeSupabase = strict({
  from: (table: string) => strict(new FakeQuery(table)),
  rpc: (fn: string) => { throw new Error(`${UNSUPPORTED}: rpc("${fn}")`); },
});
const Module = requireHere("node:module");
const originalLoad = Module._load;
Module._load = function (request: string, ...rest: unknown[]) {
  if (request === "@/lib/supabase") return { supabaseAdmin: fakeSupabase };
  return originalLoad.call(this, request, ...rest);
};
after(() => { Module._load = originalLoad; });

const CLONE = "c0000000-0000-4000-8000-000000000001";
const DAY = 24 * 60 * 60_000;
// `views` view_item rows spread over days 1-6 ago (newest), plus `sales` Stars sales 6.5 days ago (oldest in the week).
function seed(views: number, sales: number) {
  const now = Date.now();
  const events: Row[] = [];
  for (let i = 0; i < views; i++) events.push({ clone_id: CLONE, telegram_id: 1000 + (i % 50), event: "view_item", rail: null, amount_stars: null,
    amount_nanoton: null, detail: null, created_at: new Date(now - DAY - Math.floor((i / views) * 5 * DAY)).toISOString() });
  for (let i = 0; i < sales; i++) events.push({ clone_id: CLONE, telegram_id: 2000 + i, event: "pay_success", rail: "stars", amount_stars: 100,
    amount_nanoton: null, detail: { order_id: `o${i}` }, created_at: new Date(now - 6.5 * DAY + i * 1000).toISOString() });
  tables = { clones: [{ id: CLONE, name: "Fixture Clone", status: "active" }], catalogue_events: events };
}
beforeEach(() => { requests = []; });

async function render() {
  const { default: Page } = await import("../../app/catalogue-funnel/page");
  const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
  const doc = new JSDOM(html).window.document;
  const row = [...doc.querySelectorAll("tr")].find(tr => tr.querySelector("td")?.textContent === "Fixture Clone");
  assert.ok(row, "clone row rendered");
  const cells = [...row.querySelectorAll("td")].map(td => td.textContent ?? "");
  const weekNumber = (cell: string) => Number(cell.split(" (")[0].replace(/,/g, ""));
  return { text: doc.body.textContent ?? "", itemViews: weekNumber(cells[2]), salesStars: weekNumber(cells[5]) };
}
const INCOMPLETE = /incomplete|truncated|partial|lower bound|not all events|too many events/i;

test("control: under the 1000-row cap the week totals equal the seeded events", async () => {
  seed(500, 3);
  const page = await render();
  assert.equal(page.itemViews, 500);
  assert.equal(page.salesStars, 3);
});

test("F3: over the 1000-row cap the page must show the full week totals or say it is incomplete", async () => {
  seed(1500, 3);
  const page = await render();
  assert.ok(requests.some(r => r.table === "catalogue_events" && r.returned === MAX_ROWS), "harness: the server cap was hit");
  const full = page.itemViews === 1500 && page.salesStars === 3;
  assert.ok(full || INCOMPLETE.test(page.text),
    `totals equal seed (1500 views, 3 Stars sales) OR page says incomplete; got ${page.itemViews} views, ${page.salesStars} sales, no warning`);
});
