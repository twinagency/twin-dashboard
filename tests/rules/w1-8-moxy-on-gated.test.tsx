// RULE (characterization, green now; W1 lane 8; REVIEW.md inv 7 "No false success" / go gated on evidence; lane 3 F14 context).
// MoxyControls: Moxy "On" is offered only when the read says the prerequisites are met (readiness.ready, no unsaved draft). With a
// not-ready view the On option is disabled AND, if On is chosen anyway (script/devtools), Save stays disabled.
// Asserts option/button disabled state, not copy. The "Save gated" test also counts POSTs after clicking Save; that check is
// belt-and-braces only and cannot go red on its own: a disabled button dispatches no click, and save() has its own
// `nextMode === "on" && !onReady` early return (MoxyControls.tsx:74). The disabled assertion is what guards the gate.
// Mutation-proven (RISKS D15), tests/rules/mutations/W1-preview-shell-launch/:
//   mut-3 (drop the option's `disabled={!onReady}`): only "On option disabled" goes red.
//   mut-4 (drop the Save button's On gate): only "Save gated" goes red, on the disabled assertion.
// Not wired into npm scripts; init.sh's rules-tests glob (tests/rules/*.test.*) picks it up. Offline: jsdom, stub fetch, synthetic ids.
//   node --import tsx --test tests/rules/w1-8-moxy-on-gated.test.tsx   (green)
import { button, choose, click, json, moxySelected, mount, settle, stubFetch, unmount } from "../helpers/w1-8-dom";
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

async function open(ready: boolean) {
  const stub = stubFetch((url, method) => {
    if (url !== "/api/onlyfans-configuration/accounts/of-a/moxy") throw new TypeError(`unexpected fetch ${url}`);
    if (method !== "GET") throw new TypeError("no write expected");
    return json(moxySelected("preview", { ready }));
  });
  const { default: MoxyControls } = await import("../../components/onlyfans-launch/automation/MoxyControls");
  await mount(React.createElement(MoxyControls, { accountId: "of-a", manage: true, onOwnership: () => {} }));
  await settle();
  const mode = document.querySelector<HTMLSelectElement>("[data-moxy-controls] select[aria-label='Mode']");
  assert.ok(mode && !mode.disabled, "Mode select is editable for a manager");
  return { stub, mode, on: mode.querySelector<HTMLOptionElement>("option[value='on']") };
}

test("control: a ready Moxy view offers On, and Save is enabled with On chosen", async () => {
  const { mode, on } = await open(true);
  assert.equal(on?.disabled, false);
  await choose(mode, "on");
  assert.equal(button(/^save/i)?.disabled, false);
  await unmount();
});

test("On option disabled: a not-ready Moxy view does not offer On", async () => {
  const { on } = await open(false);
  assert.ok(on, "On option exists");
  assert.equal(on.disabled, true, "On offered while prerequisites are not met");
  await unmount();
});

test("Save gated: with a not-ready view and On chosen anyway, Save is disabled", async () => {
  const { stub, mode } = await open(false);
  await choose(mode, "on");
  assert.equal(mode.value, "on", "On is chosen");
  const save = button(/^save/i);
  assert.equal(save?.disabled, true, "Save enabled for On while not ready");
  await click(save);
  assert.equal(stub.calls.filter(c => c.method !== "GET").length, 0, "belt-and-braces: no write (save() also returns early, MoxyControls.tsx:74)");
  await unmount();
});
