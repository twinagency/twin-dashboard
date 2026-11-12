// KNOWN RED (W1 lane 10 harness-config F2; chain package.json test:onlyfans-media -> test:offline -> ci.yml + deploy.yml
// "Checks"; hidden behind D3 server-only reds earlier in ci.yml). scripts/check-onlyfans-vault-folder-lifecycle.cjs
// compiles VaultManager.tsx against a hand-built dependency map; the drop added `import CategoryDrafts from "./CategoryDrafts"`
// (VaultManager.tsx:18) and no map key, so the script dies with `Cannot find module './CategoryDrafts'`. Stubbing only that
// key then dies on `./Preparation` (VaultManager.tsx:19, also drop-added); green needs both (mutations k2-partialfix/k2-fixproof).
// Behavioural: runs the scripts in a scrubbed env via tests/known-red/w1-10-run.ts (fetch is mocked inside them; no network).
// KNOWN RED: team's Claude owns the fix; not wired into npm scripts on purpose (init.sh reports it at window Close).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ROOT, runScrubbed } from "./w1-10-run";

const node = (args: string[]) => runScrubbed(process.execPath, args, { timeoutMs: 120_000 });

test("control: tsx sibling in the same test:onlyfans-media chain passes; VaultManager imports ./CategoryDrafts", async () => {
  const r = await node(["--import", "tsx", "scripts/check-onlyfans-vault-metadata-lifecycle.tsx"]);
  assert.equal(r.status, 0, `check-onlyfans-vault-metadata-lifecycle.tsx: status ${r.status} signal ${r.signal}\n${r.out.slice(-1500)}`);
  const src = readFileSync(`${ROOT}/components/onlyfans-preview/VaultManager.tsx`, "utf8");
  assert.match(src, /from\s+["']\.\/CategoryDrafts["']/, "precondition: VaultManager.tsx no longer imports ./CategoryDrafts");
});

test("F2: vault folder lifecycle check resolves every relative import and passes", async () => {
  const r = await node(["--import", "tsx", "scripts/check-onlyfans-vault-folder-lifecycle.cjs"]);
  const missing = r.out.match(/Cannot find module '\.\/[^']*'/)?.[0];
  assert.equal(missing, undefined, `dependency map lacks a relative import: ${missing}`);
  assert.equal(r.status, 0, `status ${r.status} signal ${r.signal}\n${r.out.slice(-1500)}`);
});
