// KNOWN RED (W7 ui-revenuedashboard, finding F4a, bug/high): the headline money on an unscoped agency view must price
// each creator at her own Star rate, whatever the sign of the net. RevenueDashboard.tsx:392-399 blends the override
// rates into `scopeRate` only when `windowStars > 0`; at net 0 or below it falls back to the base `usdPerStar`, so
// `money(displayStars)` ignores `cloneRates`. A -100 + B +100 (B at 0.02) is $0.70, shown "$0.00"; A -200 + B +100 is
// "$-0.60", shown "$-1.30".
// Condition: agency login with per-creator `cloneRates` overrides, "All creators", window where refunds >= sales.
// Fixed: headline USD = blendUsd(...) amount directly (no divide back into a rate), for any non-zero or zero net.
// Run: nice -n 10 node --import tsx --test tests/known-red/W7-ui-revenuedashboard-blend-nonpositive.test.tsx
// Not wired into npm scripts; init.sh reports it. Offline: jsdom, global fetch stubbed at the wire (only
// /api/dashboard answers; /api/fx from CurrencyProvider and anything else gets 404 and is recorded). Real
// RevenueDashboard inside the real DashboardAccessProvider (audience agency, non-moxy) and CurrencyProvider
// (usdPerStar 0.013, cloneRates {clone-b: 0.02}, currency USD). Stubbed modules (CJS Module._load) as in the F1 test:
// next/navigation, @/components/NavigationLink, @/components/RevenueDayDrivers, recharts ResponsiveContainer.
// fmtMoney prints negatives as "$-0.60" (lib/money.ts:41-47), so that is the expected string.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { after, before } from "node:test";
import React, { act } from "react";
const requireNative = createRequire(import.meta.url);
const { JSDOM } = requireNative("jsdom");

const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/revenue" });
const win = dom.window;
Object.assign(globalThis, { window: win, document: win.document, HTMLElement: win.HTMLElement, Element: win.Element, Node: win.Node, Event: win.Event, MouseEvent: win.MouseEvent, getComputedStyle: win.getComputedStyle.bind(win), React, IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(globalThis, "localStorage", { value: win.localStorage, configurable: true });
win.localStorage.setItem("currency", "USD");

const Module = requireNative("node:module") as { _load: (request: string, ...rest: unknown[]) => unknown };
const load = Module._load;
Module._load = (request, ...rest) => {
  if (request === "next/navigation") return { useRouter: () => ({ push() {}, refresh() {}, replace() {} }), usePathname: () => "/revenue", useSearchParams: () => new URLSearchParams() };
  if (request === "@/components/NavigationLink") return { __esModule: true, default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => <a href={href} className={className}>{children}</a> };
  if (request === "@/components/RevenueDayDrivers") return { __esModule: true, default: () => null };
  if (request === "recharts") {
    const real = load(request, ...rest) as Record<string, unknown>;
    return { ...real, ResponsiveContainer: () => <div data-stub="responsive-container" /> };
  }
  return load(request, ...rest);
};

let createRoot: typeof import("react-dom/client").createRoot;
let RevenueDashboard: typeof import("../../components/RevenueDashboard").default;
let DashboardAccessProvider: typeof import("../../components/DashboardAccessProvider").default;
let CurrencyProvider: typeof import("../../components/CurrencyProvider").default;
let root: ReturnType<typeof createRoot> | undefined;
before(async () => {
  ({ createRoot } = await import("react-dom/client"));
  ({ default: RevenueDashboard } = await import("../../components/RevenueDashboard"));
  ({ default: DashboardAccessProvider } = await import("../../components/DashboardAccessProvider"));
  ({ default: CurrencyProvider } = await import("../../components/CurrencyProvider"));
});
after(async () => { await act(async () => root?.unmount()); Module._load = load; dom.window.close(); });
const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });

const BASE_RATE = 0.013;
const CLONE_RATES = { "clone-b": 0.02 };

