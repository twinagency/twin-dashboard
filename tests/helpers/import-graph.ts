// Shared static import walker for browser-boundary rules (G48 F1). Parses with the TypeScript compiler, so an import list,
// a comment or a multi-line clause cannot fool a regex. Edges, repo-relative posix paths:
//  - value imports: `import x from`, `import { a, type B } from`, `import * as n from`, side-effect `import "m"`;
//  - re-exports: `export * from`, `export * as n from`, `export { x } from`;
//  - dynamic `import("m")` with a string literal specifier.
// Skipped, because the bundler erases them: whole `import type` / `export type` statements, and a brace list whose every
// member is `type X` (`import { type A, type B } from`, no default). Specifiers resolve `@/` (tsconfig paths) and relative
// paths to `.ts`, `.tsx`, `/index.ts`, `/index.tsx`; packages and other extensions are not walked.
// A module whose directive prologue holds "use server" is a boundary: Next sends the browser an action reference, not the module.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** Server-only modules no browser graph may reach: the secret readers (ONLYFANS_*_TOKEN, SUPABASE_SERVICE_KEY, the service-role
 *  clients) and the server-side route/transport layers built on them. Exact repo paths, so a browser-safe sibling such as
 *  engine-operator-core.ts is not caught by a name. */
export const SERVER_MODULES = ["lib/onlyfans/backend-transport.ts", "lib/onlyfans/plan-c-owner-core.ts", "lib/onlyfans/plan-c-owner.ts",
  "lib/supabase.ts", "lib/supabase-service.ts", "lib/onlyfans/engine-operator.ts", "lib/onlyfans/plan-c-backend.ts", "lib/onlyfans/plan-c-guard.ts",
  "lib/onlyfans/plan-c-route.ts", "lib/onlyfans/route.ts"];

const parsed = new Map<string, ts.SourceFile>();
function source(file: string, text?: string): ts.SourceFile {
  if (text !== undefined) return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  let sf = parsed.get(file);
  if (!sf) parsed.set(file, sf = source(file, readFileSync(path.join(ROOT, file), "utf8")));
  return sf;
}

/** "use client" or "use server" if the module's directive prologue (its leading run of string-literal statements) holds one. */
export function directive(file: string, text?: string): string | null {
  for (const statement of (text === undefined ? source(file) : source(file, text)).statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) break;
    if (statement.expression.text === "use client" || statement.expression.text === "use server") return statement.expression.text;
  }
  return null;
}

/** Value specifiers of `text` (or of repo file `file`), in source order. */
export function valueSpecifiers(file: string, text?: string): string[] {
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause, bindings = clause?.namedBindings;
      const typeOnly = !!clause && (clause.isTypeOnly || (!clause.name && !!bindings && ts.isNamedImports(bindings)
        && bindings.elements.length > 0 && bindings.elements.every(element => element.isTypeOnly)));
      if (!typeOnly) out.push(node.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const named = node.exportClause && ts.isNamedExports(node.exportClause) ? node.exportClause : null;
      const typeOnly = node.isTypeOnly || (!!named && named.elements.length > 0 && named.elements.every(element => element.isTypeOnly));
      if (!typeOnly) out.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0])) {
      out.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(text === undefined ? source(file) : source(file, text));
  return out;
}

const isFile = (rel: string) => existsSync(path.join(ROOT, rel)) && statSync(path.join(ROOT, rel)).isFile();
/** Repo-relative file `specifier` resolves to from `from`, or null for a package or an unresolvable path. */
export function resolveSpecifier(from: string, specifier: string): string | null {
  const base = specifier.startsWith("@/") ? specifier.slice(2)
    : specifier.startsWith(".") ? path.posix.join(path.posix.dirname(from), specifier) : null;
  if (base === null) return null;
  return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find(candidate => /\.tsx?$/.test(candidate) && isFile(candidate)) ?? null;
}

/** Every repo file reachable from `entries` by value edges, each with the import chain that first reached it. */
export function importGraph(...entries: string[]): Map<string, string[]> {
  const reached = new Map<string, string[]>(entries.map(entry => [entry, [entry]])), queue = [...entries];
  while (queue.length) {
    const file = queue.shift()!;
    if (directive(file) === "use server" && !entries.includes(file)) continue;
    for (const specifier of valueSpecifiers(file)) {
      const next = resolveSpecifier(file, specifier);
      if (next && !reached.has(next)) { reached.set(next, [...reached.get(file)!, next]); queue.push(next); }
    }
  }
  return reached;
}

/** Every .ts/.tsx file under the given repo directories (node_modules and dot directories skipped). */
export function sourceFiles(...dirs: string[]): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) { if (entry.name !== "node_modules" && !entry.name.startsWith(".")) walk(rel); }
      else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) out.push(rel);
    }
  };
  dirs.forEach(walk);
  return out.sort();
}
