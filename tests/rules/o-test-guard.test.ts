/**
 * Rule o (handover/TEAM-BRIEFING.md §7, REVIEW.md invariant 8): no assertion is weakened silently. Every commit between
 * the base and HEAD that deletes or changes an assertion line under tests/ or scripts/check-* must say why on a
 * `TEST-CHANGE:` line in its message. Base: $TEST_GUARD_BASE, else the takeover branch this work started from.
 * Offline: local git only. Fails (never skips) when no base can be found.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const git = (...args: string[]) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const BASES = [process.env.TEST_GUARD_BASE, "jaka/takeover-20261111", "origin/jaka/takeover-20261111"].filter((ref): ref is string => !!ref);
const PATHS = ["tests", ":(glob)scripts/check-*"];
/** A line that asserts something: node:assert, chai/jest style, or the scripts' own assert helpers. */
const ASSERTION = /\bassert\b|\bassert\.|\bexpect\(|\.(?:equal|deepEqual|strictEqual|notEqual|match|doesNotMatch|ok|throws|rejects|fail)\(/;

function base(): string {
  for (const ref of BASES) { try { return git("merge-base", "HEAD", ref).trim(); } catch { /* try the next candidate */ } }
  throw new Error(`no test-guard base found (tried ${BASES.join(", ")}); set TEST_GUARD_BASE to the branch this work started from`);
}

/** Assertion lines a commit removed (a changed line shows as removed plus added). */
export function removedAssertions(sha: string): string[] {
  return git("show", "--format=", "--no-color", "--no-ext-diff", "-U0", sha, "--", ...PATHS).split("\n")
    .filter(line => line.startsWith("-") && !line.startsWith("---") && ASSERTION.test(line));
}

test("every commit since the base that deletes or changes an assertion carries a TEST-CHANGE: line", () => {
  const from = base();
  const commits = git("rev-list", "--no-merges", `${from}..HEAD`).split("\n").filter(Boolean);
  const silent = commits.flatMap(sha => {
    const removed = removedAssertions(sha);
    if (!removed.length || /^TEST-CHANGE:\s*\S/m.test(git("log", "-1", "--format=%B", sha))) return [];
    return [`${sha.slice(0, 8)} ${git("log", "-1", "--format=%s", sha).trim()}: ${removed.length} assertion line(s) removed or changed, e.g. ${removed[0].slice(0, 100)}`];
  });
  assert.deepEqual(silent, [], "add a TEST-CHANGE: <why> line to these commit messages, or restore the assertions");
});
