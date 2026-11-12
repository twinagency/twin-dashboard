// RULE (W4 deploy-creator-sign-in-input-f-plus31): the offline vm harness tests/support/w4-deploy-vm.mjs refuses
// obvious escape/codegen source before running it, and string code generation is off inside its context.
// node:vm is not a security boundary (see the harness header); this pins the two guards it does have.
// The escape payloads only set a marker on the host's globalThis, so a broken guard is caught, never harmful.
import assert from "node:assert/strict";
import test from "node:test";
import { runCjsInVm } from "../support/w4-deploy-vm.mjs";

const MARK = "__w4HarnessEscaped";

test("escape/codegen source is refused before it runs, and reaches nothing real", async (t) => {
  t.after(() => { delete globalThis[MARK]; });
  const payloads = [
    `Buffer.constructor.constructor('return globalThis')().${MARK} = 'buffer';`,
    `URL['constructor']['constructor']('return globalThis')().${MARK} = 'bracket';`,
    `new Function('return globalThis')().${MARK} = 'function';`,
    `eval('1');`,
    `import('node:fs').catch(() => {});`, // handled, so an unrefused run fails this test by assertion
  ];
  const refused = [];
  for (const src of payloads) {
    await runCjsInVm(src).then(() => {}, (e) => { if (/HarnessError: .*refused, nothing run/.test(e.message)) refused.push(src); });
  }
  assert.equal(globalThis[MARK], undefined, `an escape payload reached the host: ${globalThis[MARK]}`);
  assert.deepEqual(refused, payloads, "every escape/codegen payload must be refused before it runs");
});

test("string code generation is off inside the context (an obfuscated eval throws EvalError)", async () => {
  const r = await runCjsInVm(`try { globalThis['ev' + 'al']('1'); console.log('ran'); } catch (e) { console.log(e.name); }`);
  assert.deepEqual(r.logs, ["EvalError"]);
});

test("control: benign source runs and its output is captured", async () => {
  const r = await runCjsInVm(`console.log(JSON.stringify({ ok: Buffer.from('a').toString('base64') })); process.exitCode = 3;`);
  assert.deepEqual(r.logs, ['{"ok":"YQ=="}']);
  assert.equal(r.exitCode, 3);
});
