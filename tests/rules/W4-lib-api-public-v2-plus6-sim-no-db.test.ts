/**
 * Rule (CLAUDE.md "Sim data"): lib/api-sim.ts imports no database client AT ALL, which is the safety property of the
 * sim endpoints. scripts/check-public-api.ts D1 checks only api-sim.ts's own import specifiers; this walks the whole
 * transitive graph of runtime imports (relative and "@/" specifiers, resolved on disk; `import type` / `export type`
 * erase at compile time and are skipped), so a database client reached through a helper (e.g. lib/money.ts) is caught.
 * Offline: fs only. W4 lib-api-public-v2-plus6 characterization (C2), mutation-proven:
 * tests/rules/mutations/W4-lib-api-public-v2-plus6/c2-*.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const DB_PACKAGE = /^(@supabase\/|pg$|pg\/|postgres|@neondatabase\/|@prisma\/|kysely|drizzle-orm|mysql|sqlite|better-sqlite3)/;
const DB_FILE = /(^|\/)(supabase[^/]*|db|database|pg)\.(ts|tsx|js|mjs)$/;

/** Runtime import specifiers of one source file (type-only imports/exports skipped). */
function specifiers(src: string): string[] {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  const out: string[] = [];
  for (const m of code.matchAll(/^\s*(?:import|export)\s+(?!type\b)(?:[^;'"]*?\s+from\s+)?["']([^"']+)["']/gm)) out.push(m[1]);
  for (const m of code.matchAll(/\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g)) out.push(m[1]);
  return out;
}

function resolveLocal(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? join(ROOT, spec.slice(2)) : spec.startsWith(".") ? join(dirname(from), spec) : null;
  if (!base) return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  throw new Error(`unresolved local import ${spec} from ${relative(ROOT, from)}`);
}

/** Every file and every bare package reachable from `entry` through runtime imports. */
function importGraph(entry: string): { files: string[]; packages: string[] } {
  const files = new Set<string>(), packages = new Set<string>();
  const todo = [join(ROOT, entry)];
  while (todo.length) {
    const f = todo.pop()!;
    if (files.has(f)) continue;
    files.add(f);
    for (const s of specifiers(readFileSync(f, "utf8"))) {
      const local = resolveLocal(f, s);
      if (local) todo.push(local); else packages.add(s);
    }
  }
  return { files: [...files].map((f) => relative(ROOT, f)).sort(), packages: [...packages].sort() };
}

test("walker self-check: lib/api-public.ts does reach the database client", () => {
  const g = importGraph("lib/api-public.ts");
  assert.ok(g.files.includes("lib/supabase.ts"), "the walker must find lib/supabase.ts behind lib/api-public.ts");
  assert.ok(g.packages.some((p) => DB_PACKAGE.test(p)), "and the @supabase package behind it");
});

test("lib/api-sim.ts reaches no database client, directly or transitively", () => {
  const g = importGraph("lib/api-sim.ts");
  assert.ok(g.files.includes("lib/money.ts"), `harness: the graph includes api-sim's runtime import, got ${g.files.join(", ")}`);
  assert.deepEqual(g.files.filter((f) => DB_FILE.test(f)), [], `database module in api-sim's import graph: ${g.files.join(", ")}`);
  assert.deepEqual(g.packages.filter((p) => DB_PACKAGE.test(p)), [], `database package in api-sim's import graph: ${g.packages.join(", ")}`);
});
