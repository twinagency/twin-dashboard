const assert = require("node:assert/strict");
const { build } = require("esbuild");
const fs = require("node:fs");
const path = require("node:path");
const { NextRequest, NextResponse } = require("next/server");

(async () => {
  fs.mkdirSync(path.resolve("node_modules/.cache"), { recursive: true });
  const dir = fs.mkdtempSync(path.resolve("node_modules/.cache/overview-earnings-"));
  const compile = async (entry, name, plugins = []) => {
    const out = path.join(dir, name + ".cjs");
    await build({ entryPoints: [entry], outfile: out, bundle: true, platform: "node", format: "cjs", jsx: "automatic", packages: "external", plugins });
    return require(out);
  };
  try {
    const model = await compile("lib/overview-channel-revenue.ts", "model");
    const money = await compile("lib/money.ts", "money");
    const window = { start: "2026-10-01T00:00:00.000Z", end: "2026-10-20T00:00:00.000Z" };
    const native = { schemaVersion: "of-earnings.v1", window, asOf: window.end, accountCount: 2, coveredAccountCount: 2,
      status: "current", reasons: [], currency: "USD", clearedGrossCents: 8496, clearedNetCents: 6796, clearedCount: 4, pendingCount: 2,
      refundedCount: 0, recentLedgerAt: window.end, fullLedgerAt: window.end,
      recorded: { grossCents: 9096, netCents: 7276, pendingGrossCents: 600, pendingNetCents: 480, paymentCount: 6, lastSuccessfulSyncAt: window.end } };
    const current = model.overviewOnlyFansRevenue(native);
    assert.equal(current.netCents, 7276, "Use recorded net including pending, not gross or only cleared earnings");
    assert.equal(current.includesPending, true);
    assert(model.parseOverviewOnlyFansRevenue(current, window));
    assert.equal(model.parseOverviewOnlyFansRevenue({ ...current, window: { ...window, end: window.start } }, window), null, "Refuse another report window");
    assert.equal(model.parseOverviewOnlyFansRevenue({ ...current, netCents: 1.1 }, window), null);
    assert.equal(model.overviewOnlyFansRevenue({ ...native, recorded: { ...native.recorded, netCents: null } }).netCents, null, "Missing net does not become gross or a partial sum");
    assert.equal(model.overviewOnlyFansRevenue({ ...native, status: "unavailable", reasons: ["ledger_unavailable"], recorded: null }).netCents, null, "A sync failure is not zero");
    assert.equal(model.overviewOnlyFansRevenue({ ...native, status: "unavailable", reasons: ["ledger_stale"] }).status, "delayed");
    const empty = model.overviewOnlyFansRevenue({ ...native, accountCount: 0, coveredAccountCount: 0, status: "unavailable", reasons: ["no_bound_accounts"], recorded: null });
    assert.equal(empty.netCents, 0);
    assert.equal(empty.status, "empty");
    assert.equal(model.parseOverviewOnlyFansRevenue({ ...empty, netCents: 1 }, window), null);

    const route = await compile("app/api/onlyfans/earnings/route.ts", "route", [{ name: "scoped-read-fixture", setup(b) {
      b.onResolve({ filter: /^@\/lib\/onlyfans\/route$/ }, args => ({ path: args.path, namespace: "fixture" }));
      b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "export const PRIVATE_HEADERS={'Cache-Control':'private, no-store'};export const requireOnlyFansRead=async options=>{globalThis.__overviewReadOptions=options;return globalThis.__overviewReadContext;};" }));
    } }]);
    let reads = 0, accountReads = 0, accounts = [];
    const backend = { getEarnings: async value => { reads++; assert.deepEqual(value, window); return { ok: true, data: native }; },
      listAccounts: async value => { accountReads++; assert.deepEqual(value, { creatorId: null }); return { ok: true, data: accounts }; } };
    global.__overviewReadContext = { backend };
    const get = query => route.GET(new NextRequest("http://localhost/api/onlyfans/earnings?" + new URLSearchParams(query)));
    let response = await get(window);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).netCents, 7276);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(global.__overviewReadOptions, { agency: true }, "Use the verified per-agency earnings transport");
    for (const extra of [{ creator: "foreign" }, { accountId: "foreign" }, { tenant: "foreign" }]) {
      assert.equal((await get({ ...window, ...extra })).status, 400, "The browser cannot choose another agency's earnings scope");
    }
    assert.equal(reads, 1);
    assert.equal((await route.GET(new NextRequest("http://localhost/api/onlyfans/earnings?" + new URLSearchParams(window) + "&start=" + encodeURIComponent(window.start)))).status, 400);
    const long = { ...window, start: "1969-01-01T00:00:00.000Z" };
    response = await get(long);
    assert.equal((await response.json()).status, "empty", "No accounts contributes zero even for all-time");
    accounts = [{ accountId: "connected" }];
    response = await get(long);
    const unsupported = await response.json();
    assert.equal(unsupported.netCents, null, "Never truncate a longer report to 90 days and label it complete");
    assert.equal(unsupported.status, "unavailable");
    assert.equal(accountReads, 2);
    const allTime = { ...window, start: "1970-01-01T00:00:00.000Z" };
    global.__overviewReadContext = { backend: { ...backend, getEarnings: async value => {
      assert.deepEqual(value, allTime, "Forward the entire selected history window");
      return { ok: true, data: { ...native, window: allTime } };
    } } };
    response = await get(allTime);
    assert.equal((await response.json()).netCents, 7276);
    global.__overviewReadContext = NextResponse.json({ error: "Denied" }, { status: 403 });
    assert.equal((await get(window)).status, 403);
    assert.equal(reads, 1, "An unauthorised caller does not reach the backend");
    global.__overviewReadContext = { backend: null };
    assert.equal((await get(window)).status, 503);
    global.__overviewReadContext = { backend: { ...backend, getEarnings: async effective => {
      assert(Date.parse(effective.end) <= Date.now(), "A custom calendar end today is capped at now");
      return { ok: true, data: { ...native, window: effective } };
    } } };
    const future = { ...window, start: new Date(Date.now()-86400000).toISOString(), end: new Date(Date.now()+86400000).toISOString() };
    response = await get(future);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).window, future, "The response remains keyed to the selected calendar window");

    const React = require("react");
    const { act } = React;
    const { JSDOM } = require("jsdom");
    const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost" });
    const saved = Object.fromEntries(["window", "document", "navigator", "fetch", "IS_REACT_ACT_ENVIRONMENT"].map(key => [key, Object.getOwnPropertyDescriptor(global, key)]));
    for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true })) {
      Object.defineProperty(global, key, { configurable: true, writable: true, value });
    }
    const { createRoot } = require("react-dom/client");
    const Component = (await compile("components/overview/CombinedNetRevenue.tsx", "component")).default;
    const host = document.getElementById("root"), root = createRoot(host);
    const reportWindow = { startMs: Date.parse(window.start), endMs: Date.parse(window.end) };
    let currency = "USD", fetches = 0, payload = current;
    global.fetch = async () => { fetches++; return Response.json(payload); };
    const render = async (snapshotAt, changedWindow = reportWindow) => {
      const props = { className: "metric", telegramStars: 100, reportWindow: changedWindow, snapshotAt,
        money: stars => money.fmtMoney(money.starsToMoneyRate(stars, currency, 1.4), currency),
        moneyWithUsd: (stars, usd) => money.fmtMoney(money.starsToMoneyRate(stars, currency, 1.4) + money.usdToMoneyRate(usd, currency, 1.4), currency) };
      await act(async () => { root.render(React.createElement(Component, props)); });
    };
    const total = () => host.querySelector("[data-overview-combined-total]").textContent;
    try {
      await render(1);
      assert.equal(total(), "$74.06", "Telegram payout plus OnlyFans net");
      assert.match(host.textContent, /Includes pending OnlyFans earnings/);
      currency = "AUD"; await render(1);
      assert.equal(total(), "A$103.68", "Convert both channels using the same selected exchange rate");
      assert.equal(fetches, 1, "Currency changes only reformat the existing read");
      currency = "USD"; payload = empty; await render(2);
      assert.equal(total(), "$1.30");
      assert.match(host.textContent, /No OnlyFans accounts connected/);
      global.fetch = async () => Response.json({ error: "Unavailable" }, { status: 503 });
      await render(3);
      assert.equal(total(), "Unavailable");
      assert.match(host.textContent, /Telegram \$1\.30/);

      const pending = [];
      global.fetch = url => new Promise(resolve => pending.push({ url: String(url), resolve }));
      await render(4);
      const nextWindow = { ...reportWindow, startMs: reportWindow.startMs + 86400000 };
      await render(5, nextWindow);
      await act(async () => { pending[0].resolve(Response.json(current)); });
      assert.equal(total(), "Loading...", "An older response cannot overwrite the newly selected period");
      await act(async () => { pending[1].resolve(Response.json({ ...current, window: { ...window, start: new Date(nextWindow.startMs).toISOString() }, netCents: 2000 })); });
      assert.equal(total(), "$21.30");
    } finally {
      await act(async () => root.unmount());
      dom.window.close();
      for (const [key, descriptor] of Object.entries(saved)) descriptor ? Object.defineProperty(global, key, descriptor) : delete global[key];
    }
    console.log("PASS overview earnings: net including pending, USD/AUD conversion, exact reporting windows, empty Moxy scope, incomplete history, denied/failed reads, currency changes and stale-response isolation");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
