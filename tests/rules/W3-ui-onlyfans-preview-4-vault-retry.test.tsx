// CHARACTERIZATION (W3 ui-onlyfans-preview-4, REVIEW inv 7 "No send, no auto-retry": a write is never retried automatically and a user
// retry reuses its idempotency key). Holds today for the four vault writers of this lane; each case is mutation-proven
// (tests/rules/mutations/W3-ui-onlyfans-preview-4/m1..m4). When a write's reply is lost or is a 502:
//   - VaultManager create (VaultManager.tsx:127-158, 302): exactly one POST, no resend while time passes, "Retry same request" resends the
//     identical body incl. requestId;
//   - VaultMetadataEditor save (VaultMetadataEditor.tsx:48-69, 87) and VaultOrganization folder create (VaultOrganization.tsx:41-58, 103):
//     same rule through "Retry same edit";
//   - VaultUploader create (VaultUploader.tsx:69): the next Upload click re-posts the kept createRequest (same requestId and file ids).
// Not wired into npm scripts; init.sh does not run it yet (shared file; wiring decided at window close).
// Offline: jsdom, global fetch stubbed (https://fixture.invalid); timers faked by tests/helpers/w3-preview4-clock.tsx.
import { bodyOf, click, close, http502, json, lostReply, mount, posts, q, serve, settle, submit, type, unmount, type Answer, type Call } from "../helpers/w3-preview4-dom";
import { ACCOUNT, MEDIA, contentBase, assetBody, uploadsBody, vaultReads } from "../helpers/w3-preview4-vault";
import { advance, install, uninstall } from "../helpers/w3-preview4-clock";
import assert from "node:assert/strict";
import test, { after } from "node:test";
import React, { act } from "react";

after(close);
Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
const UNKNOWN: Array<[string, Answer]> = [["lost reply", lostReply], ["502", http502]];
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

/** Shared shape: one write, a minute of (fake) time with no resend, then one explicit retry that must repeat the body exactly. */
async function retryRule(path: string, sendOnce: () => Promise<void>, retry: () => Promise<void>) {
  await sendOnce();
  const writes = () => posts().filter(call => call.url === path);
  assert.equal(writes().length, 1, "exactly one write before any click");
  assert.match(String(bodyOf(writes()[0]).requestId), UUID, "the write carries a requestId");
  await advance(60_000);
  assert.equal(writes().length, 1, "no automatic resend while time passes");
  await retry();
  assert.equal(writes().length, 2, "the explicit retry sent one write");
  assert.deepEqual(bodyOf(writes()[1]), bodyOf(writes()[0]), "the user retry resends the identical body, incl. requestId");
}
async function withClock(run: () => Promise<void>) {
  await unmount();
  install();
  try { await run(); } finally { await unmount(); uninstall(); }
}

for (const [name, answer] of UNKNOWN) {
  test(`VaultManager: a create whose outcome is unknown (${name}) is retried only on request, with the identical body`, () => withClock(async () => {
    const path = `${contentBase}/items`;
    serve((call: Call) => vaultReads(call) ?? (call.url === path ? answer() : json({ ok: false }, 404)));
    const { default: VaultManager } = await import("../../components/onlyfans-preview/VaultManager");
    await retryRule(path, async () => {
      await mount(<VaultManager accountId={ACCOUNT} />, "/onlyfans/content");
      await settle(60);
      await click(q(`[data-of-vault-select="${MEDIA}"]`));
      await type(q("[data-of-vault-product-label]"), "Beach set");
      await type(q("[data-of-vault-product-price]"), "12.00");
      await type(q("[data-of-vault-product-description]"), "One beach photo.");
      await submit(q("[data-of-vault-create]")?.closest("form"));
      await settle(60);
      assert.ok(q("[data-of-vault-retry]"), "Retry same request is offered");
    }, async () => { await click(q("[data-of-vault-retry]")); await settle(60); });
  }));

  test(`VaultMetadataEditor: a save whose outcome is unknown (${name}) is retried only on request, with the identical body`, () => withClock(async () => {
    const path = `${contentBase}/vault/manage/assets/${MEDIA}`;
    serve((call: Call) => call.url === path && call.method === "GET" ? json(assetBody("old")) : call.url === path ? answer() : json({ ok: false }, 404));
    const { default: VaultMetadataEditor } = await import("../../components/onlyfans-preview/VaultMetadataEditor");
    await retryRule(path, async () => {
      await mount(<VaultMetadataEditor accountId={ACCOUNT} mediaId={MEDIA} onClose={() => {}} onChanged={() => {}} />, "/onlyfans/content");
      await settle(60);
      await type(q("[data-of-vault-asset-description]"), "new");
      await submit(q(`[data-of-vault-asset-editor="${MEDIA}"]`));
      await settle(60);
      assert.ok(q("[data-of-vault-edit-retry]"), "Retry same edit is offered");
    }, async () => { await click(q("[data-of-vault-edit-retry]")); await settle(60); });
  }));

  test(`VaultOrganization: a folder create whose outcome is unknown (${name}) is retried only on request, with the identical body`, () => withClock(async () => {
    const path = `${contentBase}/vault/manage/folders`;
    serve((call: Call) => vaultReads(call) ?? (call.url === path ? answer() : json({ ok: false }, 404)));
    const { default: VaultOrganization } = await import("../../components/onlyfans-preview/VaultOrganization");
    await retryRule(path, async () => {
      await mount(<VaultOrganization accountId={ACCOUNT} selectedIds={[]} folderId="" onFolderChange={() => {}} onChanged={() => {}} onBusy={() => {}} />, "/onlyfans/content");
      await settle(60);
      await type(q("[data-of-vault-folder-name]"), "Summer");
      await click(q("[data-of-vault-folder-create]"));
      await settle(60);
      assert.ok(q("[data-of-vault-edit-retry]"), "Retry same edit is offered");
    }, async () => { await click(q("[data-of-vault-edit-retry]")); await settle(60); });
  }));

  test(`VaultUploader: a create whose outcome is unknown (${name}) is re-posted on the next Upload click with the same request`, () => withClock(async () => {
    const path = `${contentBase}/vault/uploads`;
    serve((call: Call) => call.url === path && call.method === "GET" ? json(uploadsBody()) : call.url === path ? answer() : json({ ok: false }, 404));
    const { default: VaultUploader } = await import("../../components/onlyfans-preview/VaultUploader");
    const upload = () => [...document.querySelectorAll<HTMLButtonElement>("[data-of-vault-uploader] button")].find(b => /Upload to OnlyFans/.test(b.textContent ?? ""));
    await retryRule(path, async () => {
      await mount(<VaultUploader accountId={ACCOUNT} connectionRevision={3} onChanged={() => {}} />, "/onlyfans/content");
      const input = q<HTMLInputElement>("[data-of-vault-uploader] input[type=file]");
      assert.ok(input, "the upload form is shown");
      await act(async () => {
        Object.defineProperty(input, "files", { configurable: true, value: [new File([new Uint8Array([1, 2, 3])], "beach.jpg", { type: "image/jpeg" })] });
        input.dispatchEvent(new window.Event("change", { bubbles: true }));
      });
      await click(upload());
      await settle(60);
      assert.equal(upload()?.disabled, false, "Upload stays available to resume the same request");
    }, async () => { await click(upload()); await settle(60); });
  }));
}
