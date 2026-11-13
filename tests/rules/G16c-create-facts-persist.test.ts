import "../support/admin-route-env";
/**
 * G16c (batch rwl 2, C3 + C11 + C5): POST /api/admin/v1/clones/create must not answer 200 for facts it did not store.
 *  - C3: CREATE_KEYS accepted `ethnicity`/`occupation`, which rowFromForm never writes (retired 033 columns), and
 *    refused the identity-canon keys rowFromForm does write (ethnicity_tags, socials, vibe_preset, daily_blocks...).
 *  - C11: createCloneRow discarded writeStrippingMissing's `stripped`, so a fact dropped by the missing-column retry
 *    (unapplied migration) was reported as created, by the route and by the UI create form.
 *  - C5: CREATE_CREDIT_DEFAULTS (50/50/199) disagreed with BUILTIN_CLONE_DEFAULTS (20/30/299).
 * Drives the real route and the real server action; PostgREST faked at the wire (tests/support/admin-wire.ts).
 * Assertions are on the stored insert body, not on "a row was inserted".
 */
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import { adminRequest, callJson, inNextRoute, installWire, type Call } from "../support/admin-wire";
import { POST } from "../../app/api/admin/v1/clones/create/route";
import { createCloneRow } from "../../app/clones/actions";
import { withDashboardAccess } from "../../lib/dashboard-access";
import { BUILTIN_CLONE_DEFAULTS } from "../../lib/clone-default-policy";

// Independent oracle: every typed fact rowFromForm writes under persona_facts from migrations 033 + 039, with the
// value it must store. Hand-listed on purpose so the route's derived allowlist is checked, not echoed.
const FACTS: Record<string, unknown> = {
  date_of_birth: "1999-04-02", gender: "female", height: "5'6", sexuality: "straight", hometown: "Austin",
  current_city: "Miami", socials: [{ platform: "instagram", handle: "@wire" }], fan_nicknames: ["babe"],
  vibe_preset: "sweet", turn_ons: ["a"], turn_offs: ["b"], hard_limits: ["c"], hard_limits_extra: "none",
  stage_name: "Wire", real_name: "Wilma", name_shared_with_fans: "stage", creator_type: "solo", known_for: "cosplay",
  career_start_year: 2019, career_history: "ten years", cover_story: "student", admits_platforms: true,
  platforms: ["of"], hair_color: "brown", hair_length: "long", eye_color: "green", body_type: "petite", cup_size: "B",
  measurements: "32-24-34", tattoos: true, tattoo_details: ["rose"], piercings: false, piercing_details: ["ear"],
  enhancements: "none", ethnicity_tags: ["latina"], ethnicity_other: "half", voice_accent: "texan", voice_pace: "slow",
  voice_texture: "husky", meeting_policy: "never", love_policy: "slow", relationship_canon: "single",
  acknowledges_other_fans: true, wake_time: "08:00", sleep_time: "23:30",
  daily_blocks: [{ time: "09:00", activity: "gym" }], content_hard_nos: ["x"], content_done: ["y"],
  reaction_to_rudeness: "cold", reaction_to_compliments: "shy", burst_style: "short", uses_lowercase: true,
  drops_punctuation: false, makes_typos: true, double_texts: false,
};

const missingColumn = (col: string) => {
  let first = true;
  return (c: Call) => {
    if (c.table !== "clones" || c.method !== "POST" || !first) return undefined;
    first = false;
    return new Response(JSON.stringify({ code: "PGRST204", message: `Could not find the '${col}' column of 'clones' in the schema cache` }),
      { status: 400, headers: { "content-type": "application/json" } });
  };
};
const wire = (override?: (c: Call) => Response | undefined) =>
  installWire({ defaults: { clones: () => ({ id: randomUUID() }) }, override });
const create = (extra: Record<string, unknown>) =>
  inNextRoute("/api/admin/v1/clones/create", () =>
    callJson(POST, adminRequest("/api/admin/v1/clones/create", { json: { name: "Wire Test", bot_token: "999999:" + "x".repeat(20), ...extra } })));
const inserted = (w: ReturnType<typeof wire>) => w.rest("clones", "POST").map((c) => c.body as Record<string, unknown>);

test("C3: every typed fact rowFromForm writes is accepted and stored with the caller's value", async () => {
  const w = wire();
  try {
    const { status, body } = await create({ status: "paused", ...FACTS });
    assert.equal(status, 200, JSON.stringify(body));
    const rows = inserted(w);
    assert.equal(rows.length, 1);
    const wrong = Object.keys(FACTS).filter((k) => JSON.stringify(rows[0][k]) !== JSON.stringify(FACTS[k]));
    assert.deepEqual(wrong, [], `facts not stored as sent: ${wrong.map((k) => `${k}=${JSON.stringify(rows[0][k])}`).join(", ")}`);
  } finally { w.restore(); }
});

