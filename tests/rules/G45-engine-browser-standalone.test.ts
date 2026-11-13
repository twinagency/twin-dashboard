// G45: regression guard promoted from known-red (fix-sweep tests/known-red/w1-10-*); the "KNOWN RED" lines below are history.
// KNOWN RED (W1 lane 10 harness-config F5; CLAUDE.md "Verification" says test:engine-browser needs only Chromium + base.css).
// package.json test:engine-browser = `node tests/browser/build-engine-journey.mjs && node tests/browser/check-engine-journey.mjs`.
// The build throws without ENGINE_BROWSER_OUTPUT (:5-6) and defaults base.css to the absolute
// /evidence/browser-preview-offline/base.css (:13); the check throws without ENGINE_BROWSER_OUTPUT/ARTIFACTS (:6-7) and
// defaults its journey/sequence JSON to absolute /evidence/*.json (:11-12). The fix this encodes: in-repo defaults plus
// committed synthetic fixtures, so both halves run from a plain checkout.
// F5-build (behavioural): the first `&&` segment of the npm script, run as written via `sh -c` (scrubbed env, cwd repo, 60 s).
// Safety (build read in full): today it throws at :6 before any mkdir, esbuild run, copy or write; it opens no socket.
// Before running, a literal ENGINE_BROWSER_OUTPUT default that resolves outside the repo and the OS temp dir fails the
// test (refuse to run). After the run, at ANY exit status, the topmost dir of that default the run created (e.g. a new
// `test-results/` parent, not only its leaf) is removed; a default that existed before the run is left alone.
// F5-static: the check half needs Chromium, so its shape is asserted instead: every ENGINE_BROWSER_OUTPUT/ARTIFACTS read in
// both scripts falls back (`??`/`||`) to a relative in-repo string literal, and neither script has an absolute /evidence literal.
// Fix-proof (static half): tests/rules/mutations/W1-harness-config/k4-fixproof.
// K4 green is necessary, not sufficient: the check half (Chromium + journey fixtures) is never run here, so relative paths
// to missing or invalid fixtures pass F5-static. When K4 flips, run `npm run test:engine-browser` by hand before closing F5.
// KNOWN RED: team's Claude owns the fix; not wired into npm scripts on purpose (init.sh reports it at window Close).
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { packageScripts, ROOT, type RunResult, runScrubbed } from "./G45-run";

const BUILD = "tests/browser/build-engine-journey.mjs";
const CHECK = "tests/browser/check-engine-journey.mjs";
const npmScript = () => packageScripts()["test:engine-browser"] ?? "";
const inside = (p: string, dir: string) => { const r = path.relative(dir, p); return !!r && !r.startsWith("..") && !path.isAbsolute(r); };
const src = (f: string) => readFileSync(path.join(ROOT, f), "utf8");

/** Every `process.env.ENGINE_BROWSER_(OUTPUT|ARTIFACTS)` read, with the string literal it falls back to (undefined if none). */
function outputReads(file: string) {
  const s = src(file);
  return [...s.matchAll(/process\.env\.(ENGINE_BROWSER_(?:OUTPUT|ARTIFACTS))\b/g)].map(m => ({ file, env: m[1],
    literal: /^\s*(?:\?\?|\|\|)\s*(["'`])([^"'`$]*)\1/.exec(s.slice(m.index! + m[0].length))?.[2] }));
}

test("control: test:engine-browser starts with the build segment and both browser scripts exist", () => {
  assert.match(npmScript(), /^node tests\/browser\/build-engine-journey\.mjs\s*&&/);
  for (const f of [BUILD, CHECK]) assert.ok(existsSync(path.join(ROOT, f)), `${f} missing`);
});

test("F5-build: first segment of test:engine-browser runs from a plain checkout (no ENGINE_BROWSER_* env)", async t => {
  const segment = npmScript().split("&&")[0].trim();
  const literal = outputReads(BUILD).find(r => r.env === "ENGINE_BROWSER_OUTPUT" && r.literal !== undefined)?.literal;
  const out = literal === undefined ? undefined : path.resolve(ROOT, literal);
  if (out) assert.ok(inside(out, ROOT) || inside(out, tmpdir()), `refusing to run: ENGINE_BROWSER_OUTPUT default ${out} is outside the repo and the OS temp dir`);
  const preexisting = !!out && existsSync(out);
  let created = out;
  while (created && !existsSync(path.dirname(created))) created = path.dirname(created);
  let r: RunResult | undefined;
  try { r = await runScrubbed("sh", ["-c", segment], { timeoutMs: 60_000 }); }
  finally {
    if (created && !preexisting) rmSync(created, { recursive: true, force: true });
    else t.diagnostic(out ? `build output dir ${out} pre-existed, left in place` : "no literal ENGINE_BROWSER_OUTPUT default: output dir not identifiable");
  }
  assert.equal(r?.status, 0, `\`${segment}\`: status ${r?.status} signal ${r?.signal}\n${r?.out.slice(-800)}`);
});

test("F5-static: build and check fall back to relative in-repo output dirs and name no absolute /evidence path", () => {
  const bad = [BUILD, CHECK].flatMap(outputReads)
    .filter(({ literal }) => literal === undefined || path.isAbsolute(literal) || !inside(path.resolve(ROOT, literal), ROOT))
    .map(({ file, env, literal }) => `${path.basename(file)} ${env} -> ${literal === undefined ? "no literal fallback" : literal}`);
  const absolute = [BUILD, CHECK].flatMap(f => [...src(f).matchAll(/(["'`])(\/evidence(?:\/[^"'`]*)?)\1/g)].map(m => `${path.basename(f)} ${m[2]}`));
  assert.deepEqual({ bad, absolute }, { bad: [], absolute: [] }, `env reads without an in-repo default: ${bad.join("; ") || "-"}; absolute paths: ${absolute.join("; ") || "-"}`);
});
