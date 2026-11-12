/**
 * Known red (W6 app-login-plus2 H1, security high): an agency session sees our AI cost on /logs?view=spend.
 * middleware lets agencies through /logs (lib/agency-policy.ts:29), app/logs/page.tsx renders <SpendView> with no
 * operator check, and dashboardFetch scopes usage_events by clone but admits cost_usd (lib/agency-columns.ts:427).
 * Everywhere else cost is redacted for non-admins (app/api/dashboard/route.ts redactCostFields, RevenueDashboard showCost).
 * Controls (must pass at base and under every fix):
 *  - operator: the same render with access null shows the fake cost, so the fake wire and render path work;
 *  - agency: the same agency cookie is refused by middleware on an admin-only path (identity resolves, agency gate live),
 *    and under the same agency access a usage_events read reaches the fake with the mandatory
 *    and=(clone_id.in.(<agency clone>)) scope, is answered 200, and a clones read returns the agency's clone name.
 * H1 is GREEN only via one of:
 *  (a) middleware answers the agency /logs?view=spend with 403 "Administrator access required" (any other non-200 fails);
 *  (b) the agency render throws a refusal-shaped error: Next digest NEXT_HTTP_ERROR_FALLBACK;404|403|401, NEXT_REDIRECT;...,
 *      NEXT_NOT_FOUND, or an Error message matching /admin|operator|forbidden|not allowed|restricted|denied/i
 *      (any other throw fails with its message);
 *  (c) the agency render shows no cost AND it is not a silent read failure: every agency usage_events request that
 *      reached the fake was answered 200 and selected no cost_usd (the fake projects by `select`), or none reached it
 *      (gated, or refused by dashboardFetch, e.g. 403 because cost_usd is no longer admitted).
 * Offline: globalThis.fetch faked at the Supabase wire on a fake host; next/headers request scope faked via Next's own
 * work/work-unit AsyncLocalStorage (empty cookie jar); viewer terms via __setViewerTermsOverrideForTests (star scaling only).
 * Not wired into npm scripts.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { AsyncLocalStorage } from "node:async_hooks";
import test, { after, before } from "node:test";
import React from "react";

Object.assign(process.env, { SUPABASE_URL: "https://agency-test.supabase.co", SUPABASE_SERVICE_KEY: "fake-service-key" });
Object.assign(globalThis, { AsyncLocalStorage, React }); // ALS: what Next's node runtime installs first; React: classic JSX runtime under tsx
const require = createRequire(import.meta.url);
const { workAsyncStorage } = require("next/dist/server/app-render/work-async-storage.external");
const { workUnitAsyncStorage } = require("next/dist/server/app-render/work-unit-async-storage.external");
const { RequestCookies } = require("next/dist/compiled/@edge-runtime/cookies");

const CLONE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AGENCY = { id: "agency-test", name: "Agency Test", userId: "agency-user", canManage: false, cloneIds: [CLONE] };
const AGENCY_SCOPE = `(clone_id.in.(${CLONE}))`;
const AGENCY_COOKIE = "twin_agency_access=fake-agency-session";
const COST = "$125.00"; // 10 time slices x one usage row at 12.5 USD, fmtUsd(125)
const json = (body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", ...headers } });
/** Return only the `select`ed columns, like PostgREST, so "the page got no cost_usd" is observable at the wire. */
const project = (row: Record<string, unknown>, select: string | null) =>
  !select || select === "*" ? row : Object.fromEntries(select.split(",").map(f => f.trim()).filter(f => f in row).map(f => [f, row[f]]));

