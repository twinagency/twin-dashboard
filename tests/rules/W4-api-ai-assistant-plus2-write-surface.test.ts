/**
 * RULE (W4 write-surface pin, docs/review/W4/api-ai-assistant-plus2.md decision log (1); CLAUDE.md rule 3: never a
 * money VALUE): the assistant's write surface is exactly today's 8 tools; across WRITE_TOOL_DEFS the only numeric
 * parameter is setFanCredits.credits (F2, owner decision pending, pinned so it cannot grow silently); the approve
 * gate refuses anything that is not a write tool. Growing the surface must be a deliberate edit of this test.
 * Characterization (green today), mutation-proven: tests/rules/mutations/W4-api-ai-assistant-plus2/.
 * Run: env -i PATH="$PATH" HOME="$HOME" NODE_ENV=test nice -n 10 node --import tsx --test tests/rules/W4-api-ai-assistant-plus2-write-surface.test.ts
 * DECLARED BYPASS: none (pure module reads; harness imported only for the AsyncLocalStorage global and fake env).
 */
import "../known-red/W4-api-ai-assistant-plus2-harness";
import assert from "node:assert/strict";
import { test } from "node:test";

process.env.SUPABASE_URL = "http://127.0.0.1:9"; // never contacted: no query runs in this file
process.env.SUPABASE_SERVICE_KEY = "test-service-key-not-real";

const NAMES = ["setCloneFeature", "setCloneDial", "setCloneStatus", "recompileClonePersona", "setFanCredits", "setFanActive", "setFanBlocked", "resetFanCounters"];

function numericParams(defs: any[]): string[] {
  const out: string[] = [];
  const walk = (path: string, schema: any) => {
    if (!schema || typeof schema !== "object") return;
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (types.includes("number") || types.includes("integer")) out.push(path);
    for (const [k, v] of Object.entries(schema.properties ?? {})) walk(`${path}.${k}`, v);
    if (schema.items) walk(`${path}[]`, schema.items);
    for (const key of ["anyOf", "oneOf", "allOf"]) for (const s of schema[key] ?? []) walk(path, s);
  };
  for (const d of defs) walk(d.function.name, d.function.parameters);
  return out.sort();
}

test("pin: WRITE_TOOL_NAMES is exactly the current 8 write tools", async () => {
  const { WRITE_TOOL_NAMES } = await import("../../app/api/ai-assistant/write-tools");
  assert.deepEqual([...WRITE_TOOL_NAMES].sort(), [...NAMES].sort());
});

test("pin: WRITE_TOOL_DEFS advertises exactly the same 8 tools", async () => {
  const { WRITE_TOOL_DEFS } = await import("../../app/api/ai-assistant/write-tools");
  assert.deepEqual(WRITE_TOOL_DEFS.map((d) => d.function.name).sort(), [...NAMES].sort());
});

test("pin: the only numeric write parameter is setFanCredits.credits", async () => {
  const { WRITE_TOOL_DEFS } = await import("../../app/api/ai-assistant/write-tools");
  assert.deepEqual(numericParams(WRITE_TOOL_DEFS), ["setFanCredits.credits"]);
});

test("pin: isApprovableWrite refuses read tools, nav tools and non-strings", async () => {
  const { isApprovableWrite } = await import("../../app/api/ai-assistant/proposals");
  for (const t of ["queryTable", "openPage", "openClonePage", "getTopSpenders", "updateFeedbackStatus", "startTestRun", "deleteClone", "", 42, null, undefined, {}]) {
    assert.equal(isApprovableWrite(t), false, `approvable: ${JSON.stringify(t)}`);
  }
  for (const t of NAMES) assert.equal(isApprovableWrite(t), true, t);
});
