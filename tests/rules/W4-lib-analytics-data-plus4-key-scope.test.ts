/**
 * CLAUDE.md "The Twin public API": keys are sha256, never plaintext, and a fleet key must be ASKED FOR. createKey never
 * mints fleet from a missing model; validateKeyRequest (lib/api-keys-admin.ts) requires the scope. Characterization
 * (green): validateKeyRequest refuses a missing/unknown scope, a fleet key naming a clone, a clone key with no clone and
 * an empty label; createKey (real supabase-js against the in-memory PostgREST fake at fetch) inserts key_hash = sha256 of
 * the returned key, never the plaintext, and stores scope "fleet" with clone_id null only when fleet is asked for.
 * Fake: tests/support/postgrest-wire.ts (any other host throws, any unmodelled request or filter fails the test).
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { CLONE, rowsReply, useWire } from "../support/postgrest-wire";
import { createKey, validateKeyRequest } from "../../lib/api-keys-admin";
import type { KeyScope } from "../../lib/api-tenant";

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const wire = useWire((w) => {
  w.on("GET /rest/v1/clones", rowsReply([{ id: CLONE }]));
  w.on("POST /rest/v1/api_keys", () => ({ status: 201 }));
});
// Two-arg call through a cast: still compiles if createKey's scope default is removed (F39), and then must refuse.
const createKeyNoScope = createKey as unknown as (cloneId: string | null, label: string) => ReturnType<typeof createKey>;
const inserts = () => wire.calls("POST /rest/v1/api_keys").map((r) => r.body as Record<string, unknown>);

test("validateKeyRequest: only an explicit scope with the matching clone shape is accepted", () => {
  const clone = validateKeyRequest(CLONE, " a label ", "clone");
  assert.equal(clone.ok, true);
  assert.equal(clone.ok && clone.label, "a label");
  const fleet = validateKeyRequest(null, "a label", "fleet");
  assert.equal(fleet.ok, true);
  assert.equal(fleet.ok && fleet.label, "a label");
  assert.equal(validateKeyRequest(null, "a label", undefined as unknown as KeyScope).ok, false, "missing scope");
  assert.equal(validateKeyRequest(null, "a label", "FLEET" as KeyScope).ok, false, "unknown scope");
  assert.equal(validateKeyRequest(CLONE, "a label", "fleet").ok, false, "fleet naming a clone");
  assert.equal(validateKeyRequest(null, "a label", "clone").ok, false, "clone key with no clone");
  assert.equal(validateKeyRequest("", "a label", "clone").ok, false, "clone key with empty clone");
  assert.equal(validateKeyRequest(CLONE, "   ", "clone").ok, false, "empty label");
});

test("createKey without a model never mints a fleet key", async () => {
  const r = await createKeyNoScope(null, "a label");
  assert.equal(r.ok, false);
  assert.equal(inserts().length, 0, "an api_keys row was inserted");
});

test("createKey for a clone stores sha256(key) and never the plaintext", async () => {
  const r = await createKey(CLONE, "a label", "clone");
  assert.ok(r.ok, "clone key minted");
  if (!r.ok) return;
  const [row, ...rest] = inserts();
  assert.equal(rest.length, 0);
  assert.equal(row.key_hash, sha256(r.key));
  assert.equal(row.key_prefix, r.key.slice(0, 8));
  assert.equal(row.scope, "clone");
  assert.equal(row.clone_id, CLONE);
  assert.ok(!JSON.stringify(row).includes(r.key), "plaintext key in the insert body");
});

test("createKey stores scope fleet with clone_id null only when fleet is asked for", async () => {
  const r = await createKey(null, "a label", "fleet");
  assert.ok(r.ok, "fleet key minted when asked for");
  if (!r.ok) return;
  const [row] = inserts();
  assert.equal(row.scope, "fleet");
  assert.equal(row.clone_id, null);
  assert.equal(row.key_hash, sha256(r.key));
  assert.ok(!JSON.stringify(row).includes(r.key));
  assert.equal(wire.calls("GET /rest/v1/clones").length, 0);
  const named = await createKey(CLONE, "a label", "fleet");
  assert.equal(named.ok, false, "a fleet key naming a clone");
  assert.equal(inserts().length, 1);
});
