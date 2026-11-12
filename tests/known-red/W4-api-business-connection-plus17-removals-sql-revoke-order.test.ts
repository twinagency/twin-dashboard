// KNOWN RED (W4 api-business-connection-plus17 D1): deployment/creator-file-removals.sql has no begin/commit and
// creates the SECURITY DEFINER RPCs begin_/finish_creator_file_removal at :19/:59 but revokes PUBLIC/anon/authenticated
// EXECUTE only at :122-123, after the trigger function and ten trigger statements on five live tables. Applied statement
// by statement (psql -f, autocommit), any failure in between leaves both RPCs executable by anon through
// /rest/v1/rpc/finish_creator_file_removal (Postgres grants EXECUTE to PUBLIC by default).
// Fixed looks like: the file runs in one transaction (begin; ... commit;), or each RPC-callable SECURITY DEFINER
// function's revoke follows its create before any other statement (as deployment/creator-combined-content.sql:47 does).
// Accepted shapes: `set ...;` statements (e.g. lock_timeout) before the begin; the three caller roles in any order and
// case, in one revoke or split across several (grants on the same function may sit in between).
// STATIC TEXT ANALYSIS ONLY: the SQL is read with fs and never executed. Trigger functions (returns trigger) are out
// of scope: PostgREST cannot call them.
// Team's Claude owns the fix. Not wired into npm scripts.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = (name: string) => readFileSync(join(process.cwd(), "deployment", name), "utf8");

/** Top-level statements, with -- and block comments dropped and '...' / $tag$...$tag$ bodies kept intact. */
function statements(text: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < text.length;) {
    const rest = text.slice(i);
    if (rest.startsWith("--")) { const nl = text.indexOf("\n", i); i = nl < 0 ? text.length : nl; continue; }
    if (rest.startsWith("/*")) { const end = text.indexOf("*/", i + 2); i = end < 0 ? text.length : end + 2; continue; }
    const dollar = /^\$[A-Za-z_]*\$/.exec(rest);
    if (dollar) { const end = text.indexOf(dollar[0], i + dollar[0].length); const stop = end < 0 ? text.length : end + dollar[0].length; cur += text.slice(i, stop); i = stop; continue; }
    if (text[i] === "'") { let j = i + 1; while (j < text.length && !(text[j] === "'" && text[j + 1] !== "'")) j += text[j] === "'" ? 2 : 1; cur += text.slice(i, j + 1); i = j + 1; continue; }
    if (text[i] === ";") { if (cur.trim()) out.push(cur.trim().replace(/\s+/g, " ")); cur = ""; i++; continue; }
    cur += text[i++];
  }
  if (cur.trim()) out.push(cur.trim().replace(/\s+/g, " "));
  return out;
}

const CREATE_FN = /^create (?:or replace )?function (?:public\.)?([a-z_]+)\s*\(/i;
const CALLERS = ["public", "anon", "authenticated"];
const isRpcDefiner = (s: string) => CREATE_FN.test(s) && /\bsecurity definer\b/i.test(s) && !/\breturns trigger\b/i.test(s);
/** A revoke/grant on function `fn` (schema-qualified or not, any privilege list). */
const touches = (s: string, fn: string) => new RegExp(`^(?:revoke|grant) [a-z ,]* on function (?:public\\.)?${fn}\\s*\\(`, "i").test(s);
/** The roles a revoke on `fn` removes, lower-cased; [] for anything else. */
function revokedFrom(s: string, fn: string): string[] {
  if (!touches(s, fn) || !/^revoke /i.test(s)) return [];
  const m = /\)\s*from\s+(.+?)(?:\s+(?:cascade|restrict))?$/i.exec(s);
  return m ? m[1].split(",").map(r => r.trim().toLowerCase()) : [];
}

/**
 * For each RPC-callable SECURITY DEFINER function: the statements (other than revokes/grants on that function) that run
 * after its create and before PUBLIC, anon and authenticated have all been revoked, in any order, case-insensitive,
 * in one revoke or split across several.
 */
function exposureGaps(stmts: string[]) {
  return stmts.flatMap((s, i) => {
    if (!isRpcDefiner(s)) return [];
    const fn = CREATE_FN.exec(s)![1].toLowerCase();
    const pending = new Set(CALLERS);
    const between: string[] = [];
    for (const t of stmts.slice(i + 1)) {
      if (!pending.size) break;
      if (touches(t, fn)) revokedFrom(t, fn).forEach(r => pending.delete(r));
      else between.push(t.slice(0, 70));
    }
    return [{ fn, revoked: pending.size === 0, between }];
  });
}
/** begin ... commit around the whole file; `set ...` statements (e.g. lock_timeout) may precede the begin. */
function inOneTransaction(stmts: string[]) {
  const body = stmts.slice(stmts.findIndex(s => !/^set\s/i.test(s)));
  return /^(begin|start transaction)\b/i.test(body[0] ?? "") && /^(commit|end)\b/i.test(body[body.length - 1] ?? "");
}

test("control: creator-combined-content.sql revokes claim_creator_upload right after creating it", () => {
  const stmts = statements(sql("creator-combined-content.sql"));
  const gaps = exposureGaps(stmts);
  assert.deepEqual(gaps.map(g => g.fn), ["claim_creator_upload"], "the one SECURITY DEFINER RPC is found");
  assert.deepEqual(gaps, [{ fn: "claim_creator_upload", revoked: true, between: [] }]);
});

test("control: the splitter sees the removals file's RPCs, their revokes and the trigger statements", () => {
  const stmts = statements(sql("creator-file-removals.sql"));
  assert.deepEqual(exposureGaps(stmts).map(g => [g.fn, g.revoked]),
    [["begin_creator_file_removal", true], ["finish_creator_file_removal", true]]);
  assert.ok(stmts.filter(s => /^create (?:or replace )?trigger /i.test(s)).length >= 5, "the five reference triggers split as statements");
});

test("control: the checker accepts every valid fix shape and rejects a late revoke", () => {
  const fn = (name: string) => `create or replace function public.${name}(p uuid) returns boolean language plpgsql security definer set search_path='' as $$ begin return true; end; $$;`;
  const other = "drop trigger if exists t on public.photos;";
  const split = `${fn("f")} revoke all on function public.f(uuid) from AUTHENTICATED; grant execute on function public.f(uuid) to service_role;
    revoke execute on function f(uuid) from anon, Public; ${other}`;
  assert.deepEqual(exposureGaps(statements(split)), [{ fn: "f", revoked: true, between: [] }], "split, reordered, mixed-case revokes");
  assert.ok(inOneTransaction(statements(`set lock_timeout = '5s'; set statement_timeout = 0; begin; ${fn("f")} ${other} commit;`)), "set before begin");
  const late = statements(`${fn("f")} ${other} revoke all on function public.f(uuid) from public, anon, authenticated;`);
  assert.equal(inOneTransaction(late), false);
  assert.deepEqual(exposureGaps(late).map(g => g.between.length), [1], "an unrelated statement before the revoke is a gap");
});

test("D1: creator-file-removals.sql never leaves a SECURITY DEFINER RPC callable by anon between statements", () => {
  const stmts = statements(sql("creator-file-removals.sql"));
  if (inOneTransaction(stmts)) return;
  const exposed = exposureGaps(stmts).filter(g => !g.revoked || g.between.length);
  assert.deepEqual(exposed.map(g => `${g.fn}: ${g.between.length} statement(s) before its revoke, first "${g.between[0]}"`), [],
    "not in one transaction, and anon can EXECUTE these RPCs until the revoke runs");
});
