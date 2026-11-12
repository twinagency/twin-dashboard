// KNOWN RED (W8 ui-clone-4 H2, docs/review/W8/ui-clone-4.md): every Flows save resets the win-back lapse brake to 7 days.
// `Field disabled` (components/clone/fields.tsx:534,548) disables the NAMED input, so the browser leaves its key out of
// FormData. FlowsForm renders "Win-back after (days quiet)" as `<Field name="winback_lapse_days" ... disabled>`
// (app/flows/FlowsForm.tsx:788-795) and saveCampaign writes `Math.max(1, num(fd,"winback_lapse_days",7))`
// (app/flows/actions.ts:200) on every save, so a stored 14 becomes 7. `Toggle disabled` (fields.tsx:1074-1077) keeps
// posting its hidden value; the control here is that sibling contract. The bot reads the column in
// isReturningLapsedSpender (twin-bot src/campaign.ts:512-536), gated today by the fleet unsolicited policy (handler.ts:469).
// Drives the real primitives in jsdom with FlowsForm's props and reads the FormData through saveCampaign's parse.
// Not wired into npm scripts. Offline: jsdom, no fetch.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { after, before } from "node:test";
import React, { act } from "react";
const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom");

const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/flows" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, HTMLFormElement: dom.window.HTMLFormElement,
  Event: dom.window.Event, MouseEvent: dom.window.MouseEvent, FormData: dom.window.FormData, React, IS_REACT_ACT_ENVIRONMENT: true });
require.extensions[".css"] = (module: { exports: unknown }) => { module.exports = {}; };

let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof createRoot> | undefined;
before(async () => { ({ createRoot } = await import("react-dom/client")); });
after(async () => { await act(async () => root?.unmount()); dom.window.close(); });

async function post(node: React.ReactNode) {
  if (root) await act(async () => root!.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => { root!.render(<form id="f">{node}</form>); });
  return new FormData(document.getElementById("f") as HTMLFormElement);
}
// saveCampaign's parse (app/flows/actions.ts:10-15,200).
const savedLapse = (fd: FormData) => {
  const v = fd.get("winback_lapse_days");
  const n = v === null || String(v).trim() === "" ? 7 : Number.isFinite(Number(v)) ? Number(v) : 7;
  return Math.max(1, n);
};

test("control: a disabled Toggle still posts its stored value", async () => {
  const { Toggle } = await import("../../components/clone/fields");
  const fd = await post(<Toggle label="Fixture" name="fixture_flag" checked onChange={() => {}} disabled />);
  assert.equal(fd.get("fixture_flag"), "true");
});

test("control: an enabled Field posts the stored lapse", async () => {
  const { Field } = await import("../../components/clone/fields");
  assert.equal(savedLapse(await post(<Field label="Win-back after (days quiet)" name="winback_lapse_days" type="number" min={1} defaultValue={14} />)), 14);
});

test("W8-H2: the disabled win-back Field keeps the stored lapse on save", async () => {
  const { Field } = await import("../../components/clone/fields");
  const fd = await post(<Field label="Win-back after (days quiet)" name="winback_lapse_days" type="number" min={1} defaultValue={14} disabled />);
  assert.equal(savedLapse(fd), 14, "disabled Field drops its key, saveCampaign stores the 7-day fallback");
});
