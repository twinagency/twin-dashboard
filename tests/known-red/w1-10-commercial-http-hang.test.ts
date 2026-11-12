// KNOWN RED (W1 lane 10 harness-config F4; REVIEW.md "tests that fake the service", Structure "new suites wired").
// scripts/check-commercial-category-http.ts (package.json test:commercial-category-http) opens its fixture identity server
// (:23), then `openSync("../evidence/commercial-next.log")` (:25) OUTSIDE the try (:27). With no ../evidence dir the
// throw skips the finally (:107) that closes the server, so the process never exits (measured: killed at 90 s).
// SAFE BY CONSTRUCTION: the script runs from a sandbox, cwd = <mkdtemp>/a, as `<ROOT>/node_modules/.bin/tsx <ROOT>/scripts/...`.
// Its `next dev` spawn uses the cwd-relative `node_modules/next/dist/bin/next`, which cannot resolve there, so Next never
// starts whatever the script does; `../evidence` resolves to <mkdtemp>/evidence (absent). Both sandbox dirs are chmod 0555
// (read-only) once created, so ANY cwd-relative log or mkdir fix (e.g. `test-results/`) fails before the spawn: a correct
// fix (every resource acquired inside the try, closed in the finally) exits fast and reads green (k3-fixproof-relative).
// Restored to 0755 in the finally, then removed. Child: scrubbed env, own process group SIGKILLed after 8 s (shared helper
// w1-10-run.ts); backend is the discard port 127.0.0.1:9. Remaining limitation: a fix that logs to an ABSOLUTE writable
// path (e.g. os.tmpdir()) reaches the spawn and the 180 x 500 ms readiness loop (:28), and stays red here because Next
// cannot start in the sandbox (k3-sandboxproof); verify that case by hand.
// KNOWN RED: team's Claude owns the fix; not wired into npm scripts on purpose (init.sh reports it at window Close).
import assert from "node:assert/strict";
import { accessSync, chmodSync, constants, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { ROOT, runScrubbed } from "./w1-10-run";

const TSX = path.join(ROOT, "node_modules/.bin/tsx");
const SCRIPT = path.join(ROOT, "scripts/check-commercial-category-http.ts");

/** Sandbox <mkdtemp>/a; `setup` may write files first, then both dirs go read-only (0555) for `fn`. */
async function inSandbox(fn: (sandbox: string, cwd: string) => Promise<void>, setup?: (sandbox: string) => void) {
  const sandbox = mkdtempSync(path.join(tmpdir(), "w1-10-k3-")), cwd = path.join(sandbox, "a");
  try {
    mkdirSync(cwd); setup?.(sandbox);
    chmodSync(cwd, 0o555); chmodSync(sandbox, 0o555);
    await fn(sandbox, cwd);
  } finally {
    for (const d of [sandbox, cwd]) { try { chmodSync(d, 0o755); } catch { /* not created */ } }
    rmSync(sandbox, { recursive: true, force: true });
  }
}
const writable = (d: string) => { try { accessSync(d, constants.W_OK); return true; } catch { return false; } };

test("control: sandbox is read-only, cannot resolve next and has no ../evidence; tsx runs an absolute-path script from it", async () => {
  await inSandbox(async (sandbox, cwd) => {
    assert.equal(writable(cwd) || writable(sandbox), false, "sandbox dirs are writable");
    assert.equal(existsSync(path.join(cwd, "node_modules")), false, "sandbox has node_modules");
    assert.equal(existsSync(path.resolve(cwd, "node_modules/next/dist/bin/next")), false, "next resolves from the sandbox");
    assert.equal(existsSync(path.resolve(cwd, "../evidence")), false, "../evidence exists in the sandbox");
    const r = await runScrubbed(TSX, [path.join(sandbox, "probe.ts")], { cwd, timeoutMs: 30_000 });
    assert.equal(r.status, 0, `tsx probe: status ${r.status} signal ${r.signal}\n${r.out.slice(-800)}`);
    assert.match(r.out, /w1-10-k3-probe 42 /, "tsx probe printed nothing");
  }, sandbox => writeFileSync(path.join(sandbox, "probe.ts"), 'const n: number = 42; console.log("w1-10-k3-probe " + n + " " + process.cwd());\n'));
});

test("F4: commercial category HTTP check exits on its own within 8 s when its log dir is missing", async () => {
  await inSandbox(async (_sandbox, cwd) => {
    const r = await runScrubbed(TSX, [SCRIPT], { cwd, timeoutMs: 8_000, env: { COMMERCIAL_TEST_BACKEND: "http://127.0.0.1:9" } });
    const crash = r.out.match(/SyntaxError|Transform failed|triggerUncaughtException|ERR_MODULE_NOT_FOUND|ERR_UNKNOWN_FILE_EXTENSION|Cannot find module/)?.[0];
    // A load crash is not "still red": throw a plain Error (no ERR_ASSERTION) so init.sh reports it as crashed.
    if (crash) throw new Error(`K3 child crashed on load (${crash}), not a hang or a clean exit\n${r.out.slice(-800)}`);
    assert.equal(r.signal, null, `killed by ${r.signal} after 8 s: process hung (status ${r.status})\n${r.out.slice(-800)}`);
  });
});
