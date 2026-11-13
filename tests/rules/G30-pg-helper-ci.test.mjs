// Rule (G30 R1): the throwaway-PostgreSQL helper skips its database tests when no server binaries exist. Locally that
// is fine; under CI it made F1/F3 a silent false green. With CI set and no cluster it must fail, not skip.
// Spawns node on the helper with a nonexistent W5_PG_BIN; no cluster is started, nothing is written.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const HELPER = new URL("../support/W5-db-migrations-pg.mjs", import.meta.url).href;
const load = (extra) => spawnSync(process.execPath, ["--input-type=module", "-e", `const m = await import(${JSON.stringify(HELPER)}); console.log(String(m.skipReason));`],
  { encoding: "utf8", env: { PATH: process.env.PATH, HOME: process.env.HOME, W5_PG_BIN: "/nonexistent-g30-pg-bin", ...extra } });

test("control: without CI and without PostgreSQL binaries the helper loads and reports a skip reason", () => {
  const r = load({});
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /no PostgreSQL server binaries/);
});

test("under CI without a cluster the helper fails instead of skipping", () => {
  const r = load({ CI: "true" });
  assert.notEqual(r.status, 0, `helper loaded under CI and would skip: ${r.stdout.trim()}`);
  assert.match(r.stderr, /CI/);
});
