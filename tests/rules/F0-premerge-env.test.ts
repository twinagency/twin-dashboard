/**
 * Rule (F0, S1): scripts/premerge.sh children get DOTENV_CONFIG_PATH=/dev/null and the caller's TMPDIR, and nothing else inherited,
 * so a suite cannot pick up a repo .env or a caller's secret. Drives the real script in a temp git repo with a stub npm.
 * Run: nice -n 10 node --import tsx --test tests/rules/F0-premerge-env.test.ts
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const tmp = (p: string) => mkdtempSync(join(tmpdir(), p));

test("premerge.sh children get DOTENV_CONFIG_PATH=/dev/null and the caller's TMPDIR, and nothing else inherited", () => {
  const repo = tmp("f0-pre-");
  const stub = tmp("f0-npm-");
  const td = tmp("f0-td-");
  const out = join(stub, "env.log");
  mkdirSync(join(repo, "scripts"));
  copyFileSync("scripts/premerge.sh", join(repo, "scripts/premerge.sh"));
  writeFileSync(join(stub, "npm"), `#!/bin/sh\nenv >>"${out}"\n`); // every suite is an npm run
  chmodSync(join(stub, "npm"), 0o755);
  const commit = ["-c", "user.name=f0", "-c", "user.email=f0@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "f0"];
  for (const a of [["init", "-q"], ["add", "."], commit]) execFileSync("git", a, { cwd: repo });
  const env = { PATH: `${stub}:${process.env.PATH}`, HOME: process.env.HOME, TMPDIR: td, PREMERGE_BASE: "HEAD", F0_LEAK: "sentinel-leak" };
  execFileSync("bash", ["scripts/premerge.sh"], { cwd: repo, env: { ...env, NODE_ENV: "test" as const } });
  const seen = readFileSync(out, "utf8");
  assert.match(seen, /^DOTENV_CONFIG_PATH=\/dev\/null$/m);
  assert.ok(seen.split("\n").includes(`TMPDIR=${td}`), seen);
  assert.ok(!seen.includes("sentinel-leak"));
});
