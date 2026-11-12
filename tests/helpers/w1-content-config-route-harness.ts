// W1 lane 6 (app-onlyfans-content-config) shared route harness. Drives the REAL route handlers under
// app/api/onlyfans-configuration/** and app/api/onlyfans-content/** offline, with a fake wire.
// Replaced, and only this: `lib/onlyfans/route.ts` (mock.module). It cannot be imported for real offline (plan-c-owner is
// server-only, the session stack reads cookies). THIS MOCK MUST FOLLOW route.ts: it carries route.ts's full runtime export surface,
// requestId/denialResponse/readResponse/badRequest copied verbatim, and `routeMockDrift()` reads route.ts's source and reports any
// export or requestId-pattern drift. Every test asserts it (directly in a control, and inside `call()` before a route is imported),
// so drift is an ERR_ASSERTION, never a link crash.
// Session: the internal operator only (`op-session:` + synthetic 64 hex, operatorSession true, canManage true); agency paths are out of scope.
// Its `fetch` is a recording stub, so every upstream call the real backends make (moxy, preparation, vault, engine-catalogue) lands in `calls`.
// Env (restored after the file): ONLYFANS_API_BASE_URL = https://backend.invalid, one distinct synthetic token per purpose (a shared
// token reads as unconfigured, backend-transport.ts:17), DASHBOARD_PUBLIC_ORIGIN = ORIGIN so trustedFormOrigin accepts our Origin.
// Module mocks need --experimental-test-module-mocks; `ensureModuleMocks` re-runs the file with it when absent (see there).
// Used by tests/known-red/w1-content-config-*.test.ts and tests/rules/w1-content-config-routes.test.ts. Synthetic values only.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import test, { after, mock } from "node:test";
import { NextRequest, NextResponse } from "next/server";
import { MOXY_SCHEMA, starterSettings, type MoxyChange } from "../../lib/onlyfans/moxy";
import { ENGINE_CATALOGUE_SCHEMA } from "../../lib/onlyfans/engine-catalogue";

export const ORIGIN = "http://dash.test";
export const BACKEND = "https://backend.invalid";
export const OPERATOR_ACTOR = `op-session:${"5".repeat(64)}`;
export const HASH = "e".repeat(64);
export const NONCE = "0a1b2c3d-1111-4222-8333-444455556661";

/** Route templates under app/api/ (module = `<template>/route.ts`, URL = `/api/<template>` with params filled in). */
export const ROUTES = {
  moxy: "onlyfans-configuration/accounts/[accountId]/moxy",
  preparation: "onlyfans-configuration/accounts/[accountId]/preparation",
  catalogue: "onlyfans-content/accounts/[accountId]/engine-catalogue/[itemId]",
  drafts: "onlyfans-content/accounts/[accountId]/vault/category-drafts",
  price: "onlyfans-content/accounts/[accountId]/vault/category-price/[folderId]",
  review: "onlyfans-content/accounts/[accountId]/vault/category-review/[folderId]",
} as const;

export type Call = { url: string; method: string; body: Record<string, unknown> | null };
type Responder = (call: Call) => Response;

// ── Fixtures ──
export const moxyChange: MoxyChange = { expectedRevision: 4, mode: "off", settings: starterSettings("synthetic") };
/** A valid Moxy ack (moxy.ts moxyAck) for whatever change was sent; `top`/`moxy` add extra upstream keys. */
export const moxyAckFor = (top: Record<string, unknown> = {}, moxy: Record<string, unknown> = {}): Responder => (call) => {
  const sent = call.body as MoxyChange;
  return Response.json({ ok: true, schemaVersion: MOXY_SCHEMA, accountId: "of-a", ...top, moxy: { engine: "moxy", moxySelected: true, mode: sent.mode,
    revision: sent.expectedRevision + 1, readiness: { ready: false, blockers: ["synthetic_blocker"] }, settings: sent.settings, decisions: [], ...moxy } });
};
export const decision = { action: "approve", expectedRevision: 3, expectedFingerprint: "b".repeat(64), confirmedPriceCents: 1200 };
/** A valid catalogue ack (engine-catalogue.ts parseCatalogueDecisionAck) echoing the relayed commandKey; item 123, approve, revision 3. */
export const catalogueAck: Responder = (call) => Response.json({ schemaVersion: ENGINE_CATALOGUE_SCHEMA, ok: true, applied: true, accountId: "of-a",
  itemId: "123", commandKey: call.body?.commandKey, action: "approve", recordedRevision: 4, status: "approved" });
