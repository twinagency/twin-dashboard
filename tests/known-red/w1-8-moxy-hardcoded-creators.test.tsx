// KNOWN RED (W1 lane 8 P2, RISKS D12; REVIEW.md inv 5 "A clone or creator is a DB row: no per-creator code paths", isolation).
// MoxyControls.tsx:98 renders `<option value="amelia">` / `<option value="cristina">` on EVERY account, and :58 starterSettings(creator)
// writes that creator_key for an account bound to neither, so any account can be switched to Moxy with another creator's setup.
// Fixed looks like: no hard-coded creator in the markup (delete the select, upload is the only setup path, or list setups read from
// DB rows bound to this account). A fix that deletes the select passes. Copy is not pinned beyond the legacy-state control.
// Not wired into npm scripts; init.sh does not run it yet. Offline: jsdom, stub fetch, synthetic ids.
//   node --import tsx --test --test-name-pattern='^control' tests/known-red/w1-8-moxy-hardcoded-creators.test.tsx   (green)
//   node --import tsx --test --test-skip-pattern='^control' tests/known-red/w1-8-moxy-hardcoded-creators.test.tsx   (red, ERR_ASSERTION)
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