for (const retired of ["ethnicity", "occupation"]) {
  test(`C3: retired ${retired} (rowFromForm never writes it, clonify still sends it) is created 200, never written, reported notStored with the replacement named`, async () => {
    const w = wire();
    try {
      const { status, body } = await create({ hometown: "Austin", [retired]: "kept?" });
      assert.equal(status, 200, JSON.stringify(body));
      const rows = inserted(w);
      assert.equal(rows.length, 1);
      assert.equal(retired in rows[0], false, `${retired} reached the insert: ${JSON.stringify(rows[0][retired])}`);
      assert.equal(rows[0].hometown, "Austin");
      assert.deepEqual(body.notStored, [retired]);
      assert.match(String(body.note), new RegExp(`NOT STORED: ${retired}.*ethnicity_tags.*cover_story`));
      await w.idle();
      const log = w.rest("system_logs", "POST").map((c) => c.body as { detail?: { notStored?: unknown } });
      assert.ok(log.some((l) => JSON.stringify(l.detail?.notStored) === JSON.stringify([retired])), `audit log: ${JSON.stringify(log)}`);
    } finally { w.restore(); }
  });
}

test("C3 control: a money key is still refused 400 by name, nothing inserted", async () => {
  const w = wire();
  try {
    const { status, body } = await create({ hometown: "Austin", starting_credits: 9999 });
    assert.equal(status, 400, JSON.stringify(body));
    assert.match(String(body.error), /starting_credits/);
    assert.equal(inserted(w).length, 0);
  } finally { w.restore(); }
});

test("C11: a caller fact stripped by the missing-column retry is reported as notStored and logged, never a plain created", async () => {
  const w = wire(missingColumn("hometown"));
  try {
    const { status, body } = await create({ hometown: "Austin", hair_color: "brown" });
    assert.equal(status, 200, JSON.stringify(body));
    const rows = inserted(w);
    assert.equal(rows.length, 2, "failed insert plus one retry");
    assert.equal("hometown" in rows[1], false, "fixture: the retry dropped hometown");
    assert.equal(rows[1].hair_color, "brown");
    assert.deepEqual(body.notStored, ["hometown"]);
    await w.idle();
    const log = w.rest("system_logs", "POST").map((c) => c.body as { detail?: { notStored?: unknown } });
    assert.ok(log.some((l) => JSON.stringify(l.detail?.notStored) === JSON.stringify(["hometown"])), `audit log: ${JSON.stringify(log)}`);
  } finally { w.restore(); }
});

test("C11 control: a clean create reports notStored: []", async () => {
  const w = wire();
  try {
    const { status, body } = await create({ hometown: "Austin" });
    assert.equal(status, 200, JSON.stringify(body));
    assert.deepEqual(body.notStored, []);
  } finally { w.restore(); }
});

const actionCreate = (fd: FormData) =>
  inNextRoute("/clones/new", () => withDashboardAccess(null, () => createCloneRow(fd)));
const baseForm = () => {
  const fd = new FormData();
  fd.set("name", "Ui Clone");
  fd.set("bot_token", "888888:" + "y".repeat(20));
  return fd;
};

test("C11: createCloneRow (the UI create form's action) returns the id and the columns it did not store", async () => {
  const w = wire(missingColumn("account_phone"));
  try {
    const fd = baseForm();
    fd.set("account_phone", "+10000000000");
    const result = await actionCreate(fd);
    assert.equal(typeof result.id, "string");
    assert.deepEqual(result.notStored, ["account_phone"]);
  } finally { w.restore(); }
});

test("C5: a create with no credit fields takes BUILTIN_CLONE_DEFAULTS, not a 50/50/199 clone", async () => {
  const w = wire();
  try {
    await actionCreate(baseForm());
    const row = inserted(w)[0];
    assert.ok(row, "createCloneRow never reached the insert");
    assert.equal(row.starting_credits, BUILTIN_CLONE_DEFAULTS.starting_credits);
    assert.equal(row.credit_pack_size, BUILTIN_CLONE_DEFAULTS.credit_pack_size);
    assert.equal(row.credit_pack_price_stars, BUILTIN_CLONE_DEFAULTS.credit_pack_price_stars);
  } finally { w.restore(); }
});
