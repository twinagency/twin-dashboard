// Shared harness for the W6-app-media-1 known-red tests (not a test file itself: the name does not match *.test.*).
// Renders app/media/MediaManager.tsx in jsdom with React act. The server actions are faked at the module boundary,
// which is the client's wire: an in-process Node loader hook (module.registerHooks, no extra node flags) swaps
// app/media/actions.ts, app/media/catalogue-bundle-actions.ts and next/navigation for fake modules whose exports
// delegate to globalThis.__w6media, so the real "use server" files (Supabase, storage, vision) are never loaded.
// Offline: global fetch, createImageBitmap, alert and confirm are stubbed; nothing touches a network or a database.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import React, { act } from "react";
import { PRICING_CATEGORIES } from "../../lib/pricing";
const { JSDOM } = createRequire(import.meta.url)("jsdom");

const ACTIONS = ["uploadPhoto", "uploadVideo", "updatePhoto", "completeReview", "updateVideo", "deletePhoto", "deleteVideo",
  "createBundle", "updateBundle", "deleteBundle", "addBundleItem", "removeBundleItem", "updateCategoryPricing",
  "previewRepriceMedia", "repriceMedia", "bulkSetMediaPrice", "bulkDeleteMedia", "getSignedUrl"];
const CATALOGUE_ACTIONS = ["createCatalogueBundle", "setCatalogueBundleEnabled", "deleteCatalogueBundle"];
// Fakes are CommonJS files in a fresh temp dir (outside the repo): MediaManager.tsx is compiled to CommonJS by tsx in this
// "type"-less package, so the default loader can require() them with no load hook.
function makeFakeDir(): string {
  try { return mkdtempSync(join(tmpdir(), "w6media-")); } catch (error) {
    throw new Error(`W6-app-media-1 harness needs a writable os.tmpdir() (${tmpdir()}) for its fake action modules: ${(error as Error).message}`);
  }
}
const fakeDir = makeFakeDir();
process.on("exit", () => rmSync(fakeDir, { recursive: true, force: true }));
const fake = (name: string, lines: string[]) => { const file = join(fakeDir, name); writeFileSync(file, lines.join("\n")); return pathToFileURL(file).href; };
const fakeActions = (name: string, names: string[]) => fake(name,
  names.map(n => `exports.${n} = (...args) => globalThis.__w6media.invoke(${JSON.stringify(n)}, args);`));
const fakeNavigation = fake("navigation.cjs", [
  "exports.useRouter = () => globalThis.__w6media.router;",
  "exports.usePathname = () => globalThis.__w6media.pathname;",
  "exports.useSearchParams = () => new URLSearchParams();",
  "exports.useParams = () => ({});",
  "exports.redirect = () => { throw new Error('redirect called in a client test'); };",
  "exports.notFound = () => { throw new Error('notFound called in a client test'); };",
]);
const redirects: [string, string][] = [
  ["/app/media/actions.ts", fakeActions("actions.cjs", ACTIONS)],
  ["/app/media/catalogue-bundle-actions.ts", fakeActions("catalogue-bundle-actions.cjs", CATALOGUE_ACTIONS)],
  ["/node_modules/next/navigation.js", fakeNavigation],
];
// module.registerHooks (in-thread, sync), not the async module.register: MediaManager.tsx loads as CommonJS under tsx,
// and its require() calls never reach async register() hooks (measured on Node 23.6.1: "Cannot find module
// 'server-only'" from the real actions.ts). registerHooks covers require and import alike.
const { registerHooks } = createRequire(import.meta.url)("node:module") as { registerHooks?: (hooks: object) => unknown };
assert.ok(registerHooks, `module.registerHooks is missing in Node ${process.version}; this harness needs Node >= 22.15 or >= 23.5`);
registerHooks({
  resolve(specifier: string, context: unknown, nextResolve: (s: string, c: unknown) => { url: string }) {
    const resolved = nextResolve(specifier, context);
    for (const [suffix, url] of redirects) if (resolved.url.split("?")[0].endsWith(suffix)) return { url, format: "commonjs", shortCircuit: true };
    return resolved;
  },
});

export type Call = { name: string; args: unknown[] };
type Impl = (...args: any[]) => unknown;
export const w = {
  calls: [] as Call[],
  impl: {} as Record<string, Impl>,
  refreshes: 0,
  unhandled: [] as unknown[],
  pathname: "/media",
  router: { refresh() { w.refreshes++; }, push() {}, replace() {}, back() {}, forward() {}, prefetch() {} },
  invoke(name: string, args: unknown[]): Promise<unknown> {
    w.calls.push({ name, args });
    const impl = w.impl[name];
    const fallback = name === "uploadPhoto" || name === "uploadVideo" ? { ok: true } : undefined;
    try { return Promise.resolve(impl ? impl(...args) : fallback); } catch (error) { return Promise.reject(error); }
  },
  reset() { w.calls = []; w.impl = {}; w.refreshes = 0; w.unhandled = []; },
  named(name: string) { return w.calls.filter(c => c.name === name); },
};
(globalThis as any).__w6media = w;
const recordRejection = (reason: unknown) => { w.unhandled.push(reason); };
/** Runs fn with this file's rejection recorder as the ONLY unhandledRejection listener, so a rejection a component lets
 * escape lands in w.unhandled for an assertion instead of node:test failing the test with the raw error. */
