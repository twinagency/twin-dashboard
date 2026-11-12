// KNOWN RED (W1 lane 2 finding 7, docs/review/W1/lib-onlyfans-engine.md; REVIEW inv 6 secrets + Structure "logic in the
// wrong layer"): lib/onlyfans/engine-operator.ts holds both the browser vocabulary (actions, schema, evidence format) and the
// server transport (createBackendTransport, configuredBackendPurpose -> process.env ONLYFANS_*_TOKEN, :1,23-53). The browser
// client engine-operator-client.ts and the panel EngineStatus.tsx import it for values, so backend-transport.ts is in the
// browser import graph. No token value reaches the browser today (only NEXT_PUBLIC_* is inlined) [inferred]; plan-c.ts:254-255
// already copies the evidence format to avoid this import. The status and catalogue siblings split their backend out.
// Team's Claude owns the fix. Not run by init.sh or npm yet: listed under '## Wiring (orchestrator)' in
// docs/review/W1/lib-onlyfans-engine.md. Static source scan only; nothing is executed or bundled.
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Not reused: importGraph in tests/contracts/plan-c.test.ts is file-local (not exported, and importing that file would
// register its tests). This minimal scanner follows the same resolution (`@/` alias, relative, .ts/.tsx/index.ts) and
// additionally skips whole-statement `import type` / `export type`, which the bundler erases.
const root = fileURLToPath(new URL("../..", import.meta.url));
const STATIC = /^\s*(?:import|export)\s+(type\s+)?(?:[^;]*?\sfrom\s*)?["']([^"']+)["']/gm;
const DYNAMIC = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
function importGraph(entry: string): string[] {
  const seen = new Set<string>(), queue = [entry];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(path.join(root, file), "utf8");
    const specs = [...[...source.matchAll(STATIC)].filter(match => !match[1]).map(match => match[2]), ...[...source.matchAll(DYNAMIC)].map(match => match[1])];
    for (const spec of specs) {
      const target = spec.startsWith("@/") ? spec.slice(2) : spec.startsWith(".") ? path.posix.join(path.posix.dirname(file), spec) : null;
      if (!target) continue;
      const found = [`${target}.ts`, `${target}.tsx`, `${target}/index.ts`, target].find(candidate =>
        existsSync(path.join(root, candidate)) && statSync(path.join(root, candidate)).isFile());
      if (found) queue.push(found);
    }
  }
  return [...seen];
}
const TRANSPORT = "lib/onlyfans/backend-transport.ts";

test("control: the scanner sees the server module's transport, and the status vocabulary does not reach it", () => {
  // Anchor on the requests route: it reaches the transport today and after the split fix, and exercises the @/ alias.
  assert.ok(importGraph("app/api/onlyfans-controls/accounts/[accountId]/conversations/[conversationId]/requests/[requestId]/route.ts").includes(TRANSPORT), "scanner sanity: the requests route reaches the transport via @/");
  assert.ok(!importGraph("lib/onlyfans/engine-status.ts").includes(TRANSPORT), "engine-status.ts stays browser-safe");
});

test("finding 7: the browser engine client and panel do not reach the server transport", () => {
  const reaching = ["lib/onlyfans/engine-operator-client.ts", "components/onlyfans-preview/EngineStatus.tsx"]
    .filter(entry => importGraph(entry).includes(TRANSPORT));
  assert.deepEqual(reaching, [], `browser entries must not import ${TRANSPORT}`);
});
