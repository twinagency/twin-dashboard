import "../support/admin-route-env";
/**
 * KNOWN RED (W4 lib-api-public-v2-plus6 F22, F23; docs/review/W4/lib-api-public-v2-plus6.md): lib/api-read.ts
 * resolveClone, which every admin route with a `clone` input uses (incl. the write routes clones/write, posting/write,
 * media). Drives the real function (real supabase-js through lib/supabase.ts) with PostgREST faked at the wire
 * (tests/support/admin-wire.ts). MODELLED: clones.id is uuid-typed, so `id=eq.<not a uuid>` answers 22P02
 * (uuidIdColumn in tests/support/W4-lib-api-public-v2-plus6-extras.ts), as Postgres does; that error is how a slug
 * falls through to the slug lookup today, so the control proves a fix keeps slugs working.
 * F22: the name fallback is `.ilike("name", input).limit(1)` unescaped and unordered, so input "%" resolves to an
 *   arbitrary clone. Fixed = no clone (null) for a wildcard. Two cases: "%" (matches both fixture clones) and
 *   "Other%" / "Other_Clone" (each matches exactly one), so refusing only AMBIGUOUS matches does not pass. The control
 *   keeps the case-insensitive name match ("other clone"), so an exact `eq` name match does not pass either.
 * F23: no `.error` is read; when every clones read fails (statement timeout) resolveClone resolves null and the route
 *   answers 404 "no clone matching". Fixed = it rejects (route answers 5xx).
 * Team's Claude owns the fix. Not wired into npm scripts on purpose.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { CLONE_ID, OTHER_CLONE_ID, installWire } from "../support/admin-wire";
import { settle, statementTimeout, uuidIdColumn } from "../support/W4-lib-api-public-v2-plus6-extras";
import { resolveClone } from "../../lib/api-read";

const CLONES = [
  { id: CLONE_ID, slug: "fake-clone", name: "Fake Clone" },
  { id: OTHER_CLONE_ID, slug: "other-clone", name: "Other Clone" },
];
const healthy = () => installWire({ tables: { clones: CLONES }, override: uuidIdColumn(["clones"]) });

// Name match is case-insensitive today (lib/api-read.ts:223 ilike); a fix must keep that, so "other clone" stays in.
test("control: resolves by id, by slug and by name (exact or other case); unknown input is null", async () => {
  const w = healthy();
  try {
    assert.equal((await resolveClone(OTHER_CLONE_ID))?.slug, "other-clone");
    assert.equal((await resolveClone("other-clone"))?.id, OTHER_CLONE_ID);
    assert.equal((await resolveClone("Other Clone"))?.id, OTHER_CLONE_ID);
    assert.equal((await resolveClone("other clone"))?.id, OTHER_CLONE_ID);
    assert.equal(await resolveClone("no-such-clone"), null);
  } finally { w.restore(); }
});

test("F22: a wildcard name (%) resolves no clone", async () => {
  const w = healthy();
  try {
    const r = await resolveClone("%");
    assert.equal(r, null, `"%" resolved clone ${JSON.stringify(r)}`);
  } finally { w.restore(); }
});

test("F22: a wildcard name matching exactly one clone (Other%, Other_Clone) resolves no clone", async () => {
  const w = healthy();
  try {
    for (const input of ["Other%", "Other_Clone"]) {
      const r = await resolveClone(input);
      assert.equal(r, null, `${JSON.stringify(input)} resolved clone ${JSON.stringify(r)}`);
    }
  } finally { w.restore(); }
});

test("F23: when every clones read fails, resolveClone rejects instead of reporting no clone", async () => {
  const w = installWire({ tables: { clones: CLONES }, override: (c) => (c.table === "clones" ? statementTimeout() : undefined) });
  try {
    const r = await settle(resolveClone("fake-clone"));
    assert.equal(r.ok, false, `a database outage reads as 'no clone matching': resolved ${r.ok ? JSON.stringify(r.value) : ""}`);
  } finally { w.restore(); }
});
