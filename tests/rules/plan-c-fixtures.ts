/**
 * Shared Plan C fixtures for tests/rules/G02-*, G03-* and G05-plan-c-gate-scope tests. Not a test file (the rules glob is *.test.*).
 *
 * Rules these fixtures hold to:
 *  - Every draft is FULLY scoped (seedDraft sends `conversationId: "<account>:<fan>"`), so a test depends only on the rule it names.
 *  - Backends are the real plan-c-backend over a one-answer fake fetch; nothing is cast into a PlanCBackend.
 *  - The route child (planCRouteChild) runs offline with a scrubbed environment: no Supabase, backend URL or key can leak in.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createPlanCBackend } from "../../lib/onlyfans/plan-c-backend";
import { createCommandKeyStore, createPlanCClient } from "../../lib/onlyfans/plan-c-client";
import { PLAN_C_SCHEMA, parsePlanCDraft, type PlanCDraft } from "../../lib/onlyfans/plan-c";
import { MOCK_ACCOUNT, MOCK_TOKEN, seedDraft, seedOffer } from "../contracts/plan-c-mock-backend";
import { OPERATOR_ACTOR } from "../contracts/plan-c-proxy";

export { MOCK_ACCOUNT, PLAN_C_SCHEMA, seedDraft, seedOffer };
export const CONVERSATION = `${MOCK_ACCOUNT}:900000000001`;
export const KEY = "a".repeat(64);

/** List payloads that carry their accountId (G03-unscoped-list is about omitting it). */
export const draftList = (drafts: unknown[], extra: Record<string, unknown> = {}) => ({ schemaVersion: PLAN_C_SCHEMA, ok: true, accountId: MOCK_ACCOUNT, drafts, ...extra });
export const unresolvedList = (items: unknown[], extra: Record<string, unknown> = {}) => ({ schemaVersion: PLAN_C_SCHEMA, ok: true, accountId: MOCK_ACCOUNT, items, ...extra });
export const unresolvedItem = (conversationId: string = CONVERSATION) => ({ id: "unk-1", kind: "unknown_send", owner: "engine", nextStep: "reconcile_with_provider", conversationId });

/** Parse a draft that must be valid; fails the test with a message instead of a later null crash. */
export function parsedDraft(raw: unknown = seedDraft()): PlanCDraft {
  const draft = parsePlanCDraft(raw, MOCK_ACCOUNT);
  assert.ok(draft, "fixture draft did not parse");
  return draft;
}

type Answer = () => Response | Promise<Response>;
const answering = (answer: Answer) => (async () => answer()) as typeof fetch;

/** The real Plan C backend whose every write gets `answer`, issuing one STOP on CONVERSATION. */
export const stopAnswered = (answer: Answer) => createPlanCBackend({ baseUrl: "https://backend.invalid", token: MOCK_TOKEN, fetchImpl: answering(answer) })
  .conversation(MOCK_ACCOUNT, { conversationId: CONVERSATION, action: "stop", expectedRevision: 7, commandKey: KEY, actor: OPERATOR_ACTOR });

/** A browser-side fetch that records each command's key and answers with `answer`. */
export function recordingFetch(answer: Answer) {
  const sent: string[] = [];
  const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => { sent.push(JSON.parse(String(init?.body)).commandKey); return answer(); }) as typeof fetch;
  return { sent, fetchImpl };
}
/** A Plan C client with an inspectable key store over recordingFetch. */
export function recordingClient(answer: Answer) {
  const { sent, fetchImpl } = recordingFetch(answer), keys = createCommandKeyStore();
  return { sent, keys, client: createPlanCClient({ accountId: MOCK_ACCOUNT, fetchImpl, keys }) };
}

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
/**
 * Spawn a tsx child: `node --import tsx <flags> <file> <args>` from the repo root, with the ONLY env PATH, HOME and NODE_ENV=test
 * (no Supabase/backend URL or key can leak in), 120 s timeout. `file` is absolute.
 */
const spawnTsx = (file: string, args: string[] = [], flags: string[] = []) =>
  spawnSync(process.execPath, ["--import", "tsx", ...flags, file, ...args],
    { cwd: ROOT, encoding: "utf8", timeout: 120_000, env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", NODE_ENV: "test" } });

/**
 * Runs tests/rules/plan-c-route.child.ts (the real Plan C routes, see its header) for one scenario, under
 * --experimental-test-module-mocks, and returns its JSON line. Memoized per scenario.
 */
const childRuns = new Map<string, unknown>();
export function planCRouteChild<T>(scenario: "client-refused" | "client-denied" | "scope"): T {
  if (childRuns.has(scenario)) return childRuns.get(scenario) as T;
  const child = spawnTsx(fileURLToPath(new URL("./plan-c-route.child.ts", import.meta.url)), [scenario], ["--experimental-test-module-mocks", "--no-warnings"]);
  const line = child.stdout.trim().split("\n").at(-1) ?? "";
  assert.ok(line.startsWith("{"), `child ${scenario} did not report (exit ${child.status}, ${String(child.error ?? "")}): ${child.stderr.slice(0, 600)}`);
  const out = JSON.parse(line) as T;
  childRuns.set(scenario, out);
  return out;
}
