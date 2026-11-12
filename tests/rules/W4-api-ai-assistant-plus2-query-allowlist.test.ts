/**
 * RULE (W4 H1, docs/review/W4/api-ai-assistant-plus2.md; CLAUDE.md rule 3; REVIEW.md invariant 3): the /ai assistant
 * reads only through the allowlist in app/api/ai-assistant/tools.ts. clones.bot_token and app_settings.value are
 * unreadable (not in ALLOWLIST, refused in select/filter/orderBy, never on the wire); non-allowlisted tables,
 * aliases, embeds and filter ops outside eq/gt/gte/lt/lte/ilike are refused before any request; every read is
 * capped at 200 rows on the wire. The hand-written selects of the specialised readers (getTopSpenders,
 * getRecentErrors, checkDialConflicts incl. its clone resolver) never name bot_token or app_settings.value on the
 * wire, embeds included.
 * Characterization (green today), mutation-proven: tests/rules/mutations/W4-api-ai-assistant-plus2/.
 * Run: env -i PATH="$PATH" HOME="$HOME" NODE_ENV=test nice -n 10 node --import tsx --test tests/rules/W4-api-ai-assistant-plus2-query-allowlist.test.ts
 * DECLARED BYPASS: none beyond the harness (PostgREST faked on 127.0.0.1; read tools only, no server action).
 */
import { CLONE, FAN_ID, startFakePostgrest, type FakePostgrest } from "../known-red/W4-api-ai-assistant-plus2-harness";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

let pg: FakePostgrest;
before(async () => { pg = await startFakePostgrest(); });
after(async () => { await pg.close(); });
beforeEach(() => pg.reset());

async function tool(name: string, args: Record<string, unknown>): Promise<any> {
  const { executeTool } = await import("../../app/api/ai-assistant/tools");
  return executeTool(name, args);
}
const selected = (c: { query: URLSearchParams }) => (c.query.get("select") ?? "").split(",");

test("H1: ALLOWLIST never contains clones.bot_token or app_settings.value", async () => {
  const { ALLOWLIST } = await import("../../app/api/ai-assistant/tools");
  assert.ok(!ALLOWLIST.clones.includes("bot_token"));
  assert.ok(!ALLOWLIST.app_settings.includes("value"));
  for (const [t, cols] of Object.entries(ALLOWLIST)) assert.ok(!cols.includes("*"), `${t} allows *`);
});

for (const [table, col] of [["clones", "bot_token"], ["app_settings", "value"]] as const) {
  test(`H1: ${table}.${col} is refused in select, filter and orderBy, and nothing is sent`, async () => {
    for (const args of [
      { table, select: [col] },
      { table, select: `id,${col}` },
      { table, select: [`x:${col}`] },
      { table, select: [`${col}::text`] },
      { table, filters: [{ column: col, op: "ilike", value: "%" }] },
      { table, orderBy: col },
    ]) {
      const r = await tool("queryTable", args);
      assert.equal(typeof r?.error, "string", `${JSON.stringify(args)} → ${JSON.stringify(r)}`);
    }
    assert.deepEqual(pg.calls.map((c) => c.url), []);
  });

  test(`H1: a default (every allowed column) read of ${table} never puts ${col} on the wire`, async () => {
    const r = await tool("queryTable", { table });
    assert.ok(Array.isArray(r?.rows), JSON.stringify(r));
    assert.equal(pg.calls.length, 1);
    assert.ok(!selected(pg.calls[0]).includes(col), pg.calls[0].url);
  });
}

test("H1: tables outside the allowlist and embeds are refused before any request", async () => {
  for (const args of [
    { table: "ai_messages" },
    { table: "pg_shadow" },
    { table: "clones", select: ["clones(bot_token)"] },
    { table: "users", select: ["id,clones(bot_token)"] },
  ]) {
    const r = await tool("queryTable", args);
    assert.equal(typeof r?.error, "string", `${JSON.stringify(args)} → ${JSON.stringify(r)}`);
  }
  assert.deepEqual(pg.calls.map((c) => c.url), []);
});

test("H1: filter ops outside eq/gt/gte/lt/lte/ilike are refused before any request", async () => {
  for (const op of ["neq", "in", "is", "or", "like", "match", "filter"]) {
    const r = await tool("queryTable", { table: "clones", filters: [{ column: "name", op, value: "x" }] });
    assert.equal(typeof r?.error, "string", `${op} → ${JSON.stringify(r)}`);
  }
  assert.deepEqual(pg.calls.map((c) => c.url), []);
});

test("H1: every read is capped at 200 rows on the wire", async () => {
  await tool("queryTable", { table: "clones", limit: 100000 });
  await tool("getTopSpenders", { limit: 100000 });
  await tool("getRecentErrors", { limit: 100000 });
  assert.equal(pg.calls.length, 3);
  for (const c of pg.calls) assert.equal(c.query.get("limit"), "200", c.url);
  const r = await tool("queryTable", { table: "clones" });
  assert.equal(r.limitApplied, 50, "default limit");
});

test("H1: the specialised readers never select bot_token or app_settings.value on the wire (embeds included)", async () => {
  pg.seed("clones", [{ ...CLONE, status: "active", silence_fallback_mode: "on", nsfw_level: "medium", sexual_level: "medium" }]);
  pg.seed("users", [{ id: FAN_ID, clone_id: CLONE.id, telegram_id: 1001, name: "Sam", total_spent_stars: 10, purchase_count: 1 }]);
  pg.seed("system_logs", [{ id: 1, ts: "2026-11-01T00:00:00Z", level: "error", source: "test", clone_id: CLONE.id, message: "x", detail: null }]);
  const runs: [string, Record<string, unknown>, string][] = [
    ["getTopSpenders", { limit: 5 }, "users"],
    ["getTopSpenders", { limit: 5, cloneId: CLONE.id }, "users"],
    ["getRecentErrors", { limit: 5 }, "system_logs"],
    ["getRecentErrors", { limit: 5, cloneId: CLONE.id }, "system_logs"],
    ["checkDialConflicts", { cloneIdOrSlug: CLONE.id }, "clones"],
    ["checkDialConflicts", { cloneIdOrSlug: CLONE.slug }, "clones"],
  ];
  for (const [name, args, table] of runs) {
    const from = pg.calls.length;
    const r = await tool(name, args);
    assert.equal(r?.error, undefined, `${name} ${JSON.stringify(args)} → ${JSON.stringify(r)}`);
    const sent = pg.calls.slice(from);
    assert.ok(sent.some((c) => c.method === "GET" && c.table === table), `${name} did not read ${table}`);
    for (const c of sent) {
      const sel = c.query.get("select") ?? "";
      assert.doesNotMatch(sel, /\bbot_token\b/, `${name}: ${c.url}`);
      assert.doesNotMatch(sel, /\bapp_settings\s*\([^)]*\bvalue\b/, `${name}: ${c.url}`);
      if (c.table === "app_settings") assert.ok(!selected(c).includes("value") && sel !== "*" && sel !== "", `${name}: ${c.url}`);
    }
  }
});
