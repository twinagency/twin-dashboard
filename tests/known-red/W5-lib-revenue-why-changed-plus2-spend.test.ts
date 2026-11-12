// KNOWN RED (W5 lib-revenue-why-changed-plus2, findings F10 F11 F12 F14 F15 F16; docs/review/W5/lib-revenue-why-changed-plus2.md).
// lib/spend-data.ts (the /logs Spend page). Pure functions called directly; getSpendData driven against a fake
// PostgREST at the fetch wire (filters, order, limit, projection honoured; admin access = withDashboardAccess(null)).
//   F10 "Today" starts at the container's midnight (UTC in prod, lib/report-time.ts:5-7), not Sydney's.
//   F11 a failed usage read returns {rows: [], truncated: true}: the page shows $0 under "window too big".
//   F12 a failed fan-message count reads as 0 messages; a failed clones read as "no creators", page looks complete.
//   F14 cached_prompt_tokens with prompt_tokens null pushes the cache hit rate above 100%.
//   F15 the "(no model recorded)" placeholder is listed as a model "not configured by any creator".
//   F16 clones.photo_vision_model is not in MODEL_COLUMNS, so its spend is flagged "not configured".
// "Fixed" for F11 and F12 (clones) means getSpendData rejects, so the page shows its error state instead of figures;
// for F12 (count) a rejection or `fanMessages: null`. A flag in the payload is not accepted: app/logs/SpendView.tsx
// reads none, so it would still render $0 / "No creators." `truncated` already means "window too big".
// One finding per test, prefixed `F<n>:` so each can be wired on its own (`--test-name-pattern='^F11:'`).
// Team's Claude owns the fixes. Not wired into npm scripts; run like init.sh's known-red loop.
import assert from "node:assert/strict";
import test from "node:test";
import { query, TIMEOUT, withWire, type Handler, type Row, type WireResponse } from "../rules/W5-lib-revenue-why-changed-plus2-wire";
import { withDashboardAccess } from "../../lib/dashboard-access";
import { getSpendData, rollUpSpend, windowRange, type SpendData, type SpendUsageRow } from "../../lib/spend-data";
import { reportDayStartMs } from "../../lib/revenue-why-changed";
import { reportInstant } from "../../lib/report-time";

const NOW = Date.parse("2026-11-12T23:30:00Z"); // 10:30 AEDT on 13 Nov
const AVA = "00000000-0000-4000-8000-000000000001";
const row = (r: Partial<SpendUsageRow>): SpendUsageRow => ({
  clone_id: null, flow: "reply", kind: "llm", model: "m/one", cost_usd: 0, prompt_tokens: null, completion_tokens: null,
  cached_prompt_tokens: null, cache_write_tokens: null, cache_discount_usd: null, ok: true, ...r,
});
const roll = (rows: SpendUsageRow[], configuredModels: string[] = ["m/one"]) =>
  rollUpSpend(rows, { window: "7d", startIso: "", endIso: "", truncated: false, clones: [], configuredModels, fanMessages: 10 });

const show = (r: SpendData | Error) =>
  r instanceof Error ? r.message : `fanMessages=${r.totals.fanMessages} creators=${r.clones.length} costUsd=${r.totals.costUsd} truncated=${r.truncated}`;

function spendWire(opts: { clones?: WireResponse; cloneRows?: Row[]; usage?: WireResponse; usageRows?: Row[]; count?: WireResponse } = {}): Handler {
  const cloneRows = opts.cloneRows ?? [{ id: AVA, name: "Ava", intake: null, text_model: "m/one" }];
  return ({ method, path, url }) => {
    if (path === "clones" && method === "GET") return opts.clones ?? { status: 200, json: query(cloneRows, url) };
    if (path === "usage_events" && method === "GET") return opts.usage ?? { status: 200, json: query(opts.usageRows ?? [], url) };
    if (path === "chat_history" && method === "HEAD") return opts.count ?? { status: 200, json: null, headers: { "content-range": "*/42" } };
    return undefined;
  };
}
async function spend(h: Handler): Promise<SpendData | Error> {
  const err = console.error;
  console.error = () => {}; // the lib logs each failed read; keep the test output readable
  try {
    return await withWire(h, () => withDashboardAccess(null, () => getSpendData("7d", null, "all", NOW)));
  } catch (e) {
    return e instanceof Error ? e : new Error(String(e));
  } finally {
    console.error = err;
  }
}
const ok = (r: SpendData | Error): SpendData => {
  if (r instanceof Error) throw r;
  return r;
};

