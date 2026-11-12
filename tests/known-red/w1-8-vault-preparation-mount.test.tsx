// KNOWN RED (W1 lane 8 P9; REVIEW.md inv 7 "Capability (D6)", "Money"; lane 7b F1/D11).
// VaultManager.tsx:201 mounts <Preparation> (the FansAPI provider-credit spend form) outside the `data && !denied` branch (:202) and
// for read-only team users. Two separate defects, one test each:
//   A (denied vault, 401): "Sign in again" notice while the spend config still renders below it. This half is a spend form reachable
//     by a session the vault itself refuses; lane 7b F1/D11: its default mode is production.
//   B (read-only team user, vault LOADED): the form renders for readOnly. This half is placement/UI, not a spend path: Preparation's
//     send() returns early for readOnly (Preparation.tsx:50) and every input/submit is disabled (`held`, :64). B answers the vault
//     read with a valid 200 (checked against parseVault, the parser VaultManager uses) so the `data && !denied` branch is open:
//     moving Preparation inside that branch alone keeps B red; only a readOnly gate (or moving it off the vault) turns B green.
// Fixed looks like: no Preparation form ([data-commercial-preparation] form) under the vault for read-only users or a denied vault;
// Preparation lives on the manager's account/connection settings surface. Asserts the data attribute only.
// Mounts the real VaultManager inside real Next router contexts. Other vault-panel reads (folders, etc.) answer 503.
// Not wired into npm scripts; init.sh does not run it yet. Offline: jsdom, stub fetch, synthetic ids.
//   node --import tsx --test --test-name-pattern='^control' tests/known-red/w1-8-vault-preparation-mount.test.tsx   (green)
//   node --import tsx --test --test-skip-pattern='^control' tests/known-red/w1-8-vault-preparation-mount.test.tsx   (red, ERR_ASSERTION)
import { inNextApp, json, mount, settle, stubFetch, unmount } from "../helpers/w1-8-dom";
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { CONTENT_SCHEMA } from "../../lib/onlyfans/content";
import { parsePreparationState } from "../../lib/onlyfans/preparation";
import { parseVault } from "../../lib/onlyfans/vault";

const preparation = { configured: false, canPrepare: true };
assert.ok(parsePreparationState(preparation), "fixture: preparation must pass parsePreparationState");
const vault = { schemaVersion: CONTENT_SCHEMA, ok: true, accountId: "of-a", vault: { items: [], nextCursor: null, sync: null, connectionRevision: 4 } };
assert.ok(parseVault(vault, "of-a"), "fixture: vault must pass parseVault (the parser VaultManager uses)");

async function open(vaultStatus: 200 | 401, readOnly: boolean) {
  const stub = stubFetch(url => {
    if (/^\/api\/onlyfans-content\/accounts\/of-a\/vault(\?|$)/.test(url)) return vaultStatus === 200 ? json(vault) : json({ error: "Fixture vault answer." }, vaultStatus);
    if (url === "/api/onlyfans-configuration/accounts/of-a/preparation") return json({ ok: true, preparation });
    if (url.startsWith("/api/onlyfans-content/accounts/of-a/")) return json({ error: "Fixture: not part of this test." }, 503);
    throw new TypeError(`unexpected fetch ${url}`);
  });
  const { default: VaultManager } = await import("../../components/onlyfans-preview/VaultManager");
  await mount(inNextApp(React.createElement(VaultManager, { accountId: "of-a", readOnly }), "/onlyfans/content"));
  await settle(); await settle();
  return stub;
}
const state = () => ({ vault: Boolean(document.querySelector("[data-of-vault-manager]")),
  loaded: Boolean(document.querySelector(".of-vault-toolbar")),
  notice: document.querySelector("[data-of-vault-notice]")?.textContent ?? "",
  spendForm: Boolean(document.querySelector("[data-commercial-preparation] form")) });

test("control: a denied vault read (401) mounts VaultManager and shows the sign-in notice", async () => {
  const stub = await open(401, false);
  assert.equal(stub.count(/\/vault$/), 1, "the vault read happened");
  assert.deepEqual(stub.calls.map(c => c.url).filter(u => !/\/vault$|\/preparation$/.test(u)), [], "no unexpected fetch");
  const s = state();
  assert.equal(s.vault, true);
  assert.match(s.notice, /sign in/i);
  await unmount();
});

test("P9 A: a denied vault read shows no Preparation spend form", async () => {
  await open(401, false);
  assert.equal(state().spendForm, false, "Preparation spend form rendered under a denied vault");
  await unmount();
});

test("P9 B: a read-only team user with a loaded vault sees no Preparation spend form under the vault", async () => {
  const stub = await open(200, true);
  assert.equal(stub.count(/\/vault$/), 1, "the vault read happened");
  assert.equal(state().loaded, true, "fixture: the vault loaded (data && !denied branch open)");
  assert.equal(state().spendForm, false, "Preparation spend form rendered for a read-only user");
  await unmount();
});