export async function capturingRejections<T>(fn: () => Promise<T>): Promise<T> {
  const others = process.listeners("unhandledRejection");
  process.removeAllListeners("unhandledRejection");
  process.on("unhandledRejection", recordRejection);
  try { return await fn(); } finally {
    process.off("unhandledRejection", recordRejection);
    for (const listener of others) process.on("unhandledRejection", listener);
  }
}

export const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/media" });
const win = dom.window;
Object.assign(globalThis, { window: win, document: win.document, HTMLElement: win.HTMLElement, Event: win.Event,
  MouseEvent: win.MouseEvent, React, IS_REACT_ACT_ENVIRONMENT: true });
win.alert = (globalThis as any).alert = () => {};
win.confirm = (globalThis as any).confirm = () => true;
globalThis.fetch = (async () => new Response(JSON.stringify({ error: "offline test" }), { status: 404 })) as typeof fetch;

// Photo pre-flight measures bitmaps. Default: a sendable 1000x1000; a test sets w.bitmap for a specific size.
export const bitmap = { width: 1000, height: 1000 };
(globalThis as any).createImageBitmap = async () => ({ width: bitmap.width, height: bitmap.height, close() {} });

type MediaManagerType = typeof import("../../app/media/MediaManager").default;
export type Props = Parameters<MediaManagerType>[0];
let MediaManager: MediaManagerType;
let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof createRoot> | undefined;

export async function load() {
  ({ createRoot } = await import("react-dom/client"));
  ({ default: MediaManager } = await import("../../app/media/MediaManager"));
}
export async function teardown() { await act(async () => root?.unmount()); root = undefined; dom.window.close(); }

export const settle = async (ms = 10) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });
export async function mount(props: Props) {
  if (root) await act(async () => root!.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => { root!.render(<MediaManager {...props} />); });
  await settle();
}
/** Same element type, new props, same root: what a server-action revalidate does to a mounted client tree. */
export async function rerender(props: Props) {
  assert.ok(root, "mounted");
  await act(async () => { root!.render(<MediaManager {...props} />); });
  await settle();
}
export async function click(element: Element | null | undefined) {
  assert.ok(element, "element exists");
  await act(async () => { element.dispatchEvent(new win.MouseEvent("click", { bubbles: true })); });
  await settle();
}
export const buttons = (label: RegExp) => [...document.querySelectorAll<HTMLButtonElement>("button")].filter(b => label.test(b.textContent ?? ""));
export const button = (label: RegExp) => buttons(label)[0];
export const text = () => document.body.textContent ?? "";
export async function chooseFiles(input: HTMLInputElement | null | undefined, files: File[]) {
  assert.ok(input, "file input exists");
  Object.defineProperty(input, "files", { configurable: true, value: files });
  await act(async () => { input.dispatchEvent(new win.Event("change", { bubbles: true })); });
  await settle();
}
export async function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value")!.set!;
  await act(async () => { setter.call(input, value); input.dispatchEvent(new win.Event("input", { bubbles: true })); });
  await settle();
}
export function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
/** The tab body holding `marker`: tabs are all mounted and hidden by class, so scope queries to one tab. */
export function tabBody(marker: RegExp): HTMLElement {
  const body = [...document.querySelectorAll<HTMLElement>("#root > div > div")].find(el => marker.test(el.textContent ?? ""));
  assert.ok(body, `tab body matching ${marker}`);
  return body;
}

export const guide = (stars: number) => Object.fromEntries(PRICING_CATEGORIES.map(k => [k, stars]));
const at = "2026-11-01T00:00:00.000Z";
export const photo = (id: string, star_value: number, caption = id) => ({ id, clone_id: "", storage_path: `p/${id}.jpg`, caption,
  teaser_caption: null, star_value, is_free: false, image_name: id, is_nude: false, explicitness: "none", nsfw: false, tags: [],
  auto_desc: null, created_at: at });
export const baseProps = (cloneId: string, over: Partial<Props> = {}): Props => ({ cloneId, creatorName: cloneId, photos: [],
  videos: [], bundles: [], catalogueBundles: [], categoryPricing: guide(700), ...over });
