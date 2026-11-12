// KNOWN RED (W8 ui-clone-3 H3, docs/review/W8/ui-clone-3.md): an unrelated save silently rewrites identity facts.
// PersonaFactsFields renders Gender/Height/Sexuality as uncontrolled <select defaultValue> over fixed option lists
// (components/clone/PersonaFactsFields.tsx:629,639,650). A stored value that is not one of the options matches no
// <option>, so the browser selects the first one ("(not set)") and the form posts "" (str() → null) or, for Gender
// (no "(not set)" option, default "female"), "female". rowFromForm writes height/sexuality/gender whenever the
// persona_facts marker is on the form (app/clones/actions.ts:417-422), i.e. on every Identity save. A NULL gender becomes
// "female" and the bot starts saying "You are a woman." (twin-bot src/prompt.ts:232).
// Drives the real component (part="who", which also renders the marker) in jsdom and reads the FormData a save posts.
// Not wired into npm scripts. Offline: jsdom, no fetch.
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

type Facts = { gender: string | null; height: string | null; sexuality: string | null };
async function posted(facts: Facts) {
  const { default: PersonaFactsFields } = await import("../../components/clone/PersonaFactsFields");
  const { useCloneConfig } = await import("../../components/clone/useCloneConfig");
  const clone = { id: "fixture-clone", name: "Fixture", ...facts };
  function Harness() {
    const [cfg, set] = useCloneConfig(clone);
    return <form id="clone-form"><PersonaFactsFields studio clone={clone} part="who" cfg={cfg} set={set} /></form>;
  }
  if (root) await act(async () => root!.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => { root!.render(<Harness />); });
  const fd = new FormData(document.getElementById("clone-form") as HTMLFormElement);
  assert.equal(fd.get("persona_facts"), "1", "marker present, so rowFromForm writes these columns");
  // What rowFromForm's str() would store.
  const stored = (k: string) => { const v = fd.get(k); return v === null || String(v).trim() === "" ? null : String(v).trim(); };
  return { gender: stored("gender"), height: stored("height"), sexuality: stored("sexuality") };
}

test("control: values from the option lists round-trip unchanged", async () => {
  const facts = { gender: "male", height: "5'7 (170cm)", sexuality: "bisexual" };
  assert.deepEqual(await posted(facts), facts);
});

test("W8-H3: a stored height/sexuality outside the option list survives an unrelated save", async () => {
  const facts = { gender: "female", height: "170 cm", sexuality: "Straight" };
  assert.deepEqual(await posted(facts), facts, "off-list values are posted as (not set) and stored as null");
});

test("W8-H3: a NULL gender is not saved as \"female\"", async () => {
  assert.equal((await posted({ gender: null, height: null, sexuality: null })).gender, null, "an untouched NULL gender is saved as a fact nobody chose");
});
