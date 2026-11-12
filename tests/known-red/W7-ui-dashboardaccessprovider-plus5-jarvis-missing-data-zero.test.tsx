// KNOWN RED (W7 ui-dashboardaccessprovider-plus5, finding F2, bug/high): missing or failed dashboard data must not be
// presented as a found zero. JarvisWorkspace.tsx runQuery (:1163-1173) builds the answer at submit from whatever `data`
// holds and buildResult falls back `stats?.x ?? data?.totals.x ?? 0`; `dataError` only changes idle step text. So when
// /api/dashboard is still pending (cold 1M rollup) or failed (500, route.ts:41-42), "How much revenue?" ends after the
// 10.85 s staged search with "A$0.00 in proceeds" / "I found the fleet-wide current earnings…".
// Condition: any operator on /jarvis asking before /api/dashboard resolves, or after it fails.
// Fixed: no numeric answer without a valid snapshot; show loading / "data unavailable"; no `?? 0` for absent measurements.
// Run: nice -n 10 node --import tsx --test tests/known-red/W7-ui-dashboardaccessprovider-plus5-jarvis-missing-data-zero.test.tsx
// Not wired into npm scripts; init.sh reports it. Offline: jsdom, global fetch stubbed, window.setTimeout faked (the
// 10.85 s search is advanced by hand). Stubbed modules (CJS Module._load, as scripts/check-onlyfans-scoped-earnings.tsx
// does): next/navigation (no app router mounted), @/app/actions/clone-scope (server action, never called here),
// @/components/TwinAssistant (other lane, own fetch/canvas). Canvas getContext returns null, which the draw effect tolerates.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { after, before } from "node:test";
import React, { act } from "react";
const requireNative = createRequire(import.meta.url);
const { JSDOM } = requireNative("jsdom");

const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/jarvis" });
const win = dom.window;
Object.assign(globalThis, { window: win, document: win.document, HTMLElement: win.HTMLElement, HTMLInputElement: win.HTMLInputElement, Event: win.Event, MouseEvent: win.MouseEvent, React, IS_REACT_ACT_ENVIRONMENT: true });
win.HTMLCanvasElement.prototype.getContext = (() => null) as typeof win.HTMLCanvasElement.prototype.getContext;

// Hand-driven clock for the component's window.setTimeout calls only (React and node:test keep the real one).
let now = 0;
let nextId = 1;
const timers = new Map<number, { at: number; fn: () => void }>();
win.setTimeout = ((fn: () => void, ms = 0) => { const id = nextId++; timers.set(id, { at: now + ms, fn }); return id; }) as typeof win.setTimeout;
win.clearTimeout = ((id: number) => { timers.delete(id); }) as typeof win.clearTimeout;
async function advance(ms: number) {
  const end = now + ms;
  for (;;) {
    const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
    if (!due) break;
    timers.delete(due[0]);
    now = due[1].at;
    await act(async () => { due[1].fn(); });
  }
  now = end;
}

const Module = requireNative("node:module") as { _load: (request: string, ...rest: unknown[]) => unknown };
const load = Module._load;
Module._load = (request, ...rest) => {
  if (request === "next/navigation") return { useRouter: () => ({ push() {}, refresh() {}, replace() {} }), usePathname: () => "/jarvis", useSearchParams: () => new URLSearchParams() };
  if (request === "@/app/actions/clone-scope") return { setCloneScope: async () => { throw new Error("server action must not run in this test"); } };
  if (request === "@/components/TwinAssistant") return { __esModule: true, default: () => null };
  return load(request, ...rest);
};

let createRoot: typeof import("react-dom/client").createRoot;
let JarvisWorkspace: typeof import("../../components/JarvisWorkspace").default;
let root: ReturnType<typeof createRoot> | undefined;
before(async () => {
  ({ createRoot } = await import("react-dom/client"));
  ({ default: JarvisWorkspace } = await import("../../components/JarvisWorkspace"));
});
after(async () => { await act(async () => root?.unmount()); Module._load = load; dom.window.close(); });

const fetched: string[] = [];
const PAYLOAD = {
  period: "1M",
  clones: [{ id: "clone-fixture", slug: "fixture", name: "Fixture", color: "#000000", stars: 50000 }],
  bucketLabels: [],
  series: [],
  recent: [],
  totals: { stars: 50000, grossPaymentStars: 50000, sales: 120, costUsd: 3.5, aiErrors: 2, newFans: 10, activeUsers: 30, totalFans: 400, reachable24h: 25, messages: 900, buyers: 45, repeatPct: 20 },
  perClone: {},
};
type Backend = "ok" | "error" | "pending";
function backend(kind: Backend): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    fetched.push(url);
    assert.ok(url.startsWith("/api/dashboard?"), `only /api/dashboard is expected, got ${url}`);
    if (kind === "pending") return new Promise<Response>(() => {});
    if (kind === "error") return Response.json({ error: "rollup failed" }, { status: 500 });
    return Response.json(PAYLOAD);
  }) as typeof fetch;
}

async function ask(kind: Backend, question: string) {
  globalThis.fetch = backend(kind);
  timers.clear();
  if (root) await act(async () => root!.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => { root!.render(<JarvisWorkspace cloneId={null} />); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
  const input = document.querySelector<HTMLInputElement>('input[aria-label="Ask Twin about the dashboard"]');
  assert.ok(input, "ask input rendered");
  await act(async () => {
    Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value")!.set!.call(input, question);
    input.dispatchEvent(new win.Event("input", { bubbles: true }));
  });
  const form = input.closest("form");
  assert.ok(form, "ask form rendered");
  await act(async () => { form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true })); });
  await advance(11_000);
  const card = document.querySelector("article.jarvis-result-card");
  return { card: card?.textContent ?? null, title: card?.querySelector("h2")?.textContent ?? null, page: document.body.textContent ?? "" };
}

const FOUND_ZERO = /\b0\b.*(proceeds|fans found|errors detected)|USD 0|\$0(\.00)?/;

test("control: with a valid snapshot, 'How much revenue?' resolves to the non-zero proceeds", async () => {
  const { card, title } = await ask("ok", "How much revenue?");
  assert.ok(fetched.some(url => url.includes("period=1M")), "dashboard snapshot requested");
  assert.ok(card, "result card shown after the staged search");
  assert.match(title ?? "", /A\$910\.00 in proceeds/);
  assert.doesNotMatch(card, FOUND_ZERO);
});

for (const kind of ["error", "pending"] as const) {
  test(`F2: with /api/dashboard ${kind === "error" ? "failed (500)" : "still pending"}, no zero is presented as a found answer`, async () => {
    const { card } = await ask(kind, "How much revenue?");
    if (card !== null) assert.doesNotMatch(card, FOUND_ZERO, `missing data must not read as a found zero; card said: ${JSON.stringify(card)}`);
  });
}