/** A valid preparation config (preparation.ts validPreparationConfig); fixture qualification, small budget. */
export const preparationConfig = { contract_version: "preparation.v1", provider_account: "acct_synthetic", creator_id: "123",
  qualification: { mode: "fixture", reference: "synthetic-approval" }, limits: { provider_requests: 10, provider_credit_budget: 100, provider_credits_per_request: 5 } };
export const category = { folderId: 7, priceCents: 5000, categoryPriceRevision: 1, classificationConfirmed: true, rightsConfirmed: true,
  reviewedState: { version: "agency-category-review.v1", bindingId: "binding-1", categoryFingerprint: HASH, assets: { "1001": HASH } },
  products: [{ label: "Beach single", description: "One beach photo.", mediaIds: ["1001"], previewMediaIds: [] }] };

// ── Fake wire ──
/** Every upstream request since the last `upstream(...)`. */
export const calls: Call[] = [];
let respond: Responder = () => Response.json({}, { status: 200 });
/** Sets what the fake backend answers and clears the call log. */
export function upstream(responder: Responder = () => Response.json({}, { status: 200 })) { respond = responder; calls.length = 0; }
const recordingFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const call: Call = { url: String(input), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null };
  calls.push(call);
  return respond(call);
}) as typeof fetch;

// ── route.ts mock (verbatim copies; keep in step with lib/onlyfans/route.ts) ──
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", "X-Data-Mode": "live" } as const;
export const REQUEST_ID = /^[A-Za-z0-9._:-]{1,64}$/;
type Denial = { status: number; state: string; code: string; error: string };
const denialResponse = (denial: Denial) => NextResponse.json({ ok: false, state: denial.state, code: denial.code, error: denial.error },
  { status: denial.status, headers: PRIVATE_HEADERS });
const routeMock = {
  PRIVATE_HEADERS,
  denialResponse,
  requireOnlyFansRead: async () => ({ auth: { operatorSession: true, agency: false, viewAs: false }, backend: null, fetch: recordingFetch,
    actor: OPERATOR_ACTOR, pilotActor: null, canManage: true, canChat: true }),
  readResponse: (result: { ok: boolean; body?: unknown } & Partial<Denial>) => result.ok
    ? NextResponse.json(result.body, { status: 200, headers: PRIVATE_HEADERS }) : denialResponse(result as Denial),
  requestId: (value: string | null | undefined) => { const trimmed = (value ?? "").trim(); return REQUEST_ID.test(trimmed) ? trimmed : null; },
  badRequest: (error: string) => NextResponse.json({ ok: false, state: "error", code: "invalid_request", error }, { status: 400, headers: PRIVATE_HEADERS }),
};

/** Differences between this mock and lib/onlyfans/route.ts (runtime exports, requestId pattern). Empty = in step. */
export function routeMockDrift(): string[] {
  const source = readFileSync(new URL("../../lib/onlyfans/route.ts", import.meta.url), "utf8");
  const exported = [...source.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+(\w+)/gm)].map(m => m[1]).sort();
  const mocked = Object.keys(routeMock).sort();
  const pattern = /export function requestId[\s\S]*?(\/\^[^\n]*?\$\/)\.test/.exec(source)?.[1] ?? "(not found)";
  return [
    ...exported.filter(name => !mocked.includes(name)).map(name => `route.ts exports ${name}, the mock does not`),
    ...mocked.filter(name => !exported.includes(name)).map(name => `the mock exports ${name}, route.ts does not`),
    ...(pattern === String(REQUEST_ID) ? [] : [`requestId pattern ${pattern} != harness ${String(REQUEST_ID)}`]),
  ];
}

const ENV_KEYS = (env: NodeJS.ProcessEnv) => Object.keys(env).filter(k => k.startsWith("ONLYFANS_") || k === "DASHBOARD_PUBLIC_ORIGIN" || k === "DASHBOARD_EXTRA_ORIGINS");
function install() {
  const saved = Object.fromEntries(ENV_KEYS(process.env).map(k => [k, process.env[k]]));
  for (const k of ENV_KEYS(process.env)) delete process.env[k];
  process.env.ONLYFANS_API_BASE_URL = BACKEND;
  process.env.ONLYFANS_CONFIGURATION_TOKEN = "synthetic-configuration-token";
  process.env.ONLYFANS_CONTENT_TOKEN = "synthetic-content-token";
  process.env.DASHBOARD_PUBLIC_ORIGIN = ORIGIN;
  const mocked = mock.module(new URL("../../lib/onlyfans/route.ts", import.meta.url).href, { namedExports: routeMock });
  after(() => {
    mocked.restore();
    for (const k of ENV_KEYS(process.env)) delete process.env[k];
    Object.assign(process.env, saved);
  });
}

