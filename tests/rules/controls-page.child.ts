/**
 * Page child for the W1 lane 5 (app-onlyfans-controls) tests. Spawned by tests/rules/controls-fixtures.ts under
 * --experimental-test-module-mocks; the rules glob `*.test.*` does not run it. Renders the REAL pages app/onlyfans/plan-c/page.tsx
 * (server render to static markup) and app/onlyfans/operations/page.tsx (server render, then its client panel in jsdom with a fake
 * browser fetch serving tests/contracts/fixtures/engine-unresolved-live.json); `plan-c-console` mounts the Plan C page in jsdom too,
 * its browser fetch forwarded to the REAL Plan C read routes. All over the fake wire and identity setup in
 * tests/rules/controls-wire.ts (see its header for exactly what is replaced).
 * Usage: controls-page.child.ts <plan-c-page | operations | plan-c-console>. Prints one JSON line. Synthetic values only.
 */
import { createRequire } from "node:module";
import React from "react";
import type { AgencyIdentity } from "../../lib/agency-identity";
import { NextRequest } from "next/server";
import { PILOT_ACCOUNT, SESSION_A, type ConsoleCase, type OpsCase, type PageCase, type PageScenarios } from "./controls-fixtures";
import { CHAT_AGENCY, DASH, MANAGER_AGENCY, PLAN_C_FAN, acting, calls, fixture, runChild, since, state } from "./controls-wire";

const MESSAGES = ["Select the configured pilot account.", "This pilot account is not available to this session.",
  "Plan C is available to the configured administrator only.", "The pilot backend is not configured.", "Your session cannot open this page. Sign in as the operator."];

/** Render the Plan C page as the internal operator with the given env pilot, search params and backend modes. */
async function planCPage(env: string | undefined, searchParams: { account?: string | string[] }, draftMode: "ok" | "502" = "ok",
  scopeMode: "ok" | "502" = "ok"): Promise<PageCase> {
  const { default: PlanCPage } = await import("../../app/onlyfans/plan-c/page");
  const { renderToStaticMarkup } = await import("react-dom/server");
  if (env === undefined) delete process.env.ONLYFANS_PLAN_C_ACCOUNT; else process.env.ONLYFANS_PLAN_C_ACCOUNT = env;
  state.drafts = draftMode; state.scope = scopeMode;
  const before = calls.length;
  const markup = renderToStaticMarkup(await acting(null, SESSION_A, () => PlanCPage({ searchParams: Promise.resolve(searchParams) })));
  return { console: markup.includes("data-plan-c-console"), message: MESSAGES.find(m => markup.includes(m)) ?? null,
    calls: since(before).map(c => `${c.method} ${decodeURIComponent(c.path)}`) };
}

/** jsdom globals for a client mount (next/link needs `self`). */
function installDom(url: string) {
  const { JSDOM } = createRequire(import.meta.url)("jsdom");
  const dom = new JSDOM('<div id="root"></div>', { url });
  Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent, IS_REACT_ACT_ENVIRONMENT: true });
  return dom;
}
/** Mount `element` in a fresh root, let its effects and fetches settle, run `inspect`, unmount. */
async function mounted<T>(element: React.ReactElement, settleMs: number, inspect: () => T): Promise<T> {
  const { createRoot } = await import("react-dom/client");
  document.body.innerHTML = '<div id="root"></div>';
  const root = createRoot(document.getElementById("root")!);
  await React.act(async () => { root.render(element); });
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, settleMs)); });
  const out = inspect();
  await React.act(async () => root.unmount());
  return out;
}

/** Server-render the Operations page as each agency, then mount both trees in jsdom; the browser fetch serves only the unresolved read. */
async function operations(): Promise<PageScenarios["operations"]> {
  const { default: OperationsPage } = await import("../../app/onlyfans/operations/page");
  const serverRender = (access: AgencyIdentity) => acting(access, undefined, () => OperationsPage({ searchParams: Promise.resolve({ account: "of-a" }) }));
  const manager = await serverRender(MANAGER_AGENCY), chat = await serverRender(CHAT_AGENCY);
  // Browser phase: the page's client panel reads /api/onlyfans/accounts/of-a/engine/unresolved through the browser fetch.
  const dom = installDom(`${DASH}/onlyfans/operations?account=of-a`);
  globalThis.fetch = (async (input: RequestInfo | URL) => String(input).startsWith("/api/onlyfans/accounts/of-a/engine/unresolved?")
    ? Response.json(fixture("engine-unresolved-live")) : Response.json({ error: "not served" }, { status: 404 })) as typeof fetch;
  const mount = (element: React.ReactElement): Promise<OpsCase> => mounted(element, 50, () => ({
    canAct: (element.props as Record<string, unknown>).canAct ?? null, panel: !!document.querySelector("[data-engine-unresolved-panel]"),
    rows: document.querySelectorAll("[data-engine-unresolved-row]").length, reconcile: document.querySelectorAll("[data-engine-reconcile]").length }));
  const out = { manager: await mount(manager), chat: await mount(chat) };
  dom.window.close();
  return out;
}

