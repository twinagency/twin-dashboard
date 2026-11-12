/**
 * W1 lane 7a finding 16 (holds today, characterization; REVIEW.md Structure "UI: no em dashes in copy", CLAUDE.md UI
 * conventions): the Plan C console and the engine status panel carry no em dash (U+2014) or en dash (U+2013) anywhere in
 * the file, copy included. Mutation proof: tests/rules/mutations/W1-preview-plan-c-status-ui/.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FILES = ["components/onlyfans-preview/PlanCConsole.tsx", "components/onlyfans-preview/EngineStatus.tsx"];

test("finding 16: the Plan C console and engine status components contain no em or en dash", () => {
  for (const file of FILES) {
    const hits = readFileSync(resolve(ROOT, file), "utf8").split("\n").flatMap((line, index) => /[–—]/.test(line) ? [`${file}:${index + 1}`] : []);
    assert.deepEqual(hits, [], `${file}: no em or en dash`);
  }
});
