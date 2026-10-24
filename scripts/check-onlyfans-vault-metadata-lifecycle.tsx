/** Actual editor lifecycle with delayed reads; no network, cookie or provider session. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
const require = createRequire(import.meta.url);
const React = require("react"), ts = require("typescript"), { JSDOM } = require("jsdom");
const { CONTENT_SCHEMA } = require("../lib/onlyfans/content.ts"), editing = require("../lib/onlyfans/vault-editing.ts");
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "https://dashboard.test/onlyfans/content" });
const globals = ["window", "document", "navigator", "HTMLElement", "HTMLTextAreaElement", "Event", "IS_REACT_ACT_ENVIRONMENT"];
const descriptors = new Map(globals.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
for (const name of globals) Object.defineProperty(globalThis, name, { configurable: true, value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name] });
const { createRoot } = require("react-dom/client");
// Only layout primitives are inert; the real component and contract validators execute unchanged.
const primitives = Object.fromEntries(["Dialog", "DialogContent", "DialogHeader", "DialogTitle", "DialogDescription"].map(name => [name, ({ children }: { children: unknown }) => React.createElement("div", null, children)]));
const dependencies: Record<string, unknown> = { "@/components/clone/fields": { inputCls: "" }, "@/components/ui/dialog": primitives, "@/lib/onlyfans/vault-editing": editing };
const source = readFileSync(process.env.ONLYFANS_TEST_METADATA_COMPONENT || resolve("components/onlyfans-preview/VaultMetadataEditor.tsx"), "utf8");
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const component = { exports: {} as { default?: unknown } };
new Function("require", "module", "exports", javascript)((name: string) => dependencies[name] || require(name), component, component.exports);
const Editor = component.exports.default;
const account = "acc-a", mediaId = "11", url = `/api/onlyfans-content/accounts/${account}/vault/manage/assets/${mediaId}`, fingerprint = "a".repeat(64);
const read = (description: string) => Response.json({ schemaVersion: CONTENT_SCHEMA, ok: true, accountId: account, asset: { mediaId, fingerprint, description, tags: ["coast"] } });
const oldFetch = globalThis.fetch;
let root: ReturnType<typeof createRoot> | null = null, reads: Array<(response: Response) => void> = [], posts: string[] = [], denied = false, changes = 0;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  assert.equal(String(input), url); assert.equal(init?.credentials, "same-origin"); assert.equal(init?.cache, "no-store");
  if (init?.method !== "POST") return await new Promise<Response>(release => reads.push(release));
  const body = String(init.body); posts.push(body);
  assert(editing.validVaultEdit(`assets/${mediaId}`, JSON.parse(body)), "Actual submit must satisfy the vault contract");
  if (denied) return new Response(null, { status: 401 });
  return Response.json({ schemaVersion: CONTENT_SCHEMA, ok: true, applied: true, accountId: account, commandKey: "b".repeat(64), targetId: mediaId, fingerprint });
}) as typeof fetch;
const field = () => document.querySelector<HTMLTextAreaElement>("[data-of-vault-asset-description]");
const save = () => document.querySelector<HTMLButtonElement>("[data-of-vault-asset-save]");
async function mount() {
  reads = []; posts = []; denied = false; changes = 0;
  root = createRoot(document.getElementById("root")!);
  await React.act(async () => root!.render(React.createElement(React.StrictMode, null, React.createElement(Editor, { accountId: account, mediaId, onClose: () => {}, onChanged: () => { changes++; } }))));
  assert.equal(reads.length, 2, "Exercise both StrictMode mount reads");
}
async function settle(index: number, response: Response) { await React.act(async () => reads[index](response)); }
async function fill(description: string) {
  const target = field(); assert(target);
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value")!.set!.call(target, description);
    target.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  assert.equal(field()!.value, description); assert.equal(save()!.matches(":disabled"), false, "A valid draft enables saving");
}
async function submit() {
  const form = document.querySelector("[data-of-vault-asset-editor]"); assert(form);
  await React.act(async () => form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
}
async function unmount() {
  if (root) await React.act(async () => {
    // Resolve every controlled read before disposal, including assertion-failure paths.
    for (const release of reads) release(new Response(null, { status: 401 }));
    root!.unmount();
  });
  root = null;
}
async function main() {
  try {
    await mount();
    await settle(0, read("Superseded description"));
    assert.equal(field() === null, true, "A stale read cannot expose an editor before the current read completes");
    await settle(1, read("Current description"));
    assert.equal(field()!.value, "Current description");
    await fill("Approved description actually submitted"); await submit();
    assert.equal(posts.length, 1); assert.equal(JSON.parse(posts[0]).patch.description, "Approved description actually submitted");
    assert.equal(changes, 1); assert.equal(reads.length, 3, "Confirmed saves read canonical metadata");
    await settle(2, read("Approved description actually submitted"));
    assert.equal(field()!.value, "Approved description actually submitted"); assert.equal(save()!.matches(":disabled"), true, "Unchanged saved forms remain disabled");
    await unmount();
    // Reverse completion order reproduces the CI race: a late read used to erase the current draft.
    await mount(); await settle(1, read("Current description")); await fill("Must not persist after session loss");
    await settle(0, read("Superseded description"));
    assert.equal(field()!.value, "Must not persist after session loss", "Late superseded reads preserve the current draft");
    assert.equal(save()!.matches(":disabled"), false);
    denied = true; await submit();
    assert.equal(posts.length, 1, "Session-loss coverage attempts the actual scoped save");
    assert.equal(JSON.parse(posts[0]).patch.description, "Must not persist after session loss");
    assert.equal(field() === null, true, "Session denial clears the editor and unsaved draft");
    assert.match(document.body.textContent!, /Your session cannot edit this asset/);
    assert.equal(document.querySelector("[data-of-vault-edit-retry]") === null, true); assert.equal(changes, 0);
    console.log("PASS vault metadata lifecycle: stale mount reads fenced in both orders, drafts retained, real scoped save/readback and session-denial clearing");
  } finally {
    globalThis.fetch = oldFetch; await unmount(); dom.window.close();
    for (const name of globals) { const descriptor = descriptors.get(name); if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete (globalThis as unknown as Record<string, unknown>)[name]; }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
