// KNOWN RED (W1 lane 10 harness-config F1; docs/RISKS.md D4). tsconfig.json was narrowed to the product program
// (tsconfig.json:31-48), but ci.yml:177 and deploy.yml:133 still run only `npx tsc --noEmit`, so
// tsconfig.{scripts,preview,tests}.json are type-checked by no gate. Static reads only (workflow `run:` lines + package.json).
// Control pins lines a fix keeps (npm ci, npm run build, npm run test:offline, the 4-program typecheck script), never
// the defect. Fix-proof: tests/rules/mutations/W1-harness-config/k1-fixproof.
// F1-types: next-env.d.ts is git-ignored and written only by `next dev`/`next build`, so on a fresh CI checkout the scripts
// and tests programs lack Next's ambient types (`*.module.css` etc.). They need a TRACKED source: a git-tracked .d.ts in
// their `tsc --showConfig` file list with a real `/// <reference types="next" />` line or a `declare module "*.css"` /
// `"*.module.css"` line (other comments do not count), or a workflow run line
// before the typecheck line that runs `next build`/`next typegen` (directly or via an npm script) or writes next-env.d.ts.
// KNOWN RED: team's Claude owns the fix; not wired into npm scripts on purpose (init.sh reports it at window Close).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { npmRuns, packageScripts, ROOT, runLines, runScrubbed } from "./w1-10-run";

const PROGRAMS = ["tsconfig.json", "tsconfig.scripts.json", "tsconfig.preview.json", "tsconfig.tests.json"];
const WORKFLOWS = ["ci.yml", "deploy.yml"];
const esc = (s: string) => s.replace(/\./g, "\\.");

/** True when the lines run the tsconfig program: `npm run typecheck`, or tsc with `-p <cfg>` (tsconfig.json also as bare `tsc`). */
function runsProgram(lines: string[], cfg: string): boolean {
  if (lines.some(l => npmRuns(l).includes("typecheck"))) return true;
  const tsc = lines.filter(l => /\btsc\b/.test(l));
  if (cfg === "tsconfig.json" && tsc.some(l => !/(?:-p|--project)\s/.test(l))) return true;
  return tsc.some(l => new RegExp(`(?:-p|--project)\\s+(?:\\./)?${esc(cfg)}(?:\\s|$)`).test(l));
}

test("control: ci.yml and deploy.yml run npm ci, npm run build and npm run test:offline; typecheck names all four programs", () => {
  for (const wf of WORKFLOWS) {
    const lines = runLines(wf);
    assert.ok(lines.includes("npm ci"), `${wf}: npm ci step not found (extractor or workflow changed)`);
    for (const s of ["build", "test:offline"]) assert.ok(lines.some(l => npmRuns(l).includes(s)), `${wf}: npm run ${s} step not found`);
  }
  const typecheck = packageScripts().typecheck ?? "";
  for (const cfg of PROGRAMS) assert.match(typecheck, new RegExp(`-p ${esc(cfg)}`), `typecheck lacks ${cfg}`);
});

test("F1: ci.yml and deploy.yml each type-check all four tsconfig programs", () => {
  const missing = WORKFLOWS.flatMap(wf => { const lines = runLines(wf); return PROGRAMS.filter(cfg => !runsProgram(lines, cfg)).map(cfg => `${wf}: ${cfg}`); });
  assert.deepEqual(missing, [], `programs no CI/deploy gate type-checks: ${missing.join(", ")}`);
});

const TYPED = ["tsconfig.scripts.json", "tsconfig.tests.json"];
/** A real directive or declaration line (block comments stripped first); a `// reference types="next"` comment does not count. */
const AMBIENT = /^\s*\/\/\/\s*<reference\s+types=["']next["']\s*\/>|^\s*declare\s+module\s+["']\*\.(?:module\.)?css["']/m;
const declaresAmbient = (src: string) => AMBIENT.test(src.replace(/\/\*[\s\S]*?\*\//g, ""));
const GENERATES = /\bnext\s+(?:build|typegen)\b/;

/** True when a shell line generates Next's ambient types: next build/typegen (directly or via npm run) or writes next-env.d.ts. */
function makesTypes(line: string, scripts: Record<string, string>): boolean {
  if (GENERATES.test(line) || npmRuns(line).some(s => GENERATES.test(scripts[s] ?? ""))) return true;
  return /next-env\.d\.ts/.test(line) && /(?:>|\btee\b|\bcp\b|\bmv\b)/.test(line);
}

test("F1-types: scripts and tests programs get Next ambient types from a tracked .d.ts or a workflow step before typecheck", async () => {
  const tracked = new Set(execFileSync("git", ["ls-files", "-z", "--", "*.d.ts"], { cwd: ROOT, encoding: "utf8" }).split("\0").filter(Boolean));
  const tsc = path.join(ROOT, "node_modules/typescript/bin/tsc");
  const scripts = packageScripts();
  const gaps: string[] = [];
  const untyped: string[] = [];
  for (const cfg of TYPED) {
    const r = await runScrubbed(process.execPath, [tsc, "-p", cfg, "--showConfig"], { timeoutMs: 60_000 });
    assert.equal(r.status, 0, `tsc --showConfig -p ${cfg}: status ${r.status}\n${r.out.slice(-800)}`);
    const files: string[] = (JSON.parse(r.out).files ?? []).map((f: string) => path.normalize(f));
    const sources = files.filter(f => tracked.has(f) && declaresAmbient(readFileSync(path.join(ROOT, f), "utf8")));
    if (!sources.length) untyped.push(cfg);
  }
  for (const wf of WORKFLOWS) {
    const lines = runLines(wf);
    const at = lines.findIndex(l => npmRuns(l).includes("typecheck") || /\btsc\b/.test(l));
    if (at >= 0 && lines.slice(0, at).some(l => makesTypes(l, scripts))) continue;
    gaps.push(...untyped.map(cfg => `${wf}: ${cfg}`));
  }
  assert.deepEqual(gaps, [], `programs type-checked without a tracked Next ambient types source: ${gaps.join(", ")}`);
});
