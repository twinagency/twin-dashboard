// KNOWN RED (W8 ui-clone-4 H1, docs/review/W8/ui-clone-4.md): an unrelated save silently moves her clock to UTC.
// The shared `Select` primitive (components/clone/fields.tsx:652-679) is a controlled <select value> that renders only
// `options`. Timezone uses it with TIMEZONE_OPTIONS (fields.tsx:1179, 18 zones, "Not exhaustive by design") and the
// stored value unchecked (`clone?.timezone ?? "UTC"`, components/clone/useCloneConfig.ts:371; caller
// components/clone/ConfigSections.tsx:651-657). A stored IANA zone outside the list matches no <option>, so the browser
// selects the first ("UTC") and the form posts timezone=UTC; rowFromForm writes `str(fd,"timezone") ?? "UTC"`
// (app/clones/actions.ts:617) on every Configure save. The bot reads clones.timezone as her clock and sleep window
// (twin-bot src/data/supabase-store.ts:2989, src/flows/human.ts:628).
// Drives the real primitive + real useCloneConfig seeding in jsdom, wired as ConfigSections does, and reads the FormData.
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

async function savedTimezone(timezone: string | undefined) {
  const { Select, TIMEZONE_OPTIONS } = await import("../../components/clone/fields");
  const { useCloneConfig } = await import("../../components/clone/useCloneConfig");
  const clone = { id: "fixture-clone", name: "Fixture", timezone };
  function Harness() {
    const [cfg, set] = useCloneConfig(clone);
    return <form id="clone-form"><Select label="Timezone" name="timezone" value={cfg.timezone} onChange={(v) => set("timezone", v)} options={TIMEZONE_OPTIONS} /></form>;
  }
  if (root) await act(async () => root!.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => { root!.render(<Harness />); });
  const fd = new FormData(document.getElementById("clone-form") as HTMLFormElement);
  // What rowFromForm stores: str(fd, "timezone") ?? "UTC".
  const v = fd.get("timezone");
  return v === null || String(v).trim() === "" ? "UTC" : String(v).trim();
}

test("control: a listed zone round-trips unchanged and a missing zone seeds UTC", async () => {
  assert.equal(await savedTimezone("Europe/London"), "Europe/London");
  assert.equal(await savedTimezone(undefined), "UTC"); // column is NOT NULL DEFAULT 'UTC' (twin-bot migration 026)
});

test("W8-H1: a stored IANA zone outside TIMEZONE_OPTIONS survives an unrelated save", async () => {
  assert.equal(await savedTimezone("Europe/Berlin"), "Europe/Berlin", "off-list zone is posted as UTC");
  assert.equal(await savedTimezone("America/Toronto"), "America/Toronto", "off-list zone is posted as UTC");
});
