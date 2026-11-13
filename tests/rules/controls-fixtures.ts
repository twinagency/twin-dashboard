/**
 * Shared by the W1 lane 5 (app-onlyfans-controls) tests: spawns one child for one scenario under --experimental-test-module-mocks
 * so the outer test files still run under plain `node --import tsx --test` (init.sh contract). Route scenarios run in
 * tests/rules/controls-route.child.ts, page scenarios in tests/rules/controls-page.child.ts; both share the fake wire in
 * tests/rules/controls-wire.ts. Copied in shape from lane 4's tests/rules/core-fixtures.ts (rwl/W1-lib-onlyfans-core), not imported
 * across branches. The rules glob `*.test.*` does not run these files. Clean env (PATH, HOME, NODE_ENV=test): no real backend or
 * Supabase config can leak in; the children set only `*.fixture.invalid` hosts and obviously synthetic credentials.
 * Every case name is typed: the tuples below are the single source. Each child's scenario dispatch and its per-route handlers
 * (ENGINE_READ_ROUTES, PLAN_C_HANDLERS in the route child) are `Record`s keyed by these types, and results are built as literals,
 * so a renamed, added or missing name is a type error in the child and in the tests, never a silent fall-through to another route.
 * Synthetic values only.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const CHILDREN = { route: "./controls-route.child.ts", page: "./controls-page.child.ts" } as const;
const runs = new Map<string, unknown>();

/** Synthetic operator sessions (shape `owner_<64 hex>`), the named-owner UUID the fake RPC returns, the Plan C pilot account. */
export const SESSION_A = `owner_${"1".repeat(64)}`;
export const SESSION_B = `owner_${"2".repeat(64)}`;
export const NAMED_OWNER = "abcdef01-2345-4abc-8def-0123456789ab";
export const PILOT_ACCOUNT = "of-pilot-1";
/** Planted in every upstream error body, header and statusText in the `upstream` scenario. */
export const SENTINEL = "UPSTREAM-SENTINEL-7f3";

/** The three engine reads under app/api/onlyfans/accounts/[accountId]/. */
export const ENGINE_READS = ["engine-status", "catalogue", "unresolved"] as const;
/** The five Plan C routes under app/api/onlyfans-controls/accounts/[accountId]/plan-c/. */
export const PLAN_C_ROUTES = ["drafts", "unresolved", "reconcile", "conversation", "draft"] as const;
/** Upstream error statuses the `upstream` scenario plants SENTINEL in, and the routes it drives for each. */
export const UPSTREAM_STATUSES = [500, 401, 403, 404, 409] as const;
export const UPSTREAM_ROUTES = [...ENGINE_READS, "requests", "plan-c drafts", "plan-c conversation"] as const;
/** Request-action bodies the requests route must refuse 400 (CH-F). Each breaks exactly one validation rule, so no other rule masks it. */
export const INVALID_COMMANDS = ["unknown key", "note 109 chars", "control char in note", "note missing on complete",
  "expectedRevision -1", "expectedRevision 2^31-1", "expectedRevision 3.5", "unknown action", "environment prod", "note untrimmed",
  "note blank"] as const;
export type EngineRead = (typeof ENGINE_READS)[number];
export type InvalidCommand = (typeof INVALID_COMMANDS)[number];
export type PlanCRoute = (typeof PLAN_C_ROUTES)[number];
export type UpstreamStatus = (typeof UPSTREAM_STATUSES)[number];
export type UpstreamRoute = (typeof UPSTREAM_ROUTES)[number];

/** One backend call as the fake wire saw it. `agency` = path under /onlyfans/agency/v1/; `scoped` = X-OnlyFans-Agency-Scope present. */
export type Call = { method: string; path: string; agency: boolean; scoped: boolean };
/** `actor` is the actor string the route posted to the backend (the backend binds handover ownership to it). */
export type RequestCase = { status: number; outcome: unknown; posts: number; commandKey: string | null; evidenceRef: string | null; actor: string | null };
export type RouteCase = { status: number; calls: Call[] };
/** `leaked` = the sentinel appears in the response status line, headers or body; `reached` = the backend was consulted. */
export type UpstreamCase = { status: number; leaked: boolean; reached: boolean };
export type PageCase = { console: boolean; message: string | null; calls: string[] };
/** The Plan C page mounted in jsdom with effects: `stop` = a STOP control for the pilot conversation that has unresolved work. */
export type ConsoleCase = { console: boolean; stop: boolean; calls: string[]; browser: string[] };
export type OpsCase = { canAct: unknown; panel: boolean; rows: number; reconcile: number };
/** The Operations page server render only: `view` = it rendered an account's operations; `accountReads` = backend account list calls. */
export type OpsGrantCase = { view: boolean; text: string; accountReads: string[] };

/** What each route-child scenario prints. */
export type RouteScenarios = {
  requests: Record<"valid" | "no environment" | "handover no environment" | "session A" | "session A again" | "session B" | "owner lookup 429" | "agency user 1" | "agency user 2"
    | "foreign origin" | "cross-site" | "text/plain" | "oversize", RequestCase>;
  agency: Record<EngineRead | "requests", RouteCase>;
  "plan-c-no-owner": Record<"named owner" | "no owner", Record<PlanCRoute, RouteCase>>;
  upstream: Record<UpstreamStatus, Record<UpstreamRoute, UpstreamCase>>;
  /** The actor the content-sync upload route posts for an internal operator whose named owner resolves. */
  "upload-actor": { posts: number; actor: string | null };
  /** CH-F: "note 108 chars" is the accepted boundary control. */
  validation: Record<InvalidCommand | "note 108 chars", RequestCase>;
};
/** What each page-child scenario prints. */
export type PageScenarios = {
  "plan-c-page": Record<"ok" | "drafts 502" | "scope 502" | "scope 403" | "env, no param" | "env, array param" | "no env, no param", PageCase>;
  operations: Record<"manager" | "chat", OpsCase>;
  "operations-grant": Record<"granted" | "creator outside grant" | "account of another creator", OpsGrantCase>;
  "plan-c-console": Record<"ok" | "drafts 502", ConsoleCase>;
};
export type ControlsScenarios = RouteScenarios & PageScenarios;
const CHILD_OF: Record<keyof ControlsScenarios, keyof typeof CHILDREN> = {
  requests: "route", agency: "route", "plan-c-no-owner": "route", upstream: "route", "upload-actor": "route", validation: "route", "plan-c-page": "page", operations: "page", "operations-grant": "page", "plan-c-console": "page",
};

/** One JSON line from the child, memoized per scenario. A child that crashes fails here (an Error, not an assertion). */
export function controlsChild<S extends keyof ControlsScenarios>(scenario: S): ControlsScenarios[S] {
  if (runs.has(scenario)) return runs.get(scenario) as ControlsScenarios[S];
  const script = fileURLToPath(new URL(CHILDREN[CHILD_OF[scenario]], import.meta.url));
  const child = spawnSync(process.execPath, ["--import", "tsx", "--experimental-test-module-mocks", "--no-warnings", script, scenario],
    { cwd: ROOT, encoding: "utf8", timeout: 120_000, env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", NODE_ENV: "test" } });
  const line = child.stdout.trim().split("\n").at(-1) ?? "";
  if (!line.startsWith("{")) throw new Error(`child ${scenario} did not report (exit ${child.status}, ${String(child.error ?? "")}): ${child.stderr.slice(0, 800)}`);
  // The process boundary is untyped JSON; each child's dispatch map is typed against these scenario types.
  const out = JSON.parse(line) as ControlsScenarios[S];
  runs.set(scenario, out);
  return out;
}
