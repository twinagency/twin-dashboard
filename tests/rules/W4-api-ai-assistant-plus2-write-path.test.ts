/**
 * RULE (W4 H3, docs/review/W4/api-ai-assistant-plus2.md; CLAUDE.md rule 3; REVIEW.md invariant 3): assistant writes
 * go only through the allowlist in app/clones/toggle-fields.ts. A secret, money or fenced column (bot_token,
 * credit_pack_price_stars, strict_minor_gate) is refused with {error} and never PATCHed, and the server actions
 * themselves (setCloneToggle / setCloneDial in app/clones/actions.ts) refuse it again with a clean Error (not a
 * TypeError) before any PATCH; write-tools.ts itself issues no DB mutation other than inserts (the audit row; a
 * shared log writer elsewhere is also fine), and on the wire every write tool, recompileClonePersona included,
 * only PATCHes clones/users (named columns) and POSTs system_logs; the tool schema enums the model sees are exactly
 * the toggle-fields allowlists, and the CLONE_DIAL_FIELDS key list is pinned (a new dial column, e.g. a money
 * column, needs a reviewed edit of this test).
 * Characterization (green today), mutation-proven: tests/rules/mutations/W4-api-ai-assistant-plus2/.
 * Run: env -i PATH="$PATH" HOME="$HOME" NODE_ENV=test nice -n 10 node --import tsx --test tests/rules/W4-api-ai-assistant-plus2-write-path.test.ts
 * DECLARED BYPASS: Next workAsyncStorage fake store (see tests/known-red/W4-api-ai-assistant-plus2-harness.ts);
 * PostgREST faked on 127.0.0.1 (answers clone + fan lookups so a write WOULD land if attempted).
 */
import { CLONE, FAN_ID, inWorkStore, startFakePostgrest, type FakePostgrest } from "../known-red/W4-api-ai-assistant-plus2-harness";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, test } from "node:test";

let pg: FakePostgrest;
before(async () => { pg = await startFakePostgrest(); });
after(async () => { await pg.close(); });
beforeEach(() => {
  pg.reset();
  // Seeded rows (not a GET-only responder) so a row-count fix (F3) still matches the PATCH and stays green.
  pg.seed("clones", [{ ...CLONE, intake: null }]);
  pg.seed("users", [{ id: FAN_ID, clone_id: CLONE.id, stated_name: "Sam", message_credits: 1 }]);
});

async function run(tool: string, args: Record<string, unknown>): Promise<any> {
  const { executeWriteTool } = await import("../../app/api/ai-assistant/write-tools");
  try {
    return await inWorkStore(() => executeWriteTool(tool, args));
  } catch (e) {
    return { thrown: e instanceof Error ? e.message : String(e) };
  }
}

for (const field of ["bot_token", "credit_pack_price_stars", "strict_minor_gate"]) {
  test(`H3: setCloneFeature field "${field}" is refused with {error} and never PATCHes clones`, async () => {
    const r = await run("setCloneFeature", { clone: CLONE.id, field, enabled: false });
    assert.equal(typeof r?.error, "string", JSON.stringify(r));
    assert.notEqual(r?.ok, true);
    assert.deepEqual(pg.calls.filter((c) => c.method !== "GET").map((c) => `${c.method} ${c.table}`), []);
  });
  test(`H3: setCloneDial field "${field}" is refused with {error} and never PATCHes clones`, async () => {
    const r = await run("setCloneDial", { clone: CLONE.id, field, value: "high" });
    assert.equal(typeof r?.error, "string", JSON.stringify(r));
    assert.deepEqual(pg.calls.filter((c) => c.method !== "GET").map((c) => `${c.method} ${c.table}`), []);
  });
}

