// RULE G44b P2 (REVIEW.md inv 5 "A clone or creator is a DB row: no per-creator code paths", isolation; RISKS D12).
// MoxyControls never names a creator in its markup and never builds a creator setup from a hard-coded key: a legacy account
// is moved to Moxy only from an uploaded setup file (or, later, setups read from DB rows bound to this account).
// Planting back an <option value="amelia"> / "cristina"> (or any hard-coded creator) turns P2 red. Copy is not pinned beyond
// the legacy-state control. Offline: jsdom, stub fetch, synthetic ids.
//   node --import tsx --test tests/rules/G44b-moxy-hardcoded-creators.test.tsx
import { json, moxyLegacy, mount, settle, stubFetch, unmount } from "../helpers/w1-8-dom";
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

async function open() {
  const stub = stubFetch(url => {
    if (url === "/api/onlyfans-configuration/accounts/of-a/moxy") return json(moxyLegacy("of-a", true));
    throw new TypeError(`unexpected fetch ${url}`);
  });
  const { default: MoxyControls } = await import("../../components/onlyfans-launch/automation/MoxyControls");
  await mount(React.createElement(MoxyControls, { accountId: "of-a", manage: true, onOwnership: () => {} }));
  await settle();
  return stub;
}

test("control: MoxyControls for a legacy account (manager) renders the Moxy section in the not-selected state", async () => {
  const stub = await open();
  assert.equal(stub.count(/\/moxy$/), 1);
  const section = document.querySelector("[data-moxy-controls]");
  assert.ok(section, "Moxy controls section renders");
  assert.match(section.textContent ?? "", /not been selected/i);
  assert.equal(document.querySelector("[role=alert]"), null, "no error shown");
  await unmount();
});

test("P2: an account bound to no creator is not offered hard-coded creators (amelia, cristina)", async () => {
  await open();
  const markup = (document.querySelector("[data-moxy-controls]")?.outerHTML ?? "").toLowerCase();
  assert.ok(markup.length > 0, "Moxy controls section renders");
  const named = ["amelia", "cristina"].filter(name => markup.includes(name));
  assert.deepEqual(named, [], `hard-coded creator setups offered to of-a: ${named.join(", ")}`);
  await unmount();
});
