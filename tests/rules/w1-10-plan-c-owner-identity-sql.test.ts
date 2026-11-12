/**
 * Characterization (W1 lane 10 harness-config F16; RISKS D5 keeps the file; REVIEW.md invariant 8 DDL): the Plan C owner
 * lookup in deployment/dashboard-plan-c-owner-identity.sql stays a locked-down invoker function. It runs as the caller
 * (`security invoker`, never `security definer`) with `set search_path = ''`, inside begin/commit, revokes everything from
 * public, anon AND authenticated, grants execute to service_role and to no other role, and creates no table (no RLS surface).
 * Static read of the SQL text only; nothing is applied. The real-PG proof lives in the backend repo (F16 gap).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const FILE = "deployment/dashboard-plan-c-owner-identity.sql";
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
/** SQL text with `--` comments removed, whitespace collapsed, lower-cased. */
const sql = readFileSync(`${ROOT}/${FILE}`, "utf8").replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const statements = sql.split(";").map(s => s.trim()).filter(Boolean);
const FN = /function public\.dashboard_plan_c_owner_identity\s*\(\s*text\s*\)/;
const roles = (list: string) => list.split(",").map(r => r.trim()).filter(Boolean).sort();

test("plan C owner identity function is security invoker, never definer", () => {
  assert.match(sql, /\bsecurity invoker\b/, `${FILE}: no security invoker`);
  assert.doesNotMatch(sql, /\bsecurity definer\b/, `${FILE}: security definer`);
});

test("plan C owner identity function pins search_path to empty", () => {
  assert.match(sql, /\bset search_path = ''/, `${FILE}: search_path not pinned to ''`);
});

test("plan C owner identity SQL is one transaction (begin first, commit last)", () => {
  assert.equal(statements[0], "begin", `${FILE}: first statement is not begin`);
  assert.equal(statements.at(-1), "commit", `${FILE}: last statement is not commit`);
});

test("plan C owner identity function revokes all from public, anon and authenticated", () => {
  const revoked = statements.filter(s => s.startsWith("revoke all on ") && FN.test(s))
    .flatMap(s => roles(s.replace(/^.*\bfrom\s+/, "")));
  for (const role of ["public", "anon", "authenticated"]) assert.ok(revoked.includes(role), `${FILE}: not revoked from ${role} (revoked: ${revoked.join(", ")})`);
});

test("plan C owner identity SQL grants execute to service_role and to no other role", () => {
  const grants = statements.filter(s => /^grant\b/.test(s));
  const granted = grants.flatMap(s => roles(s.replace(/^.*\bto\s+/, "")));
  assert.deepEqual(granted, ["service_role"], `${FILE}: grants go to ${granted.join(", ") || "nobody"}`);
  assert.ok(grants.some(s => /^grant execute on /.test(s) && FN.test(s)), `${FILE}: no grant execute on the function`);
});

test("plan C owner identity SQL creates no table", () => {
  assert.doesNotMatch(sql, /\bcreate\s+(?:unlogged\s+|temp(?:orary)?\s+)?table\b/, `${FILE}: creates a table (needs RLS + deny-all)`);
});
