// KNOWN RED (W4 F25; docs/review/W4/deploy-creator-sign-in-input-f-plus31.md): the post-deploy probe
// deployment/live-telegram-check.cjs puts every check inside an `if`/loop, so zero v2 creators, or a creator
// with no fans, prints success and exits 0: a probe that checked nothing reports success.
// Owner = team's Claude. Not wired into npm scripts; init.sh does not run it yet (orchestrator wires it at
// window close). Runs inside node:vm via tests/support/w4-deploy-vm.mjs with fetch faked (PostgREST + bot
// upstream answered from fixtures); node:assert and node:crypto are the real (pure) modules; anything else
// throws a HarnessError. No network.
// Run: nice -n 10 node --import tsx --test --test-concurrency=1 tests/known-red/W4-deploy-creator-sign-in-input-f-plus31-telegram-probe-empty.test.mjs
import assert from "node:assert/strict";
import * as nodeCrypto from "node:crypto";
import test from "node:test";
import { assertNoHarnessGap, requireTarget, runCjsInVm } from "../support/w4-deploy-vm.mjs";

const TARGET = "deployment/live-telegram-check.cjs";
const DB = "https://fake-project.invalid";
const BOT = "http://bot.invalid";
// roster() answers any read it does not route with 404, so "Database read 404" means the fixture missed a read
// (an unrouted fetch), not that the probe checked something. Harness gaps are caught by assertNoHarnessGap.
const NOT_A_PROBE_FAILURE = /Database read 404/;

async function run(route) {
  const fetch = async (url) => {
    const [status, body] = route(String(url));
    return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null } };
  };
  const r = await runCjsInVm(requireTarget(TARGET, "F25"), {
    modules: { "assert/strict": assert, crypto: nodeCrypto },
    env: { SUPABASE_URL: DB, SUPABASE_SERVICE_KEY: "fake-not-a-key", BOT_V2_URL: BOT },
    fetch, filename: "live-telegram-check.cjs",
  });
  return { ...r, failed: r.exitCode === 1 || r.thrown !== null };
}

const creator = { id: "c1", name: "Fixture Creator", slug: "fixture", engine: "v2" };
const roster = (creators, fans) => (url) => {
  if (url.startsWith(`${DB}/rest/v1/clones`)) return [200, creators];
  if (url.startsWith(`${BOT}/api/fans`)) return fans;
  return [404, null];
};

function assertProbeFailure(r, label) {
  assertNoHarnessGap(r);
  assert.ok(r.failed, `${label} passed: exitCode ${r.exitCode}, stdout ${JSON.stringify(r.logs)}`);
  const why = [r.thrown?.message, ...r.errors].filter(Boolean).join(" | ");
  assert.doesNotMatch(why, NOT_A_PROBE_FAILURE, "failure must come from the probe's own check, not the harness or an unrouted read");
}

test("control: a v2 creator whose fan list returns 500 fails the probe", async () => {
  const r = await run(roster([creator], [500, { error: "boom" }]));
  assertProbeFailure(r, "fan list 500");
  assert.match(r.errors.join(" "), /fan list 500/);
});

test("F25: zero v2 creators fails the probe instead of printing success", async () => {
  assertProbeFailure(await run(roster([], [500, null])), "empty roster");
});

test("F25: a v2 creator with no fans fails the probe instead of printing success", async () => {
  assertProbeFailure(await run(roster([creator], [200, []])), "creator without fans");
});