test("control: costs sum (numeric strings included), 7d is rolling from now, getSpendData reads 42 messages and Ava", async () => {
  assert.equal(roll([row({ cost_usd: "0.5" }), row({ cost_usd: 0.25 })]).totals.costUsd, 0.75);
  assert.deepEqual(windowRange("7d", NOW), { startMs: NOW - 7 * 86_400_000, endMs: NOW });
  const r = ok(await spend(spendWire()));
  assert.equal(r.totals.fanMessages, 42);
  assert.deepEqual(r.clones.map((c) => c.name), ["Ava"]);
});

test("F10: 'Today' on a UTC container starts at Sydney midnight like every revenue surface", () => {
  const tz = process.env.TZ;
  process.env.TZ = "UTC"; // the production container (lib/report-time.ts:5-7)
  try {
    const sydneyMidnight = reportDayStartMs(reportInstant(new Date(NOW)).dayKey);
    const got = windowRange("today", NOW).startMs;
    assert.equal(new Date(got).toISOString(), new Date(sydneyMidnight).toISOString(), "Spend 'Today' must cover the same day as Revenue 'Today'");
  } finally {
    if (tz === undefined) delete process.env.TZ;
    else process.env.TZ = tz;
  }
});

test("F11: a usage read that times out on every slice is reported as a failure, not as 'too big' with $0", async () => {
  const r = await spend(spendWire({ usage: TIMEOUT }));
  assert.ok(r instanceof Error, `every usage_events slice failed, page shows ${show(r)}`);
});

test("F12: a failed fan-message count is not shown as 0 fan messages on a complete-looking page", async () => {
  const r = await spend(spendWire({ count: TIMEOUT }));
  assert.ok(r instanceof Error || r.totals.fanMessages === null, `count failed, page shows ${show(r)}`);
});

test("F12: a failed clones read is not shown as 'no creators' on a complete-looking page", async () => {
  const r = await spend(spendWire({ clones: TIMEOUT }));
  assert.ok(r instanceof Error, `clones read failed, page shows ${show(r)}`);
});

test("F16: spend on a clone's configured photo_vision_model is not flagged 'not configured by any creator'", async () => {
  const r = ok(await spend(spendWire({
    cloneRows: [{ id: AVA, name: "Ava", intake: null, text_model: "m/one", photo_vision_model: "m/vision" }],
    usageRows: [{ ...row({ clone_id: AVA, model: "m/vision", cost_usd: 0.3 }), created_at: "2026-11-10T00:00:00Z", id: 1 }],
  })));
  assert.equal(r.totals.costUsd, 0.3, "control inside the test: the usage row was read");
  assert.deepEqual(r.unconfiguredModels, [], "m/vision is configured on Ava (clones.photo_vision_model)");
});

test("F14: a row with cached tokens but no prompt tokens stays out of the hit rate (never above 100%)", () => {
  const { hitRate, reportingPromptTokens, cachedPromptTokens } =
    roll([row({ cached_prompt_tokens: 500, prompt_tokens: null }), row({ cached_prompt_tokens: 0, prompt_tokens: 400 })]).cache;
  // The second row is a valid report (0 of 400 cached), so the fixed answer is 0%, not "no data".
  assert.deepEqual({ hitRate, reportingPromptTokens, cachedPromptTokens }, { hitRate: 0, reportingPromptTokens: 400, cachedPromptTokens: 0 });
});

test("F15: the '(no model recorded)' placeholder is not reported as an unconfigured model", () => {
  const d = roll([row({ model: null, cost_usd: 0.1 }), row({ model: "m/one", cost_usd: 0.2 })]);
  assert.deepEqual(d.unconfiguredModels, [], "nobody can configure 'no model'; the badge counts it as spend you never chose");
});
