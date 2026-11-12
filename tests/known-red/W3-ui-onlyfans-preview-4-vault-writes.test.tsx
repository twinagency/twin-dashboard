// KNOWN RED (W3 ui-onlyfans-preview-4, findings F2 F3 in docs/review/W3/ui-onlyfans-preview-4.md). Team's Claude owns the fixes.
// F1 (503 outcome unconfirmed) is a lib-half defect handed off to lib-onlyfans-4-plus2: no vault route sends that body at HEAD, so its
//    client reds were removed (R2 D-F1). The 409 controls below stay: a proven refusal drops the kept request (the side an F1 fix keeps).
//    The lost-reply side is pinned by tests/rules/W3-ui-onlyfans-preview-4-vault-retry.test.tsx.
// F2 VaultManager.tsx:243: CategoryDrafts is keyed by the selection, so toggling one asset remounts it and drops its kept
//    "Retry same request" after an unconfirmed "Create disabled single drafts" (CategoryDrafts.tsx is W1-covered and used as-is).
// F3 VaultMetadataEditor.tsx:66 (load() after every non-ack): a refused save replaces the operator's draft with the server values.
// Not wired into npm scripts; init.sh does not run it yet (shared file; wiring decided at window close).
// Offline: jsdom, global fetch stubbed (https://fixture.invalid); fixtures are accepted by the real parsers (control test below).
import { click, close, json, mount, posts, q, serve, settle, submit, type, bodyOf } from "../helpers/w3-preview4-dom";
import { ACCOUNT, FOLDER, MEDIA, contentBase, vaultReads, vaultBody, foldersBody, folderBody, assetBody, categoryPriceBody, categoryReviewBody, editAck, vaultFailure } from "../helpers/w3-preview4-vault";
import assert from "node:assert/strict";
import test, { after } from "node:test";
import React from "react";
import { parseVault } from "../../lib/onlyfans/vault";
import { parseVaultResource, parseVaultEditAck } from "../../lib/onlyfans/vault-editing";
import { parseCategoryPrice, parseCategoryReview } from "../../lib/onlyfans/commercial-categories";

after(close);
Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
type Write = (call: import("../helpers/w3-preview4-dom").Call) => Response | Promise<Response>;

test("control: every fixture body is accepted by the real parser", () => {
  assert.ok(parseVault(vaultBody(), ACCOUNT), "vault page");
  assert.ok(parseVaultResource(foldersBody(), ACCOUNT, "folders"), "folders");
  assert.ok(parseVaultResource(folderBody(), ACCOUNT, `folders/${FOLDER}`), "folder");
  assert.ok(parseVaultResource(assetBody("old"), ACCOUNT, `assets/${MEDIA}`), "asset");
  assert.ok(parseVaultEditAck(editAck(MEDIA), ACCOUNT, `assets/${MEDIA}`), "asset edit ack");
  assert.ok(parseCategoryPrice(categoryPriceBody(), ACCOUNT, FOLDER), "category price");
  assert.ok(parseCategoryReview(categoryReviewBody(), ACCOUNT, [MEDIA]), "category review");
});

// ---- VaultManager create (refusal control) ----
async function createItem(answer: Write) {
  serve(call => vaultReads(call) ?? answer(call));
  const { default: VaultManager } = await import("../../components/onlyfans-preview/VaultManager");
  await mount(<VaultManager accountId={ACCOUNT} />, "/onlyfans/content");
  await settle(60);
  await click(q(`[data-of-vault-select="${MEDIA}"]`));
  await type(q("[data-of-vault-product-label]"), "Beach set");
  await type(q("[data-of-vault-product-price]"), "12.00");
  await type(q("[data-of-vault-product-description]"), "One beach photo.");
  const create = q<HTMLButtonElement>("[data-of-vault-create]");
  assert.equal(create?.disabled, false, "the offer form is valid");
  await submit(create?.closest("form"));
  await settle(60);
  assert.equal(posts().filter(call => call.url === `${contentBase}/items`).length, 1, "one create sent");
}
const managerNotice = () => q("[data-of-vault-notice]")?.textContent ?? "";

test("control: VaultManager create answered 409 refused drops the retry and says refused", async () => {
  await createItem(() => vaultFailure(409, "refused"));
  assert.equal(q("[data-of-vault-retry]"), null);
  assert.match(managerNotice(), /refused/);
});

// ---- VaultOrganization create folder (refusal control) ----
async function createFolder(answer: Write) {
  serve(call => vaultReads(call) ?? answer(call));
  const { default: VaultOrganization } = await import("../../components/onlyfans-preview/VaultOrganization");
  await mount(<VaultOrganization accountId={ACCOUNT} selectedIds={[]} folderId="" onFolderChange={() => {}} onChanged={() => {}} onBusy={() => {}} />, "/onlyfans/content");
  await settle(60);
  await type(q("[data-of-vault-folder-name]"), "Summer");
  await click(q("[data-of-vault-folder-create]"));
  await settle(60);
  const sent = posts().filter(call => call.url === `${contentBase}/vault/manage/folders`);
  assert.equal(sent.length, 1, "one folder create sent");
  assert.equal(bodyOf(sent[0]).name, "Summer");
}
const editNotice = () => q("[data-of-vault-edit-notice]")?.textContent ?? "";