/**
 * Server-render the Plan C page (named owner, `?account=` the pilot) with the draft read ok or 502, then mount it in jsdom with
 * effects. The browser fetch sends the console's own `/api/onlyfans-controls/...` reads to the REAL Plan C route handlers (same
 * session), which reach the fake backend; anything absolute goes straight to the wire. Draft mode stays as set, so in "drafts 502"
 * the console's own draft read fails too, while the unresolved read returns one item on the pilot conversation.
 */
async function planCConsole(draftMode: "ok" | "502"): Promise<ConsoleCase> {
  const { default: PlanCPage } = await import("../../app/onlyfans/plan-c/page");
  delete process.env.ONLYFANS_PLAN_C_ACCOUNT;
  state.drafts = draftMode; state.scope = "ok";
  const before = calls.length;
  const element = await acting(null, SESSION_A, () => PlanCPage({ searchParams: Promise.resolve({ account: PILOT_ACCOUNT }) }));
  const serverCalls = since(before).map(c => `${c.method} ${decodeURIComponent(c.path)}`);
  const browser: string[] = [];
  const wire = globalThis.fetch;
  const routes: Record<"drafts" | "unresolved", () => Promise<{ GET: (request: NextRequest, context: { params: Promise<{ accountId: string }> }) => Promise<Response> }>> = {
    drafts: () => import("../../app/api/onlyfans-controls/accounts/[accountId]/plan-c/drafts/route"),
    unresolved: () => import("../../app/api/onlyfans-controls/accounts/[accountId]/plan-c/unresolved/route"),
  };
  const dom = installDom(`${DASH}/onlyfans/plan-c?account=${PILOT_ACCOUNT}`);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.startsWith("/")) return wire(input, init);
    browser.push(`${init?.method ?? "GET"} ${url}`);
    const m = /^\/api\/onlyfans-controls\/accounts\/([^/]+)\/plan-c\/(drafts|unresolved)$/.exec(url);
    if (!m || (init?.method ?? "GET") !== "GET") return Response.json({ error: "not served" }, { status: 404 });
    const route = await routes[m[2] === "drafts" ? "drafts" : "unresolved"]();
    return acting(null, SESSION_A, () => route.GET(new NextRequest(`${DASH}${url}`), { params: Promise.resolve({ accountId: decodeURIComponent(m[1]) }) }));
  }) as typeof fetch;
  const conversation = `${PILOT_ACCOUNT}:${PLAN_C_FAN}`;
  const out = await mounted(element, 200, () => ({ console: !!document.querySelector("[data-plan-c-console]"),
    stop: !!document.querySelector(`[data-plan-c-conversation="${conversation}"] [data-plan-c-conversation-action="stop"]`),
    calls: serverCalls, browser: [...browser] }));
  globalThis.fetch = wire;
  dom.window.close();
  return out;
}

runChild<PageScenarios>({
  "plan-c-page": async () => ({
    ok: await planCPage(undefined, { account: PILOT_ACCOUNT }),
    "drafts 502": await planCPage(undefined, { account: PILOT_ACCOUNT }, "502"),
    "scope 502": await planCPage(undefined, { account: PILOT_ACCOUNT }, "ok", "502"),
    "env, no param": await planCPage(PILOT_ACCOUNT, {}),
    "env, array param": await planCPage(PILOT_ACCOUNT, { account: ["a-1", "b-1"] }),
    "no env, no param": await planCPage(undefined, {}),
  }),
  operations,
  "plan-c-console": async () => ({ ok: await planCConsole("ok"), "drafts 502": await planCConsole("502") }),
});
