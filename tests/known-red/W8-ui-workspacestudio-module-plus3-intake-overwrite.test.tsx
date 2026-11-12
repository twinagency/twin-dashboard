// KNOWN RED (W8 ui-workspacestudio-module-plus3, finding F1, data-risk/high): saving a creator's config form erases
// that creator's agency overview imagery. components/clone/CloneAppearanceEditor.tsx:40-41 (studio, the variant
// CloneForm.tsx:353 mounts) posts only dashboard_profile_image_path + dashboard_chart_color; app/clones/actions.ts
// intakeFromForm (:27-34) builds intake.appearance from those two keys alone, rowFromForm (:407) puts the rebuilt
// intake on the row and updateClone (:1151) writes it with .update({...row}) without reading the stored intake.
// lib/agency-overview.ts:22,37 renders the Moxy / Top Onlyfans Agency overview at /revenue from
// intake.appearance.agency_overview (portrait photo_id, banner, library), which no dashboard code writes back.
// Condition: an operator (or an agency user, intake is in AGENCY_WRITABLE_CLONE_FIELDS via lib/agency-columns.ts:48)
// saves /clones/<id> for a creator whose stored intake has appearance.agency_overview. Whether such rows exist: DB not
// read (LIVE-CHECK in the findings file).
// The same save also drops top-level intake.onlyfans_connection (found by the codex confirmation pass), so a creator
// made by the OnlyFans connection flow can no longer be re-matched (connection-creators.ts:95 → 409) and loses its
// expectedHandle (:42).
// Fixed: updateClone merges form-owned keys into the stored intake instead of replacing it.
// Run: nice -n 10 node --import tsx --test tests/known-red/W8-ui-workspacestudio-module-plus3-intake-overwrite.test.tsx
// Not wired into npm scripts. Offline: jsdom renders the real editor inside a <form>, a swatch click changes the colour,
// the form's named inputs are serialised into a FormData and passed to the real updateClone. Stubbed (CJS
// Module._load): @/lib/agency-management (guard no-op), @/lib/dashboard-access (operator, no agency access),
// @/lib/supabase (in-memory clones row; records the update payload, no network), @/lib/compiler, @/lib/query-cache,
// next/cache, @/app/settings/actions, *.module.css (class-name proxy).
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { after, before } from "node:test";
import React, { act } from "react";
const requireNative = createRequire(import.meta.url);
const { JSDOM } = requireNative("jsdom");

const dom = new JSDOM('<form id="f"><div id="root"></div></form>', { url: "https://fixture.invalid/clones/c1" });
const win = dom.window;
Object.assign(globalThis, { window: win, document: win.document, HTMLElement: win.HTMLElement, Element: win.Element, Node: win.Node, Event: win.Event, MouseEvent: win.MouseEvent, React, IS_REACT_ACT_ENVIRONMENT: true });

