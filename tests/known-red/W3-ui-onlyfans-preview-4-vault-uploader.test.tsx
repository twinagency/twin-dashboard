// KNOWN RED (W3 ui-onlyfans-preview-4, findings F9 F10 F11 F12 in docs/review/W3/ui-onlyfans-preview-4.md). Team's Claude owns the fixes.
// F9  components/onlyfans-preview/VaultUploader.tsx:104,109: a job with cleanupRequired:true says "This batch needs review before another
//     upload can start." while "Upload to OnlyFans" stays enabled and posts a new create (UI claim vs behaviour).
// F10 VaultUploader.tsx:84-85: any parsed finish ack reads "Files transferred. This batch is queued for OnlyFans.", also when the acked job
//     is `failed` (inv 7: no false success).
// F11 VaultUploader.tsx:31,69: a create answered 409 (a proven refusal) keeps `createRequest` with the connection revision captured at
//     creation; after the connection changes, the next click re-posts the stale revision unchanged.
// F12 VaultManager.tsx:136-137: a create answered 403 with outcome "refused" (vault-route.ts:14 origin/content-type refusal) is treated as
//     session loss: label, description and price are wiped and the form is removed ("Sign in again"), though signing in fixes nothing.
// Not wired into npm scripts; init.sh does not run it yet (shared file; wiring decided at window close).
// Offline: jsdom, global fetch stubbed (https://fixture.invalid).
import { bodyOf, click, close, json, mount, posts, q, rerender, serve, settle, submit, type, type Call } from "../helpers/w3-preview4-dom";
import { ACCOUNT, MEDIA, SCHEMA, contentBase, uploadAck, uploadFile, uploadJob, uploadsBody, vaultFailure, vaultReads } from "../helpers/w3-preview4-vault";
import assert from "node:assert/strict";
import test, { after } from "node:test";
import React, { act } from "react";
import { parseUploadAck, parseUploads } from "../../lib/onlyfans/vault-media";

after(close);
Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
const uploads = `${contentBase}/vault/uploads`;
const creates = () => posts().filter(call => call.url === uploads);
const uploadButton = () => [...document.querySelectorAll<HTMLButtonElement>("[data-of-vault-uploader] button")].find(b => /Upload to OnlyFans|Resume transfer/.test(b.textContent ?? ""));
const notice = () => [...document.querySelectorAll("[data-of-vault-uploader] [role=status]")].map(n => n.textContent).join(" | ");

