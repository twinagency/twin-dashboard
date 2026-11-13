// Rule (W1 lane 7a finding 8, docs/review/W1/preview-plan-c-status-ui.md; W1 lane 2 finding 7, docs/review/W1/lib-onlyfans-engine.md;
// REVIEW inv 6 "Secrets: ONLYFANS_*_TOKEN values never reach the browser" and Structure "logic in the wrong layer"; G48 R1 F1/F3, R2):
// no module whose directive prologue holds "use client", anywhere under app/, components/ or lib/, reaches a server module by value
// imports. SERVER_MODULES (tests/helpers/import-graph.ts) names them by exact path: the secret readers lib/onlyfans/backend-transport.ts
// (process.env ONLYFANS_*_TOKEN), plan-c-owner-core.ts and its server-only wrapper plan-c-owner.ts (SUPABASE_SERVICE_KEY), the
// service-role clients lib/supabase.ts and lib/supabase-service.ts, and the route/transport layers built on them. A client that
// reaches a *-backend.ts importing one of these fails with a chain naming that backend; no backend list is kept.
// Original intent kept: EngineStatus.tsx and engine-operator-client.ts take the operator vocabulary from engine-operator-core.ts and
// never reach backend-transport; engine-operator.ts keeps the transport and re-exports the vocabulary for server callers.
// Walker: tests/helpers/import-graph.ts, shared with tests/contracts/plan-c.test.ts (type-only edges skipped, "use server" modules
// are a boundary). scripts/check-onlyfans-preview.ts still has its own walker.
// Offline: a static parse and an in-memory esbuild bundle; nothing is executed or written. Next's own bundler is not measured.
import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { ROOT, SECRET_ENV, SERVER_MODULES, directive, importGraph, isSecretEnv, sourceFiles, valueSpecifiers } from "../helpers/import-graph";

const TRANSPORT = "lib/onlyfans/backend-transport.ts";
const CLIENTS = sourceFiles("app", "components", "lib").filter(file => directive(file) === "use client");
const chain = (graph: Map<string, string[]>, file: string) => graph.get(file)?.join(" -> ");

test("control: the walker parses value edges only, and finds known server paths", () => {
  assert.deepEqual(valueSpecifiers("x.ts", 'import { type A } from "./a"; import { b, type C } from "./b"; import type D from "./c"; import E, { type F } from "./d";'
    + ' export type { G } from "./e"; export { type H } from "./f"; export { i } from "./g"; export * from "./h"; import "./i"; const j = () => import("./j");'),
  ["./b", "./d", "./g", "./h", "./i", "./j"], "fixture: value imports, re-exports and literal dynamic imports are edges; type-only lists are not");
  assert.ok(chain(importGraph("lib/onlyfans/engine-operator.ts"), TRANSPORT), "the walker sees engine-operator.ts reach the transport");
  assert.ok(chain(importGraph("app/clones/actions.ts"), "lib/supabase.ts"), "the walker sees a server action reach the admin client via @/");
  assert.ok(chain(importGraph("lib/onlyfans/route.ts"), "lib/onlyfans/plan-c-owner.ts"), "the walker sees route.ts reach the server-only owner wrapper");
  assert.equal(directive("x.ts", '"use strict"; "use client"; import "./a";'), "use client", "fixture: a directive later in the prologue counts");
  assert.equal(directive("x.ts", 'import "./a"; "use client";'), null, "fixture: a string after the prologue is not a directive");
  assert.deepEqual(SERVER_MODULES.filter(file => !sourceFiles("lib").includes(file)), [], "fixture: every listed server module exists");
  for (const reader of ["lib/agency-session.ts", "lib/owner-auth.ts", "lib/onlyfans-managed-proxy/backend.ts", "lib/onlyfans/plan-c-owner-core.ts", "lib/openrouter.ts"])
    assert.ok(SERVER_MODULES.includes(reader), `fixture: derived secret reader ${reader} is protected`);
  const names = (text: string) => [...text.matchAll(SECRET_ENV)].map(m => m[1]).filter(isSecretEnv);
  assert.deepEqual(names('process.env.SUPABASE_SERVICE_KEY; process.env["ONLYFANS_X_TOKEN"]; process.env.NEXT_PUBLIC_A_KEY; process.env.SUPABASE_PUBLISHABLE_KEY; process.env.NODE_ENV'),
    ["SUPABASE_SERVICE_KEY", "ONLYFANS_X_TOKEN"], "fixture: secret names match, public and publishable names do not");
  assert.ok(CLIENTS.length > 200 && CLIENTS.includes("components/onlyfans-preview/EngineStatus.tsx"), `fixture: the scan finds the 'use client' modules (${CLIENTS.length})`);
});

test("finding 8 / lane2 f7: EngineStatus and engine-operator-client do not reach backend-transport", () => {
  for (const entry of ["components/onlyfans-preview/EngineStatus.tsx", "lib/onlyfans/engine-operator-client.ts"]) {
    const graph = importGraph(entry);
    assert.ok(graph.has("lib/onlyfans/engine-operator-core.ts"), `fixture: ${entry} takes the vocabulary from the core`);
    assert.equal(chain(graph, TRANSPORT), undefined, `${entry} must not reach ${TRANSPORT}`);
  }
});

test("F3: no 'use client' module under app/, components/ or lib/ reaches a server module", () => {
  const graph = importGraph(...CLIENTS);
  assert.deepEqual(SERVER_MODULES.flatMap(file => graph.has(file) ? [chain(graph, file)] : []), [], "a 'use client' graph reaches a server module (REVIEW inv 6)");
});

test("finding 8: a browser bundle of EngineStatus carries no token reader or backend transport", async () => {
  const result = await build({ absWorkingDir: ROOT, stdin: { contents: 'export { EngineStatus } from "./components/onlyfans-preview/EngineStatus";', resolveDir: ROOT, loader: "tsx" },
    bundle: true, write: false, format: "esm", platform: "browser", jsx: "automatic", minify: false, logLevel: "silent", metafile: true,
    define: { "process.env.NODE_ENV": '"production"', "process.env.ONLYFANS_API_BASE_URL": '"https://backend.sentinel.invalid"' } });
  const code = result.outputFiles[0].text;
  assert.ok(code.includes("Mark completed"), "fixture: the bundle is the real component");
  for (const output of Object.values(result.metafile.outputs))
    assert.equal(output.inputs[TRANSPORT]?.bytesInOutput ?? 0, 0, "the token reader contributes code to the browser bundle");
  for (const needle of ["backend.sentinel.invalid", "ONLYFANS_", "process.env", "configuredBackendPurpose", "createBackendTransport", "createEngineOperatorBackend", "Bearer "])
    assert.ok(!code.includes(needle), `the browser bundle contains ${needle}`);
});
