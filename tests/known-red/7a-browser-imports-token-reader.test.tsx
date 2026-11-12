// KNOWN RED (W1 lane 7a finding 8, docs/review/W1/preview-plan-c-status-ui.md; REVIEW.md inv 6 "Secrets: ONLYFANS_*_TOKEN
// values never reach the browser" and Structure "logic in the wrong layer"). EngineStatus.tsx is a "use client" component;
// its value import of engineActionNeedsNote (EngineStatus.tsx:5) pulls lib/onlyfans/engine-operator.ts:1, which imports
// lib/onlyfans/backend-transport.ts (reads process.env.ONLYFANS_*_TOKEN, :15-18) into the browser graph. plan-c.ts:254
// names and avoids this exact hazard; PlanCConsole.tsx (the first control) does not reach the reader.
// No leak today [m]: the second control bundles EngineStatus for the browser with esbuild (pattern of
// tests/contracts/plan-c.test.ts:335-347): no process.env, ONLYFANS_, reader/transport names or sentinel base URL in the
// output, and the reader, while it is still an input, contributes 0 bytes (tree-shaken). The token itself cannot be
// sentinel-checked: backend-transport.ts:16,18 reads it by a computed key, which `define` cannot replace. Safety rests on
// tree shaking only; Next's own bundler is not measured. The existing walker importGraph (tests/contracts/plan-c.test.ts:309) is
// not exported, so it is not reused here. Type-only edges (`import type`, or a list of only `type X`) are not followed.
// Team's Claude owns the fix (an isomorphic module for the operator types and engineActionNeedsNote).
// Not wired into npm scripts. Offline: a static walk and an in-memory bundle; nothing is executed or written.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TOKEN_READER = "lib/onlyfans/backend-transport.ts";

/** Value imports only. Type-only edges are erased and never reach a bundle: `import type` / `export type`, and a brace
 * list whose every specifier is `type X` (`import { type A, type B } from`). */
const CLAUSE = /(?:^|[\s;])(?:import|export)\s+([^'";]*?)\s*from\s*["']([^"']+)["']/g;
const BARE = [/(?:^|[\s;])import\s*["']([^"']+)["']/g, /\bimport\(\s*["']([^"']+)["']\s*\)/g];
function typeOnly(clause: string): boolean {
  if (/^type[\s{*]/.test(clause)) return true;
  const list = /^\{([^}]*)\}$/.exec(clause.trim());
  const names = list ? list[1].split(",").map(name => name.trim()).filter(Boolean) : [];
  return names.length > 0 && names.every(name => /^type\s/.test(name));
}
function specifiers(source: string): string[] {
  return [...[...source.matchAll(CLAUSE)].filter(match => !typeOnly(match[1])).map(match => match[2]),
    ...BARE.flatMap(pattern => [...source.matchAll(pattern)].map(match => match[1]))];
}
function resolveImport(from: string, specifier: string): string | null {
  const base = specifier.startsWith("@/") ? join(ROOT, specifier.slice(2)) : specifier.startsWith(".") ? resolve(dirname(from), specifier) : null;
  if (!base) return null; // a package: node_modules is not walked
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")])
    if (/\.tsx?$/.test(candidate) && existsSync(candidate)) return candidate;
  return null;
}
/** Every repo file reachable from `entry` by value imports, with the chain that first reached it. */
function walk(entry: string): Map<string, string[]> {
  const reached = new Map<string, string[]>([[join(ROOT, entry), [entry]]]), queue = [join(ROOT, entry)];
  while (queue.length) {
    const file = queue.shift()!, source = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const specifier of specifiers(source)) {
      const next = resolveImport(file, specifier);
      if (next && !reached.has(next)) { reached.set(next, [...reached.get(file)!, relative(ROOT, next)]); queue.push(next); }
    }
  }
  return reached;
}

test("finding 8: control: the walk sees PlanCConsole's own graph and it does not reach the token reader", () => {
  const graph = walk("components/onlyfans-preview/PlanCConsole.tsx");
  assert.ok(graph.has(join(ROOT, "lib/onlyfans/plan-c-client.ts")) && graph.has(join(ROOT, "lib/onlyfans/plan-c.ts")), "fixture: the walk follows @/ imports");
  assert.deepEqual(specifiers('import { type A } from "./x"; import { b, type C } from "./y"; import type D from "./z"; export { type E } from "./w";'), ["./y"],
    "fixture: only value imports are edges");
  assert.equal(graph.get(join(ROOT, TOKEN_READER))?.join(" -> "), undefined);
});

test("finding 8: the browser component EngineStatus does not import the server token reader", () => {
  const graph = walk("components/onlyfans-preview/EngineStatus.tsx");
  assert.ok(graph.has(join(ROOT, "lib/onlyfans/engine-status.ts")), "fixture: the walk follows @/ imports");
  assert.equal(graph.get(join(ROOT, TOKEN_READER))?.join(" -> "), undefined, "a 'use client' file must not reach backend-transport.ts (REVIEW inv 6)");
});

test("finding 8: control: a browser bundle of EngineStatus carries no token reader or backend transport today", async () => {
  const result = await build({ absWorkingDir: ROOT, stdin: { contents: 'export { EngineStatus } from "./components/onlyfans-preview/EngineStatus";', resolveDir: ROOT, loader: "tsx" },
    bundle: true, write: false, format: "esm", platform: "browser", jsx: "automatic", minify: false, logLevel: "silent", metafile: true,
    define: { "process.env.NODE_ENV": '"production"', "process.env.ONLYFANS_API_BASE_URL": '"https://backend.sentinel.invalid"' } });
  const code = result.outputFiles[0].text;
  assert.ok(code.includes("Mark completed"), "fixture: the bundle is the real component");
  // While the reader is still an input (today), it must be tree-shaken to nothing. A fix that removes the edge skips this.
  if (Object.hasOwn(result.metafile.inputs, TOKEN_READER))
    for (const output of Object.values(result.metafile.outputs)) assert.equal(output.inputs[TOKEN_READER]?.bytesInOutput ?? 0, 0, "the token reader contributes code to the browser bundle");
  for (const needle of ["backend.sentinel.invalid", "ONLYFANS_", "process.env", "configuredBackendPurpose", "createBackendTransport", "createEngineOperatorBackend", "Bearer "])
    assert.ok(!code.includes(needle), `the browser bundle contains ${needle}`);
});
