/**
 * KNOWN RED (W4 F15, docs/review/W4/api-ai-assistant-plus2.md): app/api/ai-assistant/suggestions.ts:44-45
 * `if (error) return [];` turns a database error into "no suggestions", so GET /api/ai-assistant/suggestions
 * answers 200 {suggestions:[]} and its own 500 path is dead; `.limit(50)` with no order + `slice(0,6)` makes which
 * six show non-deterministic.
 * Control: one active clone with a voice set and voice off → 200 with that one suggestion.
 * Red: a PostgREST 500 is not reported as 200 + empty list (any other shape passes); which suggestions show is
 * deterministic: the same 10 clones served in two different physical orders must yield identical suggestions.
 * The fake is the harness's stateful store: it sorts STABLY by whatever `order` is requested, so ordering by a key
 * that is constant across rows (e.g. status) keeps the physical order and stays red; ordering by name or id, or
 * sorting in code, turns it green. No fix shape is encoded.
 * Run: env -i PATH="$PATH" HOME="$HOME" NODE_ENV=test nice -n 10 node --import tsx --test tests/known-red/W4-api-ai-assistant-plus2-suggestions-db-error.test.ts
 * DECLARED BYPASS: none beyond the harness (PostgREST faked on 127.0.0.1; no server action runs).
 */
import { CLONE, startFakePostgrest, type FakePostgrest } from "./G18-harness";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

let pg: FakePostgrest;
before(async () => { pg = await startFakePostgrest(); });
after(async () => { await pg.close(); });
beforeEach(() => pg.reset());

async function getSuggestions(): Promise<{ status: number; body: any }> {
  const { GET } = await import("../../app/api/ai-assistant/suggestions/route");
  const res = await GET();
  return { status: res.status, body: await res.json().catch(() => null) };
}

test("control: a clone with a voice set but voice off yields one suggestion (200)", async () => {
  pg.respond((c) => (c.table === "clones" && c.method === "GET"
    ? { body: [{ ...CLONE, status: "active", voice_enabled: false, voice_id: "voice-test", discounts_enabled: true, tips_enabled: true, spoil_options: [] }] }
    : undefined));
  const r = await getSuggestions();
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.suggestions.map((s: any) => `${s.cloneId}:${s.field}`), [`${CLONE.id}:voice_enabled`]);
  assert.equal(pg.calls.filter((c) => c.table === "clones").length, 1);
});

test("F15: a database error is not reported as 200 with an empty suggestion list", async () => {
  pg.respond((c) => (c.table === "clones" ? { status: 500, body: { code: "57014", message: "canceling statement due to statement timeout" } } : undefined));
  const r = await getSuggestions();
  assert.equal(pg.calls.filter((c) => c.table === "clones").length >= 1, true, "the clones read must have been attempted");
  assert.notDeepEqual(r, { status: 200, body: { suggestions: [] } }, "DB failure looks exactly like 'nothing to suggest'");
});

const TEN = Array.from({ length: 10 }, (_, i) => ({
  id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`, name: `Clone ${String(i).padStart(2, "0")}`, slug: `clone-${i}`,
  status: "active", voice_enabled: false, voice_id: `voice-${i}`, discounts_enabled: true, tips_enabled: true, spoil_options: [],
  discount_max_photo: 0, discount_max_video: 0, discount_max_bundle: 0, discount_max_credits: 0,
}));
async function suggestionsFor(physicalOrder: typeof TEN): Promise<string[]> {
  pg.reset();
  pg.seed("clones", physicalOrder);
  const r = await getSuggestions();
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.suggestions.map((s: any) => s.id);
}

test("F15: the same clones in a different physical order yield the same suggestions", async () => {
  const a = await suggestionsFor(TEN);
  const b = await suggestionsFor([...TEN].reverse());
  assert.ok(a.length > 0, "suggestions expected");
  assert.deepEqual(b, a, "which suggestions show depends on the database's row order");
});