type Answer = (call: Call) => Response | Promise<Response>;
async function uploader(jobs: unknown[], answer: Answer, revision = 3) {
  serve(call => call.method === "GET" && call.url === uploads ? json(uploadsBody(jobs)) : answer(call));
  const { default: VaultUploader } = await import("../../components/onlyfans-preview/VaultUploader");
  const element = (connectionRevision: number) => <VaultUploader accountId={ACCOUNT} connectionRevision={connectionRevision} onChanged={() => {}} />;
  await mount(element(revision), "/onlyfans/content");
  const input = q<HTMLInputElement>("[data-of-vault-uploader] input[type=file]");
  assert.ok(input, "the upload form is shown");
  await act(async () => {
    Object.defineProperty(input, "files", { configurable: true, value: [new File([new Uint8Array([1, 2, 3])], "beach.jpg", { type: "image/jpeg" })] });
    input.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
  return element;
}
/** Answers a whole new batch: create → chunk → finish, the finish acked with `finished`. */
const fullTransfer = (finished: string): Answer => call => {
  const job = uploadJob("receiving");
  if (call.url === uploads) return json(uploadAck(job));
  if (call.url.includes("/files/")) return json({ schemaVersion: SCHEMA, ok: true, accountId: ACCOUNT, jobId: job.jobId, fileId: uploadFile().fileId, receivedBytes: 3 }); // shape of uploads route.ts:32
  if (call.url.endsWith("/finish")) return json(uploadAck(uploadJob(finished, { files: [{ ...uploadFile(), receivedBytes: 3, status: finished === "failed" ? "failed" : "pending" }] })));
  return new Response(null, { status: 404 });
};

test("control: fixtures are accepted by the real parsers (a failed job is a valid finish ack)", () => {
  assert.ok(parseUploads(uploadsBody([uploadJob("failed", { cleanupRequired: true })]), ACCOUNT));
  assert.ok(parseUploadAck(uploadAck(uploadJob("receiving")), ACCOUNT));
  assert.equal(parseUploadAck(uploadAck(uploadJob("failed")), ACCOUNT)?.status, "failed");
});

// ---- F9 ----
test("control: a cleanupRequired job shows the needs-review hold", async () => {
  await uploader([uploadJob("failed", { cleanupRequired: true })], () => new Response(null, { status: 404 }));
  assert.match(notice(), /needs review before another upload can start/);
});

test("F9: a cleanupRequired job blocks a new upload", async () => {
  await uploader([uploadJob("failed", { cleanupRequired: true })], () => json(uploadAck(uploadJob("receiving"))));
  await click(uploadButton());
  await settle(60);
  assert.equal(creates().length, 0, "the UI says another upload cannot start until the batch is reviewed, so no new create is posted");
});

// ---- F10 ----
test("control: a finish acked with a pending job reads queued", async () => {
  await uploader([], fullTransfer("pending"));
  await click(uploadButton());
  await settle(80);
  assert.ok(posts().some(call => call.url.endsWith("/finish")), "the finish was sent");
  assert.match(notice(), /queued for OnlyFans/);
});

test("F10: a finish acked with a failed job does not read queued", async () => {
  await uploader([], fullTransfer("failed"));
  await click(uploadButton());
  await settle(80);
  assert.ok(posts().some(call => call.url.endsWith("/finish")), "the finish was sent");
  assert.doesNotMatch(notice(), /queued for OnlyFans/, "a finish whose acked job is failed is not reported as queued (inv 7: no false success)");
});

// ---- F11 ----
async function refusedCreate() {
  const element = await uploader([], call => call.url === uploads ? vaultFailure(409, "refused") : new Response(null, { status: 404 }));
  await click(uploadButton());
  await settle(60);
  assert.equal(creates().length, 1, "one create sent");
  assert.equal(bodyOf(creates()[0]).expectedConnectionRevision, 3);
  return element;
}

test("control: a create answered 409 is shown as changed", async () => {
  await refusedCreate();
  assert.match(notice(), /This upload changed/);
});

test("F11: after a 409 and a connection change, the next create carries the new connection revision", async () => {
  const element = await refusedCreate();
  await rerender(element(4), "/onlyfans/content");
  await click(uploadButton());
  await settle(60);
  assert.equal(creates().length, 2, "the second click sent a create");
  assert.equal(bodyOf(creates()[1]).expectedConnectionRevision, 4,
    "a create the server refused (409) is not re-posted unchanged with the stale connection revision");
});

// ---- F12 (VaultManager variant) ----
async function refusedOffer(status: number) {
  serve(call => vaultReads(call) ?? (call.url === `${contentBase}/items` ? vaultFailure(status, "refused") : json({ ok: false }, 404)));
  const { default: VaultManager } = await import("../../components/onlyfans-preview/VaultManager");
  await mount(<VaultManager accountId={ACCOUNT} />, "/onlyfans/content");
  await settle(60);
  await click(q(`[data-of-vault-select="${MEDIA}"]`));
  await type(q("[data-of-vault-product-label]"), "Beach set");
  await type(q("[data-of-vault-product-price]"), "12.00");
  await type(q("[data-of-vault-product-description]"), "One beach photo.");
  await submit(q("[data-of-vault-create]")?.closest("form"));
  await settle(60);
  assert.equal(posts().filter(call => call.url === `${contentBase}/items`).length, 1, "one create sent");
}
const draft = () => ({ label: q<HTMLInputElement>("[data-of-vault-product-label]")?.value, price: q<HTMLInputElement>("[data-of-vault-product-price]")?.value });

test("control: VaultManager create refused with 409 keeps the label and price", async () => {
  await refusedOffer(409);
  assert.deepEqual(draft(), { label: "Beach set", price: "12.00" });
});

test("F12: VaultManager create refused with 403 outcome refused keeps the label and price", async () => {
  await refusedOffer(403);
  assert.deepEqual(draft(), { label: "Beach set", price: "12.00" },
    "a 403 refusal (outcome refused: origin/content-type or an upstream 403) is not session loss: the operator's offer draft stays");
});
