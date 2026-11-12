/**
 * Characterization (W1 lane 10 harness-config F9; RISKS D4): the four tsconfig programs that `npm run typecheck` runs
 * (tsconfig.json, tsconfig.{scripts,preview,tests}.json) partition the repo's TypeScript. Every .ts/.tsx file git sees
 * outside node_modules (tracked, plus untracked-but-not-ignored as in n-no-credentials.test.ts:48-49, so an uncommitted
 * new file is caught too) is in EXACTLY one program: none falls through (a new top-level dir such as `slop/` would be
 * type-checked by nothing) and none is checked twice. Gitignored files (next-env.d.ts, .next/types) are skipped.
 * Uses `tsc --showConfig` file lists only; no type check runs. Offline: git + local tsc.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const PROGRAMS = ["tsconfig.json", "tsconfig.scripts.json", "tsconfig.preview.json", "tsconfig.tests.json"];
const TSC = path.join(ROOT, "node_modules/.bin/tsc");
const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

function programFiles(cfg: string): Set<string> {
  const files: string[] = JSON.parse(run(TSC, ["--showConfig", "-p", cfg])).files ?? [];
  return new Set(files.map(f => path.relative(ROOT, path.resolve(ROOT, f)).split(path.sep).join("/")));
}

test("every tracked or untracked-unignored .ts/.tsx is in exactly one of the four typecheck programs", t => {
  const list = (extra: string[]) => run("git", ["ls-files", "-z", ...extra, "--", "*.ts", "*.tsx"]).split("\0");
  const tracked = [...new Set([...list([]), ...list(["--others", "--exclude-standard"])])]
    .filter(f => f && !f.split("/").includes("node_modules") && existsSync(path.join(ROOT, f)));
  const programs = PROGRAMS.map(cfg => [cfg, programFiles(cfg)] as const);
  const none: string[] = [], many: string[] = [];
  for (const f of tracked) {
    const hits = programs.filter(([, files]) => files.has(f)).map(([cfg]) => cfg);
    if (hits.length === 0) none.push(f);
    else if (hits.length > 1) many.push(`${f} (${hits.join(", ")})`);
  }
  const counts = programs.map(([cfg, files]) => `${cfg} ${tracked.filter(f => files.has(f)).length}`).join(", ");
  const summary = `tracked+untracked ${tracked.length}: ${counts}; in no program ${none.length}, in several ${many.length}`;
  t.diagnostic(summary);
  assert.ok(tracked.length > 0, "git ls-files returned no .ts/.tsx");
  assert.deepEqual({ none: none.slice(0, 20), many: many.slice(0, 20) }, { none: [], many: [] }, summary);
});
