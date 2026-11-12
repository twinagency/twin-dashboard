// KNOWN RED (W7 ui-revenuedashboard, finding F1, bug/high): a creator switch must never show the previous creator's
// revenue under the new scope. RevenueDashboard.tsx effect (:339-342) only sets `loading`; the KPI tiles render `data`
// regardless. `focusStats = data.perClone[cloneId]` misses for an agency payload scoped to the OLD clone, and
// `displayStars` falls back to `data.totals.stars` (:427-428), so creator A's figure is shown as creator B's for the
// whole load (pending), and forever when B's fetch fails (:321 keeps the last good data; banner :614-630 then says
// "Showing the last window that loaded" while the page is labelled for B).
// Condition: agency (non-moxy) or creator login with >1 clone on /revenue, /creator, /creator/earnings, switching creator.
// Fixed: key `data` by (clone, period/range, summary) and hide or relabel on mismatch; never fall back to `data.totals`
// when `cloneId` is set and `perClone[cloneId]` is missing.
// Run: nice -n 10 node --import tsx --test tests/known-red/W7-ui-revenuedashboard-stale-scope.test.tsx
// Not wired into npm scripts; init.sh reports it. Offline: jsdom, global fetch stubbed at the wire (only
// /api/dashboard answers; /api/fx from CurrencyProvider and anything else gets 404 and is recorded). Real
// RevenueDashboard inside the real DashboardAccessProvider (audience agency) and CurrencyProvider. Stubbed modules (CJS
// Module._load): next/navigation (no app router), @/components/NavigationLink (next/link needs the app router),
// @/components/RevenueDayDrivers (own fetch, other lane), recharts ResponsiveContainer (jsdom has no layout).
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
type Dashboard = typeof import("../../components/RevenueDashboard").default;
let RevenueDashboard: Dashboard;
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

// Creator A's distinctive figure: 12,345 Stars. Rendered in the Net revenue tile as "⭐ 12,345 after adjustments" and
// as money "$160.48" (USD, default 0.013 USD/Star).
const A_STARS = 12345;
const A_FIGURE = "12,345";
const A_MONEY = "$160.48";
const stats = { stars: A_STARS, grossPaymentStars: A_STARS, sales: 37, newFans: 4, activeUsers: 9, totalFans: 81, reachable24h: 3, messages: 120, buyers: 11, repeatPct: 20 };
// Agency-scoped payload for clone=clone-a: the server only returns the requested creator.
const PAYLOAD_A = {
  period: "1M",
  clones: [{ id: "clone-a", slug: "a", name: "Creator A", color: "#123456", stars: A_STARS }],
  bucketLabels: ["Nov 1", "Nov 2"],
  series: [{ bucket: "Nov 1", "clone-a": 6000 }, { bucket: "Nov 2", "clone-a": 6345 }],
  recent: [],
  totals: { ...stats, costUsd: 0, aiErrors: 0 },
  perClone: { "clone-a": stats },
  analytics: null,
  balance: null,
  cachedAt: 0,
  ageSeconds: 0,
  stale: false,
};

const dashboardUrls: string[] = [];
const otherUrls: string[] = [];
type BMode = "error" | "pending";
function backend(bMode: BMode): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.startsWith("/api/dashboard?")) { otherUrls.push(url); return new Response(null, { status: 404 }); }
    dashboardUrls.push(url);
    const clone = new URLSearchParams(url.slice(url.indexOf("?") + 1)).get("clone");
    if (clone === "clone-a") return Response.json(PAYLOAD_A);
    if (clone === "clone-b" && bMode === "error") return Response.json({ error: "rollup failed" }, { status: 500 });
    if (clone === "clone-b") {
      // Never resolves, but honours abort so unmount leaves no 45 s timer behind.
      return new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    }
    return new Response(null, { status: 404 });
  }) as typeof fetch;
}

const tree = (cloneId: string) => (
  <DashboardAccessProvider audience="agency" agencyName="Fixture Agency">
    <CurrencyProvider>
      <RevenueDashboard cloneId={cloneId} />
    </CurrencyProvider>
  </DashboardAccessProvider>
);
const page = () => document.body.textContent ?? "";
const kpiText = () => document.querySelector('section[aria-label="Earnings summary"]')?.textContent ?? "";

async function mountA(bMode: BMode) {
  globalThis.fetch = backend(bMode);
  dashboardUrls.length = 0;
  otherUrls.length = 0;
  if (root) await act(async () => root!.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => { root!.render(tree("clone-a")); });
  await settle();
}
// Same root, same RevenueDashboard instance, new cloneId: what router.refresh() does after the creator switcher.
async function switchToB() {
  await act(async () => { root!.render(tree("clone-b")); });
  await settle();
}

test("control: scoped to creator A, the Net revenue tile shows A's 12,345 Stars", async () => {
  await mountA("error");
  assert.ok(dashboardUrls.some(url => url.includes("clone=clone-a")), `clone-a requested; got ${JSON.stringify(dashboardUrls)}`);
  assert.ok(kpiText().includes(A_FIGURE), `A's Stars in the KPI tiles; got ${JSON.stringify(kpiText().slice(0, 300))}`);
  assert.ok(kpiText().includes(A_MONEY), `A's money in the KPI tiles; got ${JSON.stringify(kpiText().slice(0, 300))}`);
  assert.deepEqual(otherUrls.filter(url => url !== "/api/fx"), [], "no unexpected requests");
});

for (const bMode of ["error", "pending"] as const) {
  test(`F1: after switching A -> B with B's /api/dashboard ${bMode === "error" ? "failed (500)" : "still pending"}, A's 12,345 is not shown under B`, async () => {
    await mountA(bMode);
    assert.ok(page().includes(A_FIGURE), "precondition: A's figure shown before the switch");
    await switchToB();
    assert.ok(dashboardUrls.some(url => url.includes("clone=clone-b")), `clone-b requested; got ${JSON.stringify(dashboardUrls)}`);
    const text = page();
    const leaked = [A_FIGURE, A_MONEY].filter(figure => text.includes(figure));
    assert.deepEqual(leaked, [], `creator A's revenue is still on screen while scoped to creator B; KPI tiles said: ${JSON.stringify(kpiText().slice(0, 300))}`);
  });
}