test("H3: write-tools.ts itself issues no DB mutation other than an insert (the audit row)", () => {
  const src = readFileSync(new URL("../../app/api/ai-assistant/write-tools.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  const mutations = [...src.matchAll(/\.(insert|update|upsert|delete|rpc)\s*\(/g)].map((m) => m[1]);
  assert.deepEqual(mutations.filter((m) => m !== "insert"), [], `mutations in write-tools.ts: ${mutations}`);
  assert.doesNotMatch(src, /\.sql\b|\braw\s*\(|postgres\(/, "no raw SQL in write-tools");
});

test("H3: on the wire, a full run of every write tool only PATCHes clones/users and POSTs system_logs", async () => {
  const { WRITE_TOOL_NAMES } = await import("../../app/api/ai-assistant/write-tools");
  const calls: [string, Record<string, unknown>][] = [
    ["setCloneFeature", { clone: CLONE.id, field: "voice_enabled", enabled: true }],
    ["setCloneDial", { clone: CLONE.id, field: "push_level", value: "high" }],
    ["setCloneStatus", { clone: CLONE.id, status: "paused" }],
    ["recompileClonePersona", { clone: CLONE.id }], // compile path: GET clones + GET prompt_templates (store: none) → PATCH clones
    ["setFanCredits", { userId: FAN_ID, credits: 7 }],
    ["setFanActive", { userId: FAN_ID, active: true }],
    ["setFanBlocked", { userId: FAN_ID, blocked: false }],
    ["resetFanCounters", { userId: FAN_ID }],
  ];
  assert.deepEqual(calls.map(([t]) => t).sort(), [...WRITE_TOOL_NAMES].sort(), "every write tool is exercised");
  for (const [t, a] of calls) {
    const r = await run(t, a);
    assert.equal(r?.ok, true, `${t}: ${JSON.stringify(r)}`);
  }
  const writes = [...new Set(pg.calls.filter((c) => c.method !== "GET").map((c) => `${c.method} ${c.table}`))].sort();
  assert.deepEqual(writes, ["PATCH clones", "PATCH users", "POST system_logs"]);
  assert.equal(pg.writes("POST", "system_logs").length, calls.length, "one audit row per applied write");
  assert.ok(pg.writes("PATCH", "clones").some((p) => "persona" in (p.body ?? {})), "recompile reached its PATCH");
  for (const p of pg.writes("PATCH", "clones")) {
    const cols = Object.keys(p.body).filter((k) => k !== "updated_at");
    const allowed = ["voice_enabled", "push_level", "status", "persona", "text_prompt", "voice_prompt", "photo_reply_prompt", "routing_prompt"];
    assert.ok(cols.every((k) => allowed.includes(k)), `unexpected clone columns ${cols}`);
  }
});

test("H3: WRITE_TOOL_DEFS field enums equal CLONE_TOGGLE_FIELDS / CLONE_DIAL_FIELD_NAMES", async () => {
  const { WRITE_TOOL_DEFS } = await import("../../app/api/ai-assistant/write-tools");
  const { CLONE_TOGGLE_FIELDS, CLONE_DIAL_FIELD_NAMES } = await import("../../app/clones/toggle-fields");
  const def = (n: string) => WRITE_TOOL_DEFS.find((d) => d.function.name === n)!.function.parameters as any;
  assert.deepEqual(def("setCloneFeature").properties.field.enum, [...CLONE_TOGGLE_FIELDS]);
  assert.deepEqual(def("setCloneDial").properties.field.enum, [...CLONE_DIAL_FIELD_NAMES]);
  for (const f of ["bot_token", "credit_pack_price_stars", "strict_minor_gate", "subscriptions_enabled"]) {
    assert.ok(!(CLONE_TOGGLE_FIELDS as readonly string[]).includes(f), `${f} in CLONE_TOGGLE_FIELDS`);
    assert.ok(!(CLONE_DIAL_FIELD_NAMES as readonly string[]).includes(f), `${f} in CLONE_DIAL_FIELD_NAMES`);
  }
});

test("H3: CLONE_DIAL_FIELDS keys are exactly today's 8 tone dials (a new dial column needs a reviewed test change)", async () => {
  const { CLONE_DIAL_FIELDS } = await import("../../app/clones/toggle-fields");
  assert.deepEqual(Object.keys(CLONE_DIAL_FIELDS), [
    "sexual_level", "nsfw_level", "push_level", "warmth_level", "curiosity_level", "playfulness_level", "attentiveness_level", "emoji_amount",
  ]);
});

for (const field of ["bot_token", "credit_pack_price_stars"]) {
  test(`H3: server action setCloneToggle itself refuses "${field}" with a clean Error and sends no PATCH`, async () => {
    const { setCloneToggle } = await import("../../app/clones/actions");
    const err = await inWorkStore(() => setCloneToggle(CLONE.id, field as any, false)).then(() => null, (e) => e);
    assert.ok(err instanceof Error && !(err instanceof TypeError), `expected a refusal, got ${err}`);
    assert.deepEqual(pg.calls.filter((c) => c.method !== "GET").map((c) => `${c.method} ${c.table}`), []);
  });
  test(`H3: server action setCloneDial itself refuses "${field}" with a clean Error and sends no PATCH`, async () => {
    const { setCloneDial } = await import("../../app/clones/actions");
    const err = await inWorkStore(() => setCloneDial(CLONE.id, field as any, "high")).then(() => null, (e) => e);
    assert.ok(err instanceof Error && !(err instanceof TypeError), `expected a refusal, got ${err}`);
    assert.deepEqual(pg.calls.filter((c) => c.method !== "GET").map((c) => `${c.method} ${c.table}`), []);
  });
}