// Per-creator net Stars; series, totals and recent follow from them (one bucket, no ledger rows).
function payload(aStars: number, bStars: number) {
  const cs = (stars: number) => ({ stars, grossPaymentStars: Math.max(stars, 0), sales: stars > 0 ? 1 : 0, newFans: 0, activeUsers: 1, totalFans: 5, reachable24h: 0, messages: 3, buyers: stars > 0 ? 1 : 0, repeatPct: 0 });
  const a = cs(aStars), b = cs(bStars);
  return {
    period: "1M",
    clones: [
      { id: "clone-a", slug: "a", name: "Creator A", color: "#123456", stars: aStars },
      { id: "clone-b", slug: "b", name: "Creator B", color: "#654321", stars: bStars },
    ],
    bucketLabels: ["Nov 1"],
    series: [{ bucket: "Nov 1", "clone-a": aStars, "clone-b": bStars }],
    recent: [],
    totals: {
      stars: aStars + bStars, grossPaymentStars: a.grossPaymentStars + b.grossPaymentStars, sales: a.sales + b.sales, costUsd: 0, aiErrors: 0,
      newFans: 0, activeUsers: 2, totalFans: 10, reachable24h: 0, messages: 6, buyers: a.buyers + b.buyers, repeatPct: 0,
    },
    perClone: { "clone-a": a, "clone-b": b },
    analytics: null,
    balance: null,
    cachedAt: 0,
    ageSeconds: 0,
    stale: false,
  };
}

const dashboardUrls: string[] = [];
const otherUrls: string[] = [];
function backend(body: unknown): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (!url.startsWith("/api/dashboard?")) { otherUrls.push(url); return new Response(null, { status: 404 }); }
    dashboardUrls.push(url);
    return Response.json(body);
  }) as typeof fetch;
}

async function headline(aStars: number, bStars: number) {
  globalThis.fetch = backend(payload(aStars, bStars));
  dashboardUrls.length = 0;
  otherUrls.length = 0;
  if (root) await act(async () => root!.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => {
    root!.render(
      <DashboardAccessProvider audience="agency" agencyName="Fixture Agency">
        <CurrencyProvider usdPerStar={BASE_RATE} cloneRates={CLONE_RATES}>
          <RevenueDashboard cloneId={null} />
        </CurrencyProvider>
      </DashboardAccessProvider>,
    );
  });
  await settle();
  assert.ok(dashboardUrls.length > 0 && dashboardUrls.every(url => !url.includes("clone=")), `unscoped /api/dashboard requested; got ${JSON.stringify(dashboardUrls)}`);
  assert.deepEqual(otherUrls.filter(url => url !== "/api/fx"), [], "no unexpected requests");
  const tile = document.querySelector(".revenue-kpi-primary");
  assert.ok(tile, "Net revenue tile rendered");
  return {
    value: tile.querySelector(".revenue-kpi-value")?.textContent ?? null,
    tile: tile.textContent ?? "",
  };
}

test("control: A +100, B +100 (B at 0.02) -> headline $3.30", async () => {
  const { value, tile } = await headline(100, 100);
  assert.equal(value, "$3.30", `200 Stars at 0.013 plus B's 100 at +0.007; tile said ${JSON.stringify(tile)}`);
});

test("F4a: A -100, B +100 (net 0) -> headline $0.70, B's override still applies", async () => {
  const { value, tile } = await headline(-100, 100);
  assert.equal(value, "$0.70", `A -100 x 0.013 + B 100 x 0.02 = $0.70; tile said ${JSON.stringify(tile)}`);
});

test("F4a: A -200, B +100 (net -100) -> headline $-0.60, B's override still applies", async () => {
  const { value, tile } = await headline(-200, 100);
  assert.equal(value, "$-0.60", `A -200 x 0.013 + B 100 x 0.02 = -$0.60; tile said ${JSON.stringify(tile)}`);
});
