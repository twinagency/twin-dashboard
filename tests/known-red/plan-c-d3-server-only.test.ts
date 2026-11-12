/**
 * KNOWN RED (W1 lane 1 finding 1, structure S1; docs/RISKS.md decision D3; REVIEW.md "scripts reachable by tsx importing
 * server-only code"). lib/onlyfans/plan-c-owner.ts:1 does `import "server-only"`, and lib/onlyfans/route.ts:11 imports it, so
 * every tsx script that reaches route.ts (scripts/check-onlyfans-launch.ts via lib/onlyfans/launch/a-route.ts) dies with
 * "Cannot find module 'server-only'" before running a single check. That breaks `npm run test:onlyfans-launch` and `test:offline`.
 * The red asserts the script ran (no spawn error or timeout, a node:test summary printed) and never mentions server-only. The
 * child gets `--test-reporter=spec` so the summary format does not depend on the Node version's non-TTY default (TAP `# tests N`
 * on Node 22, which .nvmrc and ci.yml:27 pin; spec `ℹ tests N` on 23+); the regex accepts both. Measured on Node 23.6.1 only.
 * It does NOT assert the exit code, so an unrelated launch-check failure is not conflated with D3.
 * The script was grepped before spawning: fake `fetchImpl` at https://b.example only, no env, no localhost.
 * Turns green when no script-reachable module imports server-only (D3: the Plan C gate resolves the owner itself; route.ts drops
 * pilotIdentity/pilotActor; lib/onlyfans/launch/b-native-routes.ts:5 too).
 * Team's Claude owns the fix. Not wired into npm scripts.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { spawnTsx } from "../rules/plan-c-fixtures";

const SUMMARY = /^(?:ℹ|#) tests \d+$/m;
const runScript = (relative: string) => spawnTsx(fileURLToPath(new URL(relative, import.meta.url)), [], ["--test-reporter=spec"]);

test("control: the harness spawns a tsx node:test script that loads plan-c-owner-core.ts and sees its summary", () => {
  const result = runScript("../rules/plan-c-owner-fail-closed.test.ts");
  assert.equal(result.error, undefined, String(result.error));
  assert.match(result.stdout, SUMMARY);
  assert.doesNotMatch(result.stderr + result.stdout, /server-only/);
});

test("finding 1 (D3): scripts/check-onlyfans-launch.ts gets past its imports and runs its checks", () => {
  const result = runScript("../../scripts/check-onlyfans-launch.ts");
  assert.equal(result.error, undefined, `spawn failed or timed out: ${String(result.error)}`);
  assert.doesNotMatch(result.stderr, /Cannot find module 'server-only'/, "a tsx script reaches lib/onlyfans/plan-c-owner.ts through route.ts");
  assert.match(result.stdout, SUMMARY, "the launch checks never ran (no node:test summary)");
});
