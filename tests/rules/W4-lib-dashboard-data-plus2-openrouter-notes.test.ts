// RULE (W4 lib-dashboard-data-plus2 C3; holds today, mutation-proven in tests/rules/mutations/W4-lib-dashboard-data-plus2/):
// the settings page shows OPENROUTER_FIELD_NOTES (hand-typed field/value strings) as "the fields we send"; they must equal
// OPENROUTER_EXTRA_PARAMS flattened (dotted path + JSON value), so the page cannot drift from the constant (F30).
// This pins notes == constant only; whether the bot sends the constant on every model is F30 (not provable offline).
import assert from "node:assert/strict";
import { test } from "node:test";
import { OPENROUTER_EXTRA_PARAMS, OPENROUTER_FIELD_NOTES } from "../../lib/openrouter-fields";

function flatten(v: unknown, prefix = ""): [string, string][] {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return Object.entries(v as Record<string, unknown>).flatMap(([k, x]) => flatten(x, prefix ? `${prefix}.${k}` : k));
  }
  return [[prefix, JSON.stringify(v)]];
}
const byPath = (a: [string, string], b: [string, string]) => (a[0] < b[0] ? -1 : 1);

test("C3 OPENROUTER_FIELD_NOTES list exactly the flattened OPENROUTER_EXTRA_PARAMS (field path + JSON value), each with a reason", () => {
  const constant = flatten(OPENROUTER_EXTRA_PARAMS).sort(byPath);
  const notes = OPENROUTER_FIELD_NOTES.map((n) => [n.field, n.value] as [string, string]).sort(byPath);
  assert.deepEqual(notes, constant);
  for (const n of OPENROUTER_FIELD_NOTES) assert.ok(n.why.trim().length > 20, `${n.field} has no reason`);
});
