// KNOWN RED (docs/RISKS.md D3, second import site): lib/onlyfans/launch/b-native-routes.ts:5 imports
// "../plan-c-owner", whose first line is `import "server-only"`; that package is not in node_modules [m], so any
// tsx script or test that imports b-native-routes dies before running. D3's fix names only lib/onlyfans/route.ts:11;
// b-native-routes.ts imports plan-c-owner directly (:5, before its b-route -> route.ts chain at :9), so a route.ts-only
// fix leaves this file broken. W1 covers route.ts via tests/known-red/plan-c-d3-server-only.test.ts (W1 branch); this is
// the other site.
// Measured on Node 23.6.1, red stderr first line [m]: "node:internal/modules/cjs/loader:1409", then
// "Error: Cannot find module 'server-only'", require stack plan-c-owner.ts <- b-native-routes.ts.
// Measured [m]: with `server-only` resolved to an empty module (a throwaway require hook outside the repo), the same
// import exits 0, so the red fails only because of server-only.
// Team's Claude owns the fix; not wired into npm scripts; init.sh's known-red loop does not list it yet (orchestrator decides).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");

// Same minimal env as init.sh clean(): PATH, HOME, NODE_ENV=test. No network: importing only.
function importUnderTsx(relative: string) {
  const target = path.join(root, relative);
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", `await import(${JSON.stringify(target)}); console.log("imported");`],
    {
      cwd: root,
      env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", NODE_ENV: "test" },
      encoding: "utf8",
      timeout: 60_000,
    },
  );
  return { status: result.status, error: result.error, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

test("control: native-backend.ts (same directory, no plan-c-owner import) imports under tsx", () => {
  const r = importUnderTsx("lib/onlyfans/launch/native-backend.ts");
  assert.equal(r.error, undefined);
  assert.equal(r.status, 0, r.stderr.split("\n").slice(0, 6).join("\n"));
  assert.match(r.stdout, /imported/);
});

test("D3: b-native-routes.ts imports under tsx without server-only", () => {
  const r = importUnderTsx("lib/onlyfans/launch/b-native-routes.ts");
  assert.equal(r.error, undefined);
  assert.doesNotMatch(r.stderr, /server-only/, "b-native-routes.ts:5 -> plan-c-owner.ts:1 import \"server-only\"");
  assert.equal(r.status, 0, r.stderr.split("\n").slice(0, 6).join("\n"));
});