const CLONE = "c1";
const AGENCY_OVERVIEW = { photo_id: "11111111-1111-4111-8111-111111111111", banner: { photo_id: "22222222-2222-4222-8222-222222222222" }, library: [{ photo_id: "33333333-3333-4333-8333-333333333333" }] };
// The stored row before the save. updateClone at HEAD never reads it; a fix may (maybeSingle/single serve it).
// onlyfans_connection: written by lib/onlyfans/connection-creators.ts:92 when the OnlyFans connection flow creates the
// creator, read at :42 (expectedHandle) and :95 (re-match, else 409 "This creator could not be matched").
const CONNECTION = { owner: "fixture-owner", handle: "fixture_handle" };
const stored: Record<string, unknown> = { id: CLONE, name: "Fixture", intake: { fields: {}, answers: "", onlyfans_connection: CONNECTION, appearance: { chart_color: "#4a8ec4", profile_image_path: `${CLONE}/profile/a.jpg`, agency_overview: AGENCY_OVERVIEW } } };
const updates: Record<string, unknown>[] = [];
const fakeDb = {
  from(table: string) {
    const chain: Record<string, unknown> = {};
    let op = "select";
    for (const m of ["select", "neq", "in", "order", "limit"]) chain[m] = () => chain;
    chain.update = (p: Record<string, unknown>) => { op = "update"; if (table === "clones") { updates.push(p); Object.assign(stored, p); } return chain; };
    chain.eq = () => op === "update" ? Promise.resolve({ error: null }) : chain;
    // A fixed updateClone may read the stored row first; serve it (a structuredClone, so the update cannot alias it).
    chain.maybeSingle = chain.single = () => Promise.resolve({ data: table === "clones" ? structuredClone(stored) : null, error: null });
    return chain;
  },
  storage: { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({ error: null }) }) },
};
const Module = requireNative("node:module") as { _load: (request: string, ...rest: unknown[]) => unknown };
const load = Module._load;
Module._load = (request, ...rest) => {
  if (request === "@/lib/agency-management") return { guardDashboardAction: async () => {} };
  if (request === "@/lib/dashboard-access") return { getDashboardAccess: async () => null };
  if (request === "@/lib/supabase") return { supabaseAdmin: fakeDb };
  if (request === "@/lib/compiler") return { compileClone: async () => {} };
  if (request === "@/lib/query-cache") return { invalidateCloneCaches: async () => {} };
  if (request === "next/cache") return { revalidatePath: () => {} };
  if (request === "@/app/settings/actions") return { getCloneDefaults: async () => ({}) };
  if (request.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_t, k) => String(k) }) };
  return load(request, ...rest);
};

let createRoot: typeof import("react-dom/client").createRoot;
let Editor: typeof import("../../components/clone/CloneAppearanceEditor").default;
let updateClone: typeof import("../../app/clones/actions").updateClone;
let root: ReturnType<typeof createRoot>;
let saved: { intake?: { appearance?: Record<string, unknown> } } = {};

before(async () => {
  ({ createRoot } = await import("react-dom/client"));
  Editor = (await import("../../components/clone/CloneAppearanceEditor")).default;
  ({ updateClone } = await import("../../app/clones/actions"));
  root = createRoot(win.document.getElementById("root"));
  const appearance = (stored.intake as { appearance: { chart_color: string; profile_image_path: string } }).appearance;
  await act(async () => root.render(<Editor studio cloneName="Fixture" initialColor={appearance.chart_color} initialImagePath={appearance.profile_image_path} initialImageUrl="https://fixture.invalid/a.jpg" />));
  const swatch = win.document.querySelector('button[aria-label="Use chart colour #1a4d85"]');
  assert.ok(swatch, "editor rendered its colour swatches");
  await act(async () => swatch.dispatchEvent(new win.MouseEvent("click", { bubbles: true })));
  const fd = new FormData();
  for (const el of win.document.getElementById("f").querySelectorAll("input[name]")) if (el.type !== "file") fd.append(el.name, el.value);
  fd.set("name", "Fixture");
  await updateClone(CLONE, fd);
  assert.equal(updates.length, 1, "exactly one clones update");
  saved = updates[0] as typeof saved;
});
after(() => { root?.unmount(); dom.window.close(); });

test("control: the save writes the editor's own appearance (new colour, same image path)", () => {
  assert.equal(saved.intake?.appearance?.chart_color, "#1a4d85");
  assert.equal(saved.intake?.appearance?.profile_image_path, `${CLONE}/profile/a.jpg`);
});

test("the save keeps intake.appearance.agency_overview (portrait, banner, library on /revenue)", () => {
  assert.deepEqual(saved.intake?.appearance?.agency_overview, AGENCY_OVERVIEW);
});

test("the save keeps intake.onlyfans_connection (OnlyFans connection creator owner + handle)", () => {
  assert.deepEqual((saved.intake as Record<string, unknown> | undefined)?.onlyfans_connection, CONNECTION);
});
