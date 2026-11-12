// KNOWN RED (W7 ui-revenuedaydrivers-plus8, finding H1 in docs/review/W7/ui-revenuedaydrivers-plus8.md, bug/high): in the
// unscoped ("All creators") view, each "Creator revenue & paid orders" row must price that creator's Stars at her own
// rate. components/RevenueDayDrivers.tsx:119 picks `cloneId ? rateFor(cloneId) : fleetUsdPerStar` and :132 builds one
// `money()` for the whole panel, which :310 hands to the byClone ChangeList, so every creator row (`row.key` is a clone
// id, RevenueChangeRow in lib/revenue-why-changed.ts) is priced at the login-wide blend. Creator B (override 0.02) with
// 100 Stars reads "$1.65" (blend 0.0165) instead of "$2.00"; scoped to clone-b the same 100 Stars read "$2.00".
// Condition: login with per-creator `cloneRates` overrides (CurrencyProvider), unscoped view, drivers panel opened.
// Team's Claude owns the fix (fix-proof: tests/rules/mutations/W7-ui-revenuedaydrivers-plus8/H1-fix-proof.patch).
// Run: nice -n 10 node --import tsx --test tests/known-red/W7-ui-revenuedaydrivers-plus8-fleet-rate.test.tsx
// Not wired into npm scripts; init.sh reports it. Offline: jsdom, global fetch stubbed at the wire (only
// /api/dashboard/day-insight answers; /api/fx from CurrencyProvider and anything else gets 404 and is recorded). Real
// RevenueDayDrivers inside the real CurrencyProvider (usdPerStar 0.013, cloneRates {clone-b: 0.02}, fleetUsdPerStar
// 0.0165, currency USD via localStorage). next/navigation stubbed (CJS Module._load) as in the sister-lane tests.
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
  return load(request, ...rest);
};

let createRoot: typeof import("react-dom/client").createRoot;
let RevenueDayDrivers: typeof import("../../components/RevenueDayDrivers").default;
let CurrencyProvider: typeof import("../../components/CurrencyProvider").default;
let root: ReturnType<typeof createRoot> | undefined;
before(async () => {
  ({ createRoot } = await import("react-dom/client"));
  ({ default: RevenueDayDrivers } = await import("../../components/RevenueDayDrivers"));
  ({ default: CurrencyProvider } = await import("../../components/CurrencyProvider"));
});
after(async () => { await act(async () => root?.unmount()); Module._load = load; dom.window.close(); });
const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
const click = async (element: Element | null | undefined) => { assert.ok(element, "element exists"); await act(async () => { element.dispatchEvent(new win.MouseEvent("click", { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 25)); }); };

const BASE_RATE = 0.013;
const CLONE_RATES = { "clone-b": 0.02 };
const FLEET_BLEND = 0.0165; // what the layout's all-time blend could be; deliberately != 0.02 and != 0.013

type Row = { key: string; label: string; stars: number; sales: number; usualStars: number; usualSales: number; deltaStars: number };
const row = (key: string, label: string, stars: number): Row => ({ key, label, stars, sales: 1, usualStars: 0, usualSales: 0, deltaStars: stars });
const metrics = (stars: number, sales: number) => ({ stars, grossPaymentStars: stars, refundStars: 0, sales, buyers: sales, averageSaleStars: sales ? stars / sales : 0 });

// Shape of RevenueWhyChanged (lib/revenue-why-changed.ts). Feature rows use distinct labels so they never match a creator.
function payload(byClone: Row[]) {
  const stars = byClone.reduce((sum, r) => sum + r.stars, 0);
  return {
    day: { key: "2026-11-12", label: "Thu 12 Nov", partial: true, elapsedLabel: "12h" },
    comparison: {
      label: "30-day median", benchmarkLabel: "30-day benchmark", baselineDays: [], baselineRangeLabel: "13 Oct to 11 Nov",
      scopeLabel: byClone.length === 1 ? byClone[0].label : "all creators", benchmark: metrics(0, 0), sampleDays: 30, baselineIsPartial: true,
    },
    totals: { ...metrics(stars, byClone.length), deltaStars: stars, deltaSales: byClone.length, deltaBuyers: byClone.length, deltaAverageSaleStars: 0 },
    activity: { messagedFans: null, newFans: null, conversationMessages: null, usualMessagedFans: null, usualNewFans: null, usualConversationMessages: null, deltaMessagedFans: null, deltaNewFans: null, deltaConversationMessages: null },
    concentration: { topBuyer: null, largestPayment: null },
    byClone,
    byFeature: [row("photo", "Photos", stars)],
    summary: { headline: "Fixture day", detail: "Fixture detail", concentrated: false },
  };
}

const insightUrls: string[] = [];
const otherUrls: string[] = [];
function backend(body: unknown): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (!url.startsWith("/api/dashboard/day-insight?")) { otherUrls.push(url); return new Response(null, { status: 404 }); }
    insightUrls.push(url);
    return Response.json(body);
  }) as typeof fetch;
}

// Renders, clicks "Inspect" and opens "Earnings breakdown" as a user would; returns each creator row's
// "Selected day: <money> net revenue" figure keyed by label, read from rendered text only.
async function creatorRows(cloneId: string | null, byClone: Row[]) {
  globalThis.fetch = backend(payload(byClone));
  insightUrls.length = 0;
  otherUrls.length = 0;
  if (root) await act(async () => root!.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => {
    root!.render(
      <CurrencyProvider usdPerStar={BASE_RATE} cloneRates={CLONE_RATES} fleetUsdPerStar={FLEET_BLEND}>
        <RevenueDayDrivers cloneId={cloneId} />
      </CurrencyProvider>,
    );
  });
  await settle();
  const toggle = [...document.querySelectorAll("button")].find(b => b.textContent?.includes("Inspect"));
  await click(toggle);
  await settle();
  assert.equal(insightUrls.length, 1, `one day-insight request after opening; got ${JSON.stringify(insightUrls)}`);
  assert.deepEqual(otherUrls.filter(url => url !== "/api/fx"), [], "no unexpected requests");
  const summary = [...document.querySelectorAll("summary")].find(s => s.textContent === "Earnings breakdown");
  await click(summary);
  const heading = [...document.querySelectorAll("div")].find(d => d.textContent === "Creator revenue & paid orders");
  assert.ok(heading?.parentElement, "Creator revenue section rendered");
  const out: Record<string, string> = {};
  for (const label of heading.parentElement.querySelectorAll(".truncate")) {
    const detail = label.nextElementSibling?.textContent ?? "";
    const match = /Selected day: (\S+) net revenue/.exec(detail);
    out[label.textContent ?? ""] = match ? match[1] : `unparsed: ${detail}`;
  }
  return out;
}

test("control: scoped to clone-b, her 100 Stars read $2.00 (her own 0.02 rate)", async () => {
  const rows = await creatorRows("clone-b", [row("clone-b", "Creator B", 100)]);
  assert.equal(rows["Creator B"], "$2.00", `scoped creator row; rows ${JSON.stringify(rows)}`);
});

test("H1: unscoped, Creator B's row reads $2.00 (her rate), not the $1.65 blend; Creator A reads $1.30", async () => {
  const rows = await creatorRows(null, [row("clone-a", "Creator A", 100), row("clone-b", "Creator B", 100)]);
  assert.equal(rows["Creator B"], "$2.00", `100 Stars x 0.02; blend would be $1.65; rows ${JSON.stringify(rows)}`);
  assert.equal(rows["Creator A"], "$1.30", `100 Stars x base 0.013; rows ${JSON.stringify(rows)}`);
});