/**
 * Call at the top of a test file: `if (ensureModuleMocks(import.meta.url, { controls, rest })) { ...tests... }`.
 * With module mocks available it installs the route.ts mock and returns true. Without (init.sh's plain `node --import tsx --test`),
 * it defines up to two tests that re-run the file under --experimental-test-module-mocks and returns false:
 *  - "control: …" re-runs only `^control` tests (must all pass, at least `controls` of them),
 *  - the other re-runs everything else (must all pass, at least `rest` of them).
 * so init.sh's `--test-name-pattern='^control'` / `--test-skip-pattern='^control'` pick the matching half. A failed re-run is printed
 * and fails with ERR_ASSERTION only if the child failed on an assertion; a crash, timeout or vacuous run fails with a plain Error.
 */
export function ensureModuleMocks(url: string, expected: { controls: number; rest: number }): boolean {
  if (typeof mock.module === "function") { install(); return true; }
  const file = fileURLToPath(url), name = basename(file);
  // Allowlist: only loader flags and their values carry over (tsx). Test-runner flags, in either `--x=v` or `--x v` form, never do.
  const inherited: string[] = [];
  for (let i = 0; i < process.execArgv.length; i++) {
    const arg = process.execArgv[i];
    if (/^(?:--import|--require|-r|--loader|--experimental-loader)$/.test(arg) && i + 1 < process.execArgv.length) inherited.push(arg, process.execArgv[++i]);
    else if (/^(?:--import|--require|--loader|--experimental-loader)=/.test(arg)) inherited.push(arg);
  }
  const rerun = (pattern: string, min: number) => () => {
    // NODE_TEST_CONTEXT would make the child skip its files and exit 0 having run nothing.
    const { NODE_TEST_CONTEXT: _context, ...env } = process.env;
    const child = spawnSync(process.execPath, [...inherited, "--experimental-test-module-mocks", "--test", "--test-reporter=spec", pattern, file],
      { env, encoding: "utf8", timeout: 120_000 });
    const out = `${child.stdout ?? ""}${child.stderr ?? ""}`;
    const ran = Number(/^ℹ tests (\d+)/m.exec(out)?.[1] ?? 0), passed = Number(/^ℹ pass (\d+)/m.exec(out)?.[1] ?? 0);
    if (child.status === 0 && ran >= min && passed === ran) return;
    process.stdout.write(out);
    const failed = [...new Set([...out.matchAll(/^\s*✖ (.+?) \(\d/gm)].map(m => m[1]))].join(" | ");
    if (out.includes("ERR_ASSERTION")) throw new assert.AssertionError({ message: `${name} under --experimental-test-module-mocks (${pattern}): ${failed}` });
    throw new Error(`${name} re-run did not assert (status ${child.status}, signal ${child.signal}, tests ${ran}/${min}+, pass ${passed}); output above`);
  };
  if (expected.controls) test(`control: ${name} controls pass under --experimental-test-module-mocks`, rerun("--test-name-pattern=^control", expected.controls));
  if (expected.rest) test(`${name} tests pass under --experimental-test-module-mocks`, rerun("--test-skip-pattern=^control", expected.rest));
  return false;
}

/** Calls a real route handler: `call(ROUTES.price, { accountId: "of-a", folderId: "7" }, { body, query })`. POST when a body is given, else GET. */
export async function call(template: string, params: Record<string, string>, options: { body?: unknown; query?: string } = {}) {
  assert.deepEqual(routeMockDrift(), [], "the route.ts mock no longer matches lib/onlyfans/route.ts; update the harness");
  const method = options.body === undefined ? "GET" : "POST";
  const mod = await import(new URL(`../../app/api/${template}/route.ts`, import.meta.url).href) as Record<string, unknown>;
  const handler = mod[method] as ((request: NextRequest, context: { params: Promise<Record<string, string>> }) => Promise<Response>) | undefined;
  assert.ok(handler, `${template} has no ${method} handler`);
  const path = "/api/" + template.replace(/\[(\w+)\]/g, (_, key: string) => { assert.ok(key in params, `missing param ${key}`); return params[key]; }) + (options.query ?? "");
  const request = method === "GET" ? new NextRequest(ORIGIN + path, { method }) : new NextRequest(ORIGIN + path, { method,
    body: typeof options.body === "string" ? options.body : JSON.stringify(options.body),
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", origin: ORIGIN } });
  return handler(request, { params: Promise.resolve(params) });
}
