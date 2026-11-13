// W5 close: lets a known-red that uses node:test `mock.module` run under init.sh's plain `node --import tsx --test`.
// Generalised from ensureModuleMocks in tests/helpers/w1-content-config-route-harness.ts (W1 pattern), with init.sh's
// control pattern `(^|: )control:` instead of `^control`.
// Usage: `if (withModuleMocks(import.meta.url, { controls: 1, rest: 1 })) { ...mock.module + tests... }`.
// With module mocks available it returns true. Without, it defines up to two tests that re-run the file under
// --experimental-test-module-mocks and returns false: "control: ..." re-runs only the controls (all must pass, at least
// `controls`), the other re-runs the rest (all must pass, at least `rest`). A failed re-run throws AssertionError only if
// the child failed on an assertion; a crash, timeout or vacuous run throws a plain Error (init.sh: "crashed").
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { basename } from "node:path";
import test, { mock } from "node:test";
import { fileURLToPath } from "node:url";

const CTL = "(^|: )control:";

export function withModuleMocks(url: string, expected: { controls: number; rest: number }): boolean {
  if (typeof mock.module === "function") return true;
  const file = fileURLToPath(url), name = basename(file);
  // Only loader flags and their values carry over (tsx); test-runner flags never do.
  const inherited: string[] = [];
  for (let i = 0; i < process.execArgv.length; i++) {
    const arg = process.execArgv[i];
    if (/^(?:--import|--require|-r|--loader|--experimental-loader)$/.test(arg) && i + 1 < process.execArgv.length) inherited.push(arg, process.execArgv[++i]);
    else if (/^(?:--import|--require|--loader|--experimental-loader)=/.test(arg)) inherited.push(arg);
  }
  const rerun = (pattern: string, min: number) => () => {
    // NODE_TEST_CONTEXT would make the child skip its files and exit 0 having run nothing.
    const { NODE_TEST_CONTEXT: _context, ...env } = process.env;
    const child = spawnSync(process.execPath, [...inherited, "--experimental-test-module-mocks", "--test", "--test-reporter=spec", pattern, file],
      { env, encoding: "utf8", timeout: 120_000 });
    const out = `${child.stdout ?? ""}${child.stderr ?? ""}`;
    const ran = Number(/^ℹ tests (\d+)/m.exec(out)?.[1] ?? 0), passed = Number(/^ℹ pass (\d+)/m.exec(out)?.[1] ?? 0);
    if (child.status === 0 && ran >= min && passed === ran) return;
    process.stdout.write(out);
    const failed = [...new Set([...out.matchAll(/^\s*✖ (.+?) \(\d/gm)].map(m => m[1]))].join(" | ");
    if (out.includes("ERR_ASSERTION")) throw new assert.AssertionError({ message: `${name} under --experimental-test-module-mocks (${pattern}): ${failed}` });
    throw new Error(`${name} re-run did not assert (status ${child.status}, signal ${child.signal}, tests ${ran}/${min}+, pass ${passed}); output above`);
  };
  if (expected.controls) test(`control: ${name} controls pass under --experimental-test-module-mocks`, rerun(`--test-name-pattern=${CTL}`, expected.controls));
  if (expected.rest) test(`${name} tests pass under --experimental-test-module-mocks`, rerun(`--test-skip-pattern=${CTL}`, expected.rest));
  return false;
}
