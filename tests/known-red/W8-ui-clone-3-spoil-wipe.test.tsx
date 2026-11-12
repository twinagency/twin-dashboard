// KNOWN RED (W8 ui-clone-3 H1, docs/review/W8/ui-clone-3.md): switching Tips off and saving wipes the clone's custom
// spoil-menu buttons. SpoilMenuEditor (components/clone/editors.tsx:65-71) is the only renderer of the hidden
// `spoil_options` input and its parent mounts it only while tips are on (ConfigSections.tsx:2372). rowFromForm writes
// `spoil_options: parseSpoilOptions(fd)` unconditionally (app/clones/actions.ts:400), and parseSpoilOptions returns []
// when the field is absent (:228-229), so updateClone stores []. Re-enabling tips then shows the defaults (or [] on V2,
// useCloneConfig.ts:327): the operator's buttons are gone. Unlike its neighbours tip_credits_per_100_stars and the
// re-ask brakes (rendered unconditionally on purpose, ConfigSections.tsx:2330-2347), the spoil menu has no carry-through.
// The test drives the real MonetizationSections + useCloneConfig in jsdom and reads the FormData a save would post.
// If the fix is server-side instead (rowFromForm skips the column when `!fd.has("spoil_options")`), rewrite the red
// assertion against that (TEST-CHANGE). Not wired into npm scripts. Offline: jsdom, no fetch.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { after, before } from "node:test";
import React, { act } from "react";
const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom");

const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/clones/fixture-clone" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, HTMLFormElement: dom.window.HTMLFormElement,
  Event: dom.window.Event, MouseEvent: dom.window.MouseEvent, FormData: dom.window.FormData, React, IS_REACT_ACT_ENVIRONMENT: true });
require.extensions[".css"] = (module: { exports: unknown }) => { module.exports = {}; };

let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof createRoot> | undefined;
before(async () => { ({ createRoot } = await import("react-dom/client")); });
after(async () => { await act(async () => root?.unmount()); dom.window.close(); });

const CUSTOM = [{ stars: 777, label: "Coffee for me" }, { stars: 4321, label: "Spoil me" }];
const CLONE = { id: "fixture-clone", name: "Fixture", tips_enabled: true, spoil_options: CUSTOM };

async function mount() {
  const { MonetizationSections } = await import("../../components/clone/ConfigSections");
  const { useCloneConfig } = await import("../../components/clone/useCloneConfig");
  function Harness() {
    const [cfg, set] = useCloneConfig(CLONE);
    return <form id="clone-form"><MonetizationSections cfg={cfg} set={set} clone={CLONE} editMode /></form>;
  }
  if (root) await act(async () => root!.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => { root!.render(<Harness />); });
}
const posted = () => new FormData(document.getElementById("clone-form") as HTMLFormElement);
async function switchTipsOff() {
  const button = document.querySelector('input[name="tips_enabled"]')?.nextElementSibling as HTMLButtonElement | null;
  assert.ok(button, "tips toggle button exists");
  await act(async () => { button.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
  assert.equal(posted().get("tips_enabled"), "false", "tips switched off");
}

test("control: with tips on, a save posts the clone's custom spoil buttons unchanged", async () => {
  await mount();
  assert.equal(posted().get("tips_enabled"), "true");
  assert.deepEqual(JSON.parse(String(posted().get("spoil_options"))), CUSTOM);
});

test("W8-H1: switching tips off and saving keeps the custom spoil buttons (rowFromForm writes [] when the field is absent)", async () => {
  await mount();
  await switchTipsOff();
  const raw = posted().get("spoil_options");
  assert.ok(raw !== null, "a tips-off save posts no spoil_options, so rowFromForm stores [] and the custom buttons are lost");
  assert.deepEqual(JSON.parse(String(raw)), CUSTOM);
});
