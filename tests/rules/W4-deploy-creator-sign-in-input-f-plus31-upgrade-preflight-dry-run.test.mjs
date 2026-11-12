// RULE (W4 deploy-creator-sign-in-input-f-plus31): deployment/creator-sign-in-upgrade-preflight.cjs is
// "Read-only/dry-run": every mutating AWS call (anything that is not describe-*/get-*/list-*) carries
// --dry-run, and a wrong AWS account stops it before any EC2 call.
// Runs inside node:vm via tests/support/w4-deploy-vm.mjs with child_process faked: spawnSync is a recorder
// returning canned JSON, and a --dry-run call answers like AWS does (exit 255, DryRunOperation on stderr).
// The expected account and instance id are read from the target. No subprocess, no AWS. Skips if retired.
import assert from "node:assert/strict";
import test from "node:test";
import { assertNoHarnessGap, AWS_ACCOUNT_RE, awsRaw, awsSpawn, lastJson, literalFrom, readTarget, runCjsInVm } from "../support/w4-deploy-vm.mjs";

const TARGET = "deployment/creator-sign-in-upgrade-preflight.cjs";
const SRC = readTarget(TARGET);

const price = (usd) => JSON.stringify({ terms: { OnDemand: { t: { priceDimensions: { d: { unit: "Hrs", beginRange: "0", pricePerUnit: { USD: usd } } } } } } });

async function run(wrongAccount = false) {
  const account = literalFrom(SRC, AWS_ACCOUNT_RE, "expected AWS account");
  const instance = literalFrom(SRC, /\binstance\s*=\s*['"](i-[0-9a-f]+)['"]/, "instance id");
  const { spawnSync, calls } = awsSpawn([
    ["--dry-run", () => awsRaw(255, "An error occurred (DryRunOperation) when calling the operation: Request would have succeeded, but DryRun flag is set.")],
    ["get-caller-identity", () => ({ Account: wrongAccount ? "000000000000" : account })],
    ["describe-instances", () => ({ Reservations: [{ Instances: [{ InstanceId: instance, InstanceType: "t3.small", Architecture: "x86_64", RootDeviceType: "ebs", Tags: [], BlockDeviceMappings: [{ Ebs: { VolumeId: "vol-fake1" } }] }] }] })],
    ["describe-addresses", () => ({ Addresses: [{ PublicIp: "192.0.2.1" }] })],
    ["get-products", (args) => ({ PriceList: [price(args.join(" ").includes("t3.medium") ? "0.0528" : "0.0264")] })],
    ["describe-volumes", () => ({ Volumes: [{ VolumeId: "vol-fake1", Size: 30, Encrypted: true }] })],
    [() => true, () => ({})], // a mutating call without --dry-run "succeeds" here, so the recorder sees it
  ]);
  const r = await runCjsInVm(SRC, { modules: { child_process: { spawnSync } }, filename: "creator-sign-in-upgrade-preflight.cjs" });
  return { ...r, calls };
}

// The AWS sub-command is the first argument after the service name; the service follows the global flags.
const SERVICES = new Set(["ec2", "sts", "pricing", "ssm", "iam", "autoscaling"]);
const op = (args) => { const i = args.findIndex((a) => SERVICES.has(a)); return i < 0 ? ["?", "?"] : [args[i], args[i + 1]]; };
const isReadOnly = ([, sub]) => /^(describe|get|list)-/.test(sub);

test("every mutating AWS call carries --dry-run, and the stop/start/resize/snapshot probes all run", async (t) => {
  if (SRC === null) return t.skip(`target retired: ${TARGET}`);
  const r = await run();
  assertNoHarnessGap(r);
  const mutating = r.calls.filter((a) => !isReadOnly(op(a)));
  const undry = mutating.filter((a) => !a.includes("--dry-run")).map((a) => op(a).join(" "));
  assert.deepEqual(undry, [], "mutating AWS call without --dry-run");
  assert.equal(r.thrown, null, `preflight threw: ${r.thrown?.message}`);
  const subs = new Set(mutating.map((a) => op(a)[1]));
  for (const s of ["stop-instances", "start-instances", "modify-instance-attribute", "create-snapshot"]) assert.ok(subs.has(s), `${s} dry-run probe missing`);
  assert.equal(lastJson(r.logs)?.changesApplied, false, "report must say changesApplied: false");
});

test("a wrong AWS account stops the preflight before any EC2 call", async (t) => {
  if (SRC === null) return t.skip(`target retired: ${TARGET}`);
  const r = await run(true);
  assertNoHarnessGap(r);
  assert.match(r.thrown?.message ?? "", /Wrong AWS account/);
  assert.deepEqual(r.calls.map((a) => op(a).join(" ")), ["sts get-caller-identity"]);
});
