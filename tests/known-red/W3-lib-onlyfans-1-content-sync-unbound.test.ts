// KNOWN RED (REVIEW.md inv 7 "no false success" + D7 + money; W3-lib-onlyfans-1 findings F3/F4/F5). Content sync:
//  - content-sync-client.ts:30 decides "refused" by HTTP status: a POST answered 429 or a malformed 200 reads refused,
//    and every caller then drops the kept request (ContentSyncSave.tsx:96 newJob → next save mints a new commandKey).
//  - content-sync-backend.ts:57,65 parsers are not bound to the conflict/draft the write named: a reply for another
//    conflict or another draft reads ok (ContentSyncConflict.tsx:61 then says the change is done).
//  - content-sync.ts:180 parseDraft accepts priceCents 0..299 although the request floor is 300 (:236, CORRECTNESS claim 8).
// Each red has a control that passes today. Team's Claude owns the fix. Not wired into npm scripts or init.sh (its list is hard-coded); run with node --import tsx --test.
import assert from "node:assert/strict";
import test from "node:test";
import { syncCall } from "../../lib/onlyfans/content-sync-client";
import { createContentSyncBackend } from "../../lib/onlyfans/content-sync-backend";
import { SYNC_SCHEMA, parseDraft } from "../../lib/onlyfans/content-sync";

const ACCOUNT = "acc-a", stamp = "2026-10-23T01:02:03Z", FILE = "1f0e0d0c-0b0a-4908-8706-050403020100";
const terms = { priceCents: 1999, mediaCount: 2, previewCount: 1, sourceAt: stamp };
const conflict = { conflictId: "cf-1", itemId: "7", revision: 2, status: "open", createdAt: stamp, current: terms,
  source: { ...terms, priceCents: 2500, lockedText: false }, itemFingerprint: "c".repeat(64), resolution: null, resolvedAt: null };
const asset = { assetId: "as-1", fileId: FILE, name: "Synthetic.png", kind: "photo", order: 0, freePreview: false, state: "queued", attempts: 1, lastError: null };
const draft = (extra: Record<string, unknown> = {}) => ({ draftId: "dr-1", revision: 1, state: "queued", reason: null, label: "Two photos",
  description: "Approved.", priceCents: 1999, pricingMode: "fixed", itemId: null, enabled: false, assets: [asset],
  readiness: { mediaSynced: false, canEnable: false, blockers: ["media_not_synced"] }, ...extra });
const envelope = (body: Record<string, unknown>) => ({ schemaVersion: SYNC_SCHEMA, ok: true, ...body });
const backend = (reply: unknown) => createContentSyncBackend({ baseUrl: "https://backend.invalid", token: "synthetic-token",
  fetchImpl: (async () => Response.json(reply, { status: 200 })) as typeof fetch });

async function postThroughClient(status: number, body: unknown) {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => Response.json(body, { status })) as typeof fetch;
  try { return await syncCall(ACCOUNT, "/drafts", { method: "POST", body: { requestId: "0f0e0d0c-0b0a-4908-8706-050403020100" } }); }
  finally { globalThis.fetch = original; }
}

test("control: a POST answered 502 reads unconfirmed in the browser helper", async () => {
  assert.equal((await postThroughClient(502, { ok: false })).kind, "unconfirmed");
});
test("control: a well-formed 200 reaches the helper and reads ok", async () => {
  assert.equal((await postThroughClient(200, { ok: true, data: {} })).kind, "ok");
});
test("control: a POST answered 409 with a refused envelope reads refused", async () => {
  assert.equal((await postThroughClient(409, { ok: false, outcome: "refused", code: "revision_conflict" })).kind, "refused");
});
test("D7: a POST answered 429 is unconfirmed, not refused", async () => {
  assert.equal((await postThroughClient(429, { ok: false, error: "slow down" })).kind, "unconfirmed");
});
test("no false refusal: a malformed 200 reply to a POST is unconfirmed, not refused", async () => {
  assert.equal((await postThroughClient(200, { ok: false })).kind, "unconfirmed");
});

test("control: a resolve reply for the requested conflict, resolved, is ok", async () => {
  const reply = envelope({ conflict: { ...conflict, status: "resolved", resolution: "keep_crm", resolvedAt: stamp }, itemId: "7" });
  assert.equal((await backend(reply).resolve(ACCOUNT, "cf-1", {})).ok, true);
});
test("no false success: a resolve reply naming another (resolved) conflict is not ok", async () => {
  const reply = envelope({ conflict: { ...conflict, conflictId: "cf-2", status: "resolved", resolution: "keep_crm", resolvedAt: stamp }, itemId: "7" });
  const result = await backend(reply).resolve(ACCOUNT, "cf-1", {});
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.outcome, "unconfirmed", "a post-write ack for the wrong conflict proves nothing (D7)");
});
test("control: a commit reply for the requested draft is ok", async () => {
  assert.equal((await backend(envelope({ draft: draft() })).commit(ACCOUNT, "dr-1", { commandKey: "a".repeat(64), actor: "op-session:synthetic" })).ok, true);
});
test("no false success: a commit reply for another draft is not ok", async () => {
  const result = await backend(envelope({ draft: draft({ draftId: "dr-2" }) })).commit(ACCOUNT, "dr-1", { commandKey: "a".repeat(64), actor: "op-session:synthetic" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.outcome, "unconfirmed", "a post-write ack for the wrong draft proves nothing (D7)");
});

test("control: a fixed-price draft at 1999 cents parses", () => { assert.ok(parseDraft(draft())); });
test("money: a fixed-price draft below the 300-cent floor does not parse", () => {
  assert.equal(parseDraft(draft({ priceCents: 0 })), null);
  assert.equal(parseDraft(draft({ priceCents: 299 })), null);
});
