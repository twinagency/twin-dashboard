/**
 * Shared by the W1 lane 4 (lib-onlyfans-core) tests: spawns tests/rules/core-route.child.ts for one scenario under
 * --experimental-test-module-mocks so the outer test files still run under plain `node --import tsx --test` (init.sh contract).
 * The rules glob `*.test.*` does not run this file. Clean env (PATH, HOME, NODE_ENV=test): no real backend or Supabase config
 * can leak in. Synthetic values only.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const CHILD = fileURLToPath(new URL("./core-route.child.ts", import.meta.url));
const runs = new Map<string, unknown>();
/** Synthetic operator session (shape `owner_<64 hex>`, all ones) and the named-owner UUID the fake RPC returns. */
export const OWNER_SESSION = `owner_${"1".repeat(64)}`;
export const NAMED_OWNER = "abcdef01-2345-4abc-8def-0123456789ab";

type RequestCase = { status: number; outcome: unknown; posts: number; commandKey: string | null };
type MemoryRun = { statuses: number[]; lookups: number; keys: unknown[]; actors: unknown[] };
type PilotCase = { result: string; pilotActor: string | null; lookups: number };
/** What each child scenario prints. The child's results `satisfies` these, so a renamed case is a type error, not a runtime TypeError. */
export type CoreScenarios = {
  d6: Record<"chat complete simulation" | "chat mark_reconciled" | "chat complete live" | "manager mark_reconciled", RequestCase>;
  keys: Record<"base" | "base again" | "account of-b" | "conversation" | "request" | "action" | "revision" | "note", RequestCase>;
  "memory-stable": MemoryRun;
  "memory-flap": MemoryRun;
  pilot: Record<"agency session" | "agency identity with operator cookie, plan-c-guard options" | "agency identity with operator cookie, agency options"
    | "view-as" | "operator, lookup fails" | "operator, lookup resolves" | "operator, no pilotIdentity", PilotCase>;
};

/** One JSON line from the child, memoized per scenario. A child that crashes fails here (not on a domain assertion). */
export function coreRouteChild<S extends keyof CoreScenarios>(scenario: S): CoreScenarios[S] {
  if (runs.has(scenario)) return runs.get(scenario) as CoreScenarios[S];
  const child = spawnSync(process.execPath, ["--import", "tsx", "--experimental-test-module-mocks", "--no-warnings", CHILD, scenario],
    { cwd: ROOT, encoding: "utf8", timeout: 120_000, env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", NODE_ENV: "test" } });
  const line = child.stdout.trim().split("\n").at(-1) ?? "";
  if (!line.startsWith("{")) throw new Error(`child ${scenario} did not report (exit ${child.status}, ${String(child.error ?? "")}): ${child.stderr.slice(0, 800)}`);
  // The process boundary is untyped JSON; the child pins the shape with `satisfies CoreScenarios[...]`.
  const out = JSON.parse(line) as CoreScenarios[S];
  runs.set(scenario, out);
  return out;
}
