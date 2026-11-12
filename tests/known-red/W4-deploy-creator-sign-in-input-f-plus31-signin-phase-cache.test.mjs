// KNOWN RED (W4 F5, F8; docs/review/W4/deploy-creator-sign-in-input-f-plus31.md):
// F5 deployment/creator-sign-in-mobile-fix.cjs replays a cached phase id: a re-run of `health` whose old
// command succeeded prints the stale stdout and sends nothing, so a health check never re-checks.
// F8 the manifest JSON is spliced into a `sudo` shell inside single quotes; JSON.stringify keeps `'`, so a
// quote in the manifest breaks out to a root shell before any digest check.
// Owner = team's Claude. Not wired into npm scripts; init.sh does not run it yet (orchestrator wires it at
// window close). Runs inside node:vm via tests/support/w4-deploy-vm.mjs: child_process (spawnSync recorder
// with canned JSON, shared awsSpawn), fs (in-memory), os (fake tmpdir), process, setTimeout, console all faked;
// anything else throws a HarnessError. No subprocess, no network, no real file write.
// Run: nice -n 10 node --import tsx --test --test-concurrency=1 tests/known-red/W4-deploy-creator-sign-in-input-f-plus31-signin-phase-cache.test.mjs
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { assertNoHarnessGap, AWS_ACCOUNT_RE, awsSpawn, literalFrom, requireTarget, runCjsInVm } from "../support/w4-deploy-vm.mjs";

const TARGET = "deployment/creator-sign-in-mobile-fix.cjs";
const FINDINGS = "F5, F8";
const DIR = "/fake/deployment";
// Read from the target, so renaming the manifest (a natural F8 fix) does not turn into a fake-fs ENOENT.
const sibling = (src, ext, label) => path.join(DIR, literalFrom(src, new RegExp(`path\\.join\\(\\s*__dirname\\s*,\\s*['"]([^'"]+\\.${ext})['"]\\s*\\)`), label));

function newFs(manifest = JSON.stringify({ dashboardCommit: "abc123" })) {
  const src = requireTarget(TARGET, FINDINGS);
  return new Map([[sibling(src, "json", "manifest filename"), manifest], [sibling(src, "py", "python body filename"), "print('fake python body')\n"]]);
}

async function run(mode, files) {
  const src = requireTarget(TARGET, FINDINGS);
  const account = literalFrom(src, AWS_ACCOUNT_RE, "expected AWS account");
  let sent = 0;
  const { spawnSync, calls } = awsSpawn([
    ["get-caller-identity", () => ({ Account: account })],
    ["send-command", () => ({ Command: { CommandId: `${mode}-id-${++sent}-${calls.length}` } })],
    ["get-command-invocation", (args) => ({ Status: "Success", StandardOutputContent: `output of ${args[args.indexOf("--command-id") + 1]}`, StandardErrorContent: "" })],
  ]);
  const r = await runCjsInVm(src, { modules: { child_process: { spawnSync } }, argv: [mode], files, filename: "creator-sign-in-mobile-fix.cjs", dirname: DIR });
  const sends = calls.filter((a) => a.includes("send-command"));
  return { ...r, calls, sends, sentCommands: sends.map((a) => JSON.parse(a[a.indexOf("--parameters") + 1]).commands[0]) };
}

/** Characters a POSIX shell would read outside any quoting, for the command lines up to the heredoc opener. */
function unquoted(command) {
  const lines = command.split("\n");
  const upto = lines.findIndex((l) => l.includes("<<"));
  const text = lines.slice(0, upto < 0 ? lines.length : upto + 1).join("\n");
  let out = "", mode = "plain";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (mode === "single") { if (c === "'") mode = "plain"; continue; }
    if (mode === "double") { if (c === "\\") i++; else if (c === '"') mode = "plain"; continue; }
    if (c === "\\") { i++; continue; }
    if (c === "'") mode = "single"; else if (c === '"') mode = "double"; else out += c;
  }
  return out;
}

test("control F5: empty state, mode health sends a fresh SSM command", async () => {
  const r = await run("health", newFs());
  assertNoHarnessGap(r);
  assert.equal(r.exitCode, undefined, `run failed: ${r.errors.join(" | ")}`);
  assert.equal(r.sends.length, 1);
});

test("F5: a second health run over the same state sends again instead of replaying run 1", async () => {
  const files = newFs();
  const first = await run("health", files);
  assertNoHarnessGap(first);
  assert.equal(first.sends.length, 1, "run 1 must send");
  const second = await run("health", files);
  assertNoHarnessGap(second);
  assert.equal(second.sends.length, 1, `run 2 sent nothing and replayed run 1: ${JSON.stringify(second.logs)}`);
});

test("control F8: a quote-free manifest is sent inside the SSM command", async () => {
  const manifest = JSON.stringify({ dashboardCommit: "abc123" });
  const r = await run("pull", newFs(manifest));
  assertNoHarnessGap(r);
  assert.equal(r.exitCode, undefined, `run failed: ${r.errors.join(" | ")}`);
  assert.equal(r.sends.length, 1);
  const b64 = Buffer.from(manifest).toString("base64");
  assert.ok(r.sentCommands[0].includes(manifest) || r.sentCommands[0].includes(b64), "manifest (raw or base64) must reach the host command");
});

test("F8: a single quote in the manifest never leaves the sudo argument's quoting", async () => {
  const r = await run("pull", newFs(`{"dashboardCommit":"x';id;'"}`));
  assertNoHarnessGap(r);
  // Properly escaped ('\'' or base64) keeps `;id;` inside quotes; a raw splice leaves it for the root shell.
  const raw = r.sentCommands.filter((c) => unquoted(c).includes(";id;"));
  // Sending nothing only counts as a refusal when the target itself failed (exit 1), not when the fake fs did.
  const refused = r.sends.length === 0 && r.exitCode === 1 && !/fake fs/.test(r.errors.join(" "));
  assert.ok(refused || (r.sends.length > 0 && raw.length === 0),
    `sudo command runs the manifest's quote breakout (sends ${r.sends.length}, exit ${r.exitCode}, errors ${JSON.stringify(r.errors)}): ${JSON.stringify(raw.map((c) => c.split("\n")[0]))}`);
});
