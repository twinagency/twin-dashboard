import "../support/admin-route-env";
/**
 * Rule (CLAUDE.md "Twin Admin API" rules 3-4, REVIEW.md inv 3-4): clones.bot_token and app_settings.value are never
 * reachable through lib/api-read.ts, in ANY PostgREST select form. scripts/check-admin-api.ts D1-D8 pin the plain
 * column name in select / filter / order; this pins the forms PostgREST also accepts and a looser check could admit:
 * alias (`x:bot_token`), cast (`bot_token::text`), JSON path (`bot_token->>x`), embed (`clones(bot_token)`), `*`
 * mixes and whitespace, and for a hand-built spec the select actually sent on the wire by runQuery (faked PostgREST,
 * tests/support/admin-wire.ts). W4 lib-api-public-v2-plus6 characterization (C3), mutation-proven:
 * tests/rules/mutations/W4-lib-api-public-v2-plus6/c3-*.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { installWire } from "../support/admin-wire";
import { isQueryError, parseQuery, runQuery } from "../../lib/api-read";

const FORMS: Record<string, string[]> = {
  clones: ["bot_token", "id:bot_token", "token:bot_token", "bot_token::text", "id,bot_token", " bot_token ", "bot_token->>x",
    "bot_token->x", "clones(bot_token)", "self:clones(bot_token)", "*,bot_token", "id,name:bot_token", "bot_token.desc"],
  app_settings: ["value", "key:value", "v:value", "value::text", "value->>openrouter", "key,value", "*,value", "value->x"],
};

test("harness: the plain allowed columns parse", () => {
  assert.ok(!isQueryError(parseQuery(new URLSearchParams("table=clones&select=id,slug,name&order=name&filter=slug:eq:fake-clone"))));
  assert.ok(!isQueryError(parseQuery(new URLSearchParams("table=app_settings&select=key,updated_at"))));
});

test("select: every alias / cast / JSON-path / embed form of a forbidden column is refused", () => {
  for (const [table, forms] of Object.entries(FORMS)) for (const select of forms) {
    const r = parseQuery(new URLSearchParams({ table, select }));
    assert.ok(isQueryError(r), `${table} select=${JSON.stringify(select)} was admitted: ${JSON.stringify(r)}`);
  }
});

test("filter and order: cast / JSON-path forms of a forbidden column are refused", () => {
  for (const [table, col] of [["clones", "bot_token"], ["app_settings", "value"]]) {
    for (const c of [col, `${col}::text`, `${col}->>x`, `${col}->x`]) {
      assert.ok(isQueryError(parseQuery(new URLSearchParams({ table, filter: `${c}:eq:x` }))), `${table} filter on ${c}`);
      assert.ok(isQueryError(parseQuery(new URLSearchParams({ table, order: c }))), `${table} order by ${c}`);
    }
  }
});

test("runQuery: default and hand-built selects never send a forbidden column on the wire", async () => {
  const w = installWire({ tables: { clones: [{ id: "c1", name: "Fake Clone", bot_token: "fake-test-token" }], app_settings: [{ key: "k", value: "fake-test-secret" }] } });
  try {
    const def = await runQuery({ table: "clones" });
    assert.ok(!isQueryError(def), JSON.stringify(def));
    for (const [table, forms] of Object.entries(FORMS)) for (const select of forms) {
      const r = await runQuery({ table, select: select.split(",") });
      assert.ok(isQueryError(r), `${table} hand-built select ${JSON.stringify(select)} was admitted`);
    }
    const sent = w.rest("clones", "GET").concat(w.rest("app_settings", "GET")).map((c) => c.url.searchParams.get("select") ?? "");
    assert.deepEqual(sent.filter((s) => /bot_token|(^|[,:(])value\b/.test(s)), [], `selects sent: ${JSON.stringify(sent)}`);
    assert.equal(JSON.stringify(def).includes("fake-test-token"), false);
  } finally { w.restore(); }
});
