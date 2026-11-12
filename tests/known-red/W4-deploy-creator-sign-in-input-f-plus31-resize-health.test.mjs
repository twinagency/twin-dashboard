// KNOWN RED (W4 F4; docs/review/W4/deploy-creator-sign-in-input-f-plus31.md): the post-resize `health`
// SSM script in deployment/creator-sign-in-resize.cjs is a python heredoc followed by curl + echo PASS with
// no fail-fast, so a failed python check (DB unhealthy, service down, memory not visible) still exits 0 when
// the site answers and the driver records resizeComplete / "PASS approved4GiB upgrade".
// Owner = team's Claude. Not wired into npm scripts; init.sh does not run it yet (orchestrator wires it at
// window close). Text only; the shell is never run.
// Run: nice -n 10 node --import tsx --test --test-concurrency=1 tests/known-red/W4-deploy-creator-sign-in-input-f-plus31-resize-health.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { literalFrom, requireTarget } from "../support/w4-deploy-vm.mjs";

const TARGET = "deployment/creator-sign-in-resize.cjs";
/** The `health` SSM script template from the target. */
const healthScript = () => literalFrom(requireTarget(TARGET, "F4"), /\bconst\s+health\s*=\s*`([\s\S]*?)`\s*;?/, "health template");
const OPENER = /python3?\s+-\s*[^\n]*<<-?\s*'?PY'?/;

test("control: the health template is found and holds the python heredoc", () => {
  assert.match(healthScript(), OPENER);
});

test("F4: a failing python check makes the health script fail", () => {
  // Accepted fixes: `set -e…` first; `&&` or `|| exit` on the heredoc opener line; or the curl folded into
  // the python block so nothing runs in the shell after the heredoc.
  const lines = healthScript().split("\n");
  const first = lines.find((l) => l.trim()) ?? "";
  const failFast = /^\s*set\s+-[a-z]*e/.test(first);
  const opener = lines.find((l) => OPENER.test(l)) ?? "";
  const chained = /<<-?\s*'?PY'?\s*(?:&&|\|\|\s*exit\b)/.test(opener);
  const end = lines.findIndex((l, i) => i > lines.indexOf(opener) && l.trim() === "PY");
  const afterHeredoc = end < 0 ? "" : lines.slice(end + 1).join("\n").trim();
  const folded = end >= 0 && afterHeredoc === "";
  assert.ok(failFast || chained || folded,
    `python exit status is discarded; first line ${JSON.stringify(first)}; shell after heredoc: ${JSON.stringify(afterHeredoc.split("\n").map((l) => l.split(" ")[0]))}`);
});