test("control: VaultOrganization folder create answered 409 refused drops the retry", async () => {
  await createFolder(() => vaultFailure(409, "refused"));
  assert.equal(q("[data-of-vault-edit-retry]"), null);
  assert.match(editNotice(), /changed|refused/);
});

// ---- VaultMetadataEditor save (F3) ----
async function saveMetadata(answer: Write, typed = "new") {
  serve(call => call.method === "GET" && call.url === `${contentBase}/vault/manage/assets/${MEDIA}` ? json(assetBody("old")) : answer(call));
  const { default: VaultMetadataEditor } = await import("../../components/onlyfans-preview/VaultMetadataEditor");
  await mount(<VaultMetadataEditor accountId={ACCOUNT} mediaId={MEDIA} onClose={() => {}} onChanged={() => {}} />, "/onlyfans/content");
  await settle(60);
  const field = q<HTMLTextAreaElement>("[data-of-vault-asset-description]");
  assert.equal(field?.value, "old", "the editor shows the saved description");
  await type(field, typed);
  await submit(q(`[data-of-vault-asset-editor="${MEDIA}"]`));
  await settle(60);
  const sent = posts();
  assert.equal(sent.length, 1, "one save sent");
  assert.deepEqual((bodyOf(sent[0]).patch as Record<string, unknown>).description, typed, "the save carried the operator's text");
}
const description = () => q<HTMLTextAreaElement>("[data-of-vault-asset-description]")?.value;

test("control: VaultMetadataEditor save answered 409 refused drops the retry", async () => {
  await saveMetadata(() => vaultFailure(409, "refused"));
  assert.equal(q("[data-of-vault-edit-retry]"), null);
  assert.match(editNotice(), /changed/);
});

test("F3: VaultMetadataEditor save refused with 400 keeps the operator's draft in the field", async () => {
  await saveMetadata(() => vaultFailure(400, "refused"));
  assert.match(editNotice(), /Check the description and tags/, "the refusal message points at the draft");
  assert.equal(description(), "new", "a refused save keeps the operator's draft; the message asks them to check it, so it must still be there");
});

// ---- F2: CategoryDrafts kept retry vs selection toggle ----
// The drafts command is the duplicate risk (each create mints a new requestId, CategoryDrafts.tsx:61); the price save re-reads the price and
// carries expectedFingerprint (CategoryDrafts.tsx:15,67), so it is not the red. Either fix passes: the toggle is blocked while a request is
// kept, or the kept retry survives the toggle.
const drafts = () => q("[data-of-category-drafts]");
const draftsButton = (text: string) => [...(drafts()?.querySelectorAll("button") ?? [])].find(b => b.textContent?.startsWith(text));
const draftsUrl = `${contentBase}/vault/category-drafts`;
const select = () => q<HTMLInputElement>(`[data-of-vault-select="${MEDIA}"]`);
async function unconfirmedDrafts() {
  serve(call => vaultReads(call) ?? (call.url === draftsUrl ? vaultFailure(502, "unconfirmed") : json({ ok: false }, 404)));
  const { default: VaultManager } = await import("../../components/onlyfans-preview/VaultManager");
  await mount(<VaultManager accountId={ACCOUNT} />, "/onlyfans/content");
  await settle(60);
  await click(q(`[data-of-folder-card="${FOLDER}"]`));
  await settle(60);
  await click(select());
  await settle(60);
  assert.ok(drafts(), "CategoryDrafts is shown inside the folder");
  assert.equal(drafts()?.querySelector<HTMLInputElement>("[aria-label='Category single price']")?.value, "10.00", "the saved category price is loaded");
  await click(draftsButton("Review 1 selected"));
  await settle(60);
  const boxes = [...drafts()!.querySelectorAll<HTMLInputElement>("input[type=checkbox]")];
  assert.equal(boxes.length, 2, "classification + rights confirmations are shown");
  for (const box of boxes) await click(box);
  await settle(20);
  const create = draftsButton("Create disabled single drafts") as HTMLButtonElement | undefined;
  assert.equal(create?.disabled, false, "the reviewed drafts can be created");
  await click(create);
  await settle(60);
  const sent = posts().filter(call => call.url === draftsUrl);
  assert.equal(sent.length, 1, "one drafts create sent");
  assert.deepEqual((bodyOf(sent[0]).category as { products: { mediaIds: string[] }[] }).products.map(p => p.mediaIds), [[MEDIA]]);
}

test("control: an unconfirmed (502) Create disabled single drafts inside a folder keeps Retry same request", async () => {
  await unconfirmedDrafts();
  assert.ok(draftsButton("Retry same request"));
});

test("F2: toggling one asset after an unconfirmed Create disabled single drafts does not drop Retry same request", async () => {
  await unconfirmedDrafts();
  assert.ok(draftsButton("Retry same request"), "precondition: the retry is kept");
  await click(select());
  await settle(60);
  const blocked = select()?.checked === true;
  assert.ok(blocked || draftsButton("Retry same request"),
    "toggling one asset is either blocked while the drafts request is kept, or the kept unconfirmed request survives it (inv 7: a user retry reuses the key)");
});
