/**
 * Rule (F0, D9): scripts/check-plan.ts decides per mode what scripts/check.sh runs: premerge first, then promoted, NEEDS (full only,
 * its env) and OWNER (never, listed) leaves, a leaf being a same-tag run of one && chain; it refuses what it cannot parse and dead entries.
 * Control: the real package.json plans, and every script file a test:* script names is premerge's or in a row. The real NEEDS/OWNER files keep their actions (listed in the test).
 * Run: nice -n 10 node --import tsx --test tests/rules/F0-check-plan.test.ts
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { classify, plan, premergeSuites, rows, testScripts } from "../../scripts/check-plan";

const FIX: Record<string, string> = {
  "test:p": "tsx p.ts", // premerge covers it
  "test:a": "node a.ts && node b.mjs", // a build && check pair: one step
  "test:m": "npm run test:p && tsx n.ts && tsx o.ts && node a.ts", // followed npm run, NEEDS, OWNER, already planned
  "test:z": "node z.ts && tsx n.ts && node z.ts --again", // same name twice
};
const want = (mode: string) => {
  const leaves = plan(FIX, ["test:p"], { "n.ts": ["rig", ["E"]] }, ["o.ts"]);
  return rows(mode, leaves).map((r) => [r.name, r.action, r.note, r.env.join(" "), r.cmd]);
};
const files = (text: string) => text.match(/[\w./-]+\.[cm]?[jt]sx?\b/g) ?? [];

test("control: the real package.json plans, and every script file named by a test:* script is premerge's or in a row", () => {
  const scripts: Record<string, string> = JSON.parse(readFileSync("package.json", "utf8")).scripts;
  const covered = premergeSuites();
  assert.ok(covered.includes("test:rules"), covered.join(" "));
  assert.ok(covered.every((n) => n in scripts), covered.join(" "));
  const cli = execFileSync("node", ["--import", "tsx", "scripts/check-plan.ts", "fast"], { encoding: "utf8" });
  const out = cli.trim().split("\n").map((l) => l.split("\x1f"));
  assert.deepEqual(out[0], ["premerge", "run", "", "PREMERGE_BASE", "scripts/premerge.sh"]);
  assert.equal(new Set(out.map((r) => r[0])).size, out.length, "duplicate row names");
  // independent of leavesOf(): a regex closure over `npm run` from premerge's suites
  const reach = (n: string): string[] => [n, ...[...scripts[n].matchAll(/npm run (?:-s )?(\S+)/g)].flatMap((m) => reach(m[1]))];
  const premergeFiles = covered.flatMap(reach).flatMap((n) => files(scripts[n]));
  const have = new Set([...premergeFiles, ...out.flatMap((r) => files(r[4]))]);
  const named = testScripts(scripts).flatMap((n) => files(scripts[n]));
  assert.deepEqual(named.filter((f) => !have.has(f)), []);
});

// Listed here, not read from NEEDS/OWNER: dropping an entry there must turn this red, not quietly promote the file to `run`.
const REAL_NEEDS = [
  "check-commercial-category-http.ts", "build-engine-journey.mjs", "check-engine-journey.mjs", "check-ai-models.ts",
  "check-mini-app-sell-toggle.ts", "check-sequence-render.ts", "check-sequence-ui.ts", "check-media-repair-db.ts",
  "check-creator-video-upload.cjs", "check-onlyfans-agency-http.ts",
];
const REAL_OWNER = ["check-revenue-rollups.ts", "check-window-tiles.ts", "check-users-tile.ts", "check-conversation-funnel.ts", "check-buyer-conversion.ts"];
test("the real package: each NEEDS file is skipped in fast and run in full, each OWNER file skipped in both", () => {
  const cli = (mode: string) => execFileSync("node", ["--import", "tsx", "scripts/check-plan.ts", mode], { encoding: "utf8" }).trim().split("\n").map((l) => l.split("\x1f"));
  const fast = cli("fast");
  const full = cli("full");
  const of = (out: string[][], f: string) => out.filter((r) => files(r[4]).some((x) => x.endsWith(`/${f}`) || x === f)).map((r) => [r[1], r[2].replace(/needs .*/, "needs")]);
  for (const f of REAL_NEEDS) {
    assert.deepEqual(of(fast, f), [["skip", "full only, needs"]], `fast ${f}`);
    assert.deepEqual(of(full, f), [["run", ""]], `full ${f}`);
  }
  for (const f of REAL_OWNER) {
    for (const out of [fast, full]) assert.deepEqual(of(out, f), [["skip", "never run by this harness: needs"]], f);
  }
});

test("rows per mode, literally: premerge first, && pairs grouped, NEEDS full only with its env, OWNER never, names unique", () => {
  const owner = ["test:m/o", "skip", "never run by this harness: needs live-shaped data; owner-run only", "", "tsx o.ts"];
  const fast = [
    ["premerge", "run", "", "PREMERGE_BASE", "scripts/premerge.sh"],
    ["test:a/a", "run", "", "", "node a.ts && node b.mjs"],
    ["test:m/n", "skip", "full only, needs rig", "E", "tsx n.ts"],
    owner,
    ["test:z/z", "run", "", "", "node z.ts"],
    ["test:z/z#2", "run", "", "", "node z.ts --again"],
  ];
  assert.deepEqual(want("fast"), fast);
  assert.deepEqual(want("full"), fast.map((r) => (r[0] === "test:m/n" ? ["test:m/n", "run", "", "E", "tsx n.ts"] : r)));
  assert.deepEqual(want("plan").map((r) => r[1]), ["plan", "plan", "skip", "skip", "plan", "plan"]);
  assert.throws(() => want("exec"), /unknown mode/);
  assert.equal(classify("tsx o.ts n.ts", { "n.ts": ["rig"] }, ["o.ts"]).kind, "owner"); // OWNER wins over NEEDS
});

test("plan() throws on separators it does not parse, npm runs it cannot follow, and unused NEEDS/OWNER entries", () => {
  const base = { "test:a": "node a.ts" };
  const seps = ["node a.ts; node b.ts", "node a.ts || true", "node a.ts | tee x", "false & true", "node a.ts &", "false\ntrue"];
  for (const bad of [...seps, "npm run nope", "npm run test:a -- --flag"]) {
    assert.throws(() => plan({ ...base, "test:b": bad }, [], {}, []), /cannot|no such script/, bad);
  }
  assert.throws(() => plan(base, [], { "gone.ts": ["x"] }, []), /gone\.ts/);
  assert.throws(() => plan(base, [], {}, ["gone.ts"]), /gone\.ts/);
  assert.throws(() => plan(base, ["test:a"], { "a.ts": ["x"] }, []), /a\.ts/); // covered by premerge, so the entry is dead
});
