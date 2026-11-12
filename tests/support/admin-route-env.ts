/**
 * Process setup for driving app/api/admin/v1/* route handlers offline. Import it as the FIRST line of a test file,
 * before any route or lib module: the shims below must exist before next/* and lib/* evaluate.
 *  - env: fake Supabase URL/key (clients are lazy, but every request reads these) and a 49-char fake admin key.
 *  - AsyncLocalStorage: Next's server sets this global before loading routes; without it Next's async storages are
 *    fakes that throw on run().
 *  - `server-only`: resolves only inside the Next bundler; scripts/tsconfig.json maps it to scripts/server-only.ts,
 *    this does the same through a resolve hook.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import * as nodeModule from "node:module";

export const FAKE_SUPABASE = "http://fake-supabase.invalid";
export const FAKE_ADMIN_KEY = "test-key-" + "x".repeat(40);

process.env.SUPABASE_URL = FAKE_SUPABASE;
process.env.SUPABASE_SERVICE_KEY = "test-service-" + "x".repeat(40);
process.env.TWIN_ADMIN_API_KEY = FAKE_ADMIN_KEY;
delete process.env.TWIN_ADMIN_ALLOW_PUBLIC;

(globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage ??= AsyncLocalStorage;

// module.registerHooks exists since Node 23.5 (repo runs 23.6) but the installed @types/node predates it.
type ResolveHook = (specifier: string, context: unknown, next: (s: string, c: unknown) => unknown) => unknown;
const SERVER_ONLY_STUB = new URL("../../scripts/server-only.ts", import.meta.url).href;
(nodeModule as unknown as { registerHooks(h: { resolve: ResolveHook }): void }).registerHooks({
  resolve: (specifier, context, next) =>
    specifier === "server-only" ? { url: SERVER_ONLY_STUB, shortCircuit: true } : next(specifier, context),
});