/** Every request the fake wire saw, with the status it answered (unset if the fake itself threw). */
type Hit = { table: string | undefined; url: URL; status?: number };
const hits: Hit[] = [];
async function answer(url: URL, table: string | undefined): Promise<Response> {
  if (url.pathname === "/auth/v1/user") return json({ id: AGENCY.userId });
  if (table === "agency_memberships") return json({ creator_scope: "all", creator_ids: [], creator_access_revision: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", agency_id: AGENCY.id });
  if (table === "partner_agencies") return json({ id: AGENCY.id, name: AGENCY.name });
  if (table === "agency_creators") return json([{ clone_id: CLONE }]);
  if (table === "clones") return json([{ id: CLONE, name: "Test Girl", intake: {}, text_model: "test/model" }]);
  if (table === "usage_events") {
    if (url.searchParams.has("or")) return json([]); // a cursor page: slice exhausted
    const at = url.searchParams.getAll("created_at")[0]?.replace(/^gte\./, "") ?? new Date().toISOString();
    const row = { id: `u-${at}`, created_at: at, clone_id: CLONE, flow: "reply", kind: "llm", model: "test/model", cost_usd: 12.5,
      prompt_tokens: 10, completion_tokens: 10, cached_prompt_tokens: 0, cache_write_tokens: 0, cache_discount_usd: 0, ok: true };
    return json([project(row, url.searchParams.get("select"))]);
  }
  if (table === "chat_history") return new Response(null, { status: 200, headers: { "content-range": "0-0/40" } });
  return json([]);
}
async function fakeWire(input: RequestInfo | URL): Promise<Response> {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  assert.equal(url.host, "agency-test.supabase.co", `offline only, got ${url.host}`);
  const hit: Hit = { table: url.pathname.split("/").pop(), url };
  hits.push(hit);
  const res = await answer(url, hit.table);
  hit.status = res.status;
  return res;
}
/** usage_events requests since `from` that carry the agency's mandatory clone scope. */
const agencyUsageHits = (from: number) =>
  hits.slice(from).filter(h => h.table === "usage_events" && h.url.searchParams.getAll("and").includes(AGENCY_SCOPE));

let originalFetch: typeof fetch;
before(async () => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = fakeWire as typeof fetch;
  const { __setViewerTermsOverrideForTests } = await import("../../lib/platform-cut");
  __setViewerTermsOverrideForTests(async () => ({ starMult: 1, usdPerStar: 0.013 }) as never);
});
after(() => { globalThis.fetch = originalFetch; });

/** Run `fn` as `access` inside a faked Next request scope with an empty cookie jar. */
async function inRequest<T>(access: typeof AGENCY | null, fn: () => Promise<T>): Promise<T> {
  const { withDashboardAccess } = await import("../../lib/dashboard-access");
  const workStore = { route: "/logs", forceStatic: false, dynamicShouldError: false };
  const requestStore = { type: "request", phase: "render", cookies: new RequestCookies(new Headers()) };
  return workAsyncStorage.run(workStore, () => workUnitAsyncStorage.run(requestStore, () => withDashboardAccess(access, fn)));
}

/** Render /logs?view=spend to HTML as `access`. */
async function renderSpend(access: typeof AGENCY | null): Promise<string> {
  const { renderToReadableStream } = await import("react-dom/server");
  const { default: LogsPage } = await import("../../app/logs/page");
  return inRequest(access, async () => {
    const tree = await LogsPage({ searchParams: Promise.resolve({ view: "spend" }) });
    let renderError: unknown;
    const stream = await renderToReadableStream(tree, { onError: error => { renderError ??= error; } });
    await stream.allReady;
    const html = await new Response(stream).text();
    if (renderError) throw renderError;
    return html;
  });
}

/** middleware() for `path` with the fake agency session cookie. */
async function agencyGate(path: string): Promise<Response> {
  const { NextRequest } = await import("next/server");
  const { middleware } = await import("../../middleware");
  return middleware(new NextRequest(`https://twin.test${path}`, { headers: { cookie: AGENCY_COOKIE } }));
}

/** Next 15.5 control-flow digests (http-access-fallback.js, redirect-error.js) plus legacy NEXT_NOT_FOUND. */
function refusalShaped(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  if (typeof digest === "string" && /^(NEXT_HTTP_ERROR_FALLBACK;(404|403|401)$|NEXT_REDIRECT;|NEXT_NOT_FOUND$)/.test(digest)) return true;
  return error instanceof Error && /admin|operator|forbidden|not allowed|restricted|denied/i.test(error.message);
}

test("control: the operator's /logs?view=spend renders the fake AI cost", async () => {
  const html = await renderSpend(null);
  assert.match(html, /Total AI spend/);
  assert.ok(html.includes(COST), `operator render should show ${COST}`);
});

test("control: the agency identity and the agency-scoped wire are live in this setup", async () => {
  const gate = await agencyGate("/api-access");
  assert.equal(gate.status, 403, "middleware must resolve the agency cookie and refuse an admin-only path");
  assert.equal(await gate.text(), "Administrator access required");
  const { supabaseAdmin } = await import("../../lib/supabase");
  const from = hits.length;
  const [usage, clones] = await inRequest(AGENCY, () => Promise.all([
    supabaseAdmin.from("usage_events").select("id,clone_id,created_at").limit(1),
    supabaseAdmin.from("clones").select("id,name"),
  ]));
  assert.equal(usage.error, null, `agency usage_events read failed: ${usage.error?.message}`);
  assert.equal((usage.data as { clone_id: string }[])[0]?.clone_id, CLONE);
  assert.equal(clones.error, null, `agency clones read failed: ${clones.error?.message}`);
  assert.equal((clones.data as { name: string }[])[0]?.name, "Test Girl");
  const reached = agencyUsageHits(from);
  assert.equal(reached.length, 1, "the agency usage_events read must reach the fake wire with the mandatory clone scope");
  assert.equal(reached[0].status, 200);
  assert.ok(hits.slice(from).some(h => h.table === "clones" && h.url.searchParams.getAll("and").includes(`(id.in.(${CLONE}))`) && h.status === 200),
    "the agency clones read must reach the fake wire scoped to the agency's clone");
});

test("H1: an agency cannot obtain an AI cost figure from /logs?view=spend", async () => {
  const gate = await agencyGate("/logs?view=spend");
  if (gate.status !== 200) { // fix (a): only the agency gate's own refusal counts
    assert.equal(gate.status, 403, `middleware answered ${gate.status}, not the agency refusal (broken identity/session?)`);
    assert.equal(await gate.text(), "Administrator access required");
    return;
  }
  // The harness must work before a thrown agency render can count as a refusal: no fix changes the operator path.
  assert.ok((await renderSpend(null)).includes(COST), "harness precondition: operator render shows the cost");
  const from = hits.length;
  let html: string;
  try { html = await renderSpend(AGENCY); } catch (error) { // fix (b): the page refuses
    const digest = (error as { digest?: unknown } | null)?.digest;
    assert.ok(refusalShaped(error), `agency render threw a non-refusal error: ${error instanceof Error ? error.message : String(error)}${digest ? ` (digest ${digest})` : ""}`);
    return;
  }
  assert.ok(!html.includes(COST) && !/Total AI spend[^$]*\$[1-9]/.test(html),
    `agency render of /logs?view=spend shows our AI cost ${COST} (middleware status ${gate.status})`);
  // fix (c) or a gated read: no cost shown must not come from a silent read failure at the wire.
  for (const hit of agencyUsageHits(from)) {
    assert.equal(hit.status, 200, `agency usage_events read was answered ${hit.status ?? "nothing (fake threw)"}: no cost shown is a silent read failure, not a fix`);
    assert.ok(!hit.url.searchParams.get("select")?.split(",").includes("cost_usd"), "agency usage_events response still carries cost_usd");
  }
});
