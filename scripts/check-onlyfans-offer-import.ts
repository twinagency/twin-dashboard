import assert from "node:assert/strict";
import { createOfferImportBackend } from "../lib/onlyfans/offer-import-backend";
import { IMPORT_HEADER, IMPORT_SCHEMA, parseCandidate, parseCandidatePage, parseDraftResults, parseJobResponse,
  validCancelRequest, validDraft, validDraftRequest, validJobRequest, usd } from "../lib/onlyfans/offer-import";
import { CONTENT_SCHEMA, parseContentItem } from "../lib/onlyfans/content";
import { CONTENT_V2_SCHEMA, parseContentItemV2, validContentRequestV2, parseContentAckV2 } from "../lib/onlyfans/content-v2";

const ACCOUNT = "acc-a", JOB = "0f0e0d0c-0b0a-4908-8706-050403020100", OBS = "1f0e0d0c-0b0a-4908-8706-050403020100";
const job = { jobId: JOB, commandKey: "a".repeat(64), mode: "inventory", status: "complete", revision: 3, rowsScanned: 4,
  pagesRead: 1, pageBudget: 1000, targetsTotal: 0, targetsDone: 0, lastError: null, requestedAt: "2026-10-23T00:00:00Z",
  updatedAt: "2026-10-23T00:00:01Z", completedAt: "2026-10-23T00:00:01Z", coverage: "imported_history" };
const summary = { candidateId: "b".repeat(64), revision: 3, attachmentCount: 2, sourceCount: 3, observedPrices: [1999, 2500],
  variantCount: 3, verifiedSources: 1, itemId: null, status: "ready_for_review" };
const observation = { observationId: OBS, fingerprint: "c".repeat(64), sourceKind: "message", sourceId: "1001", fanId: "501",
  sourceContext: "direct", sourceAt: "2026-09-01T12:00:00Z", observedAt: "2026-10-23T00:00:00Z", mediaIds: ["11", "12"],
  previewIds: ["11"], lockedText: false, priceCents: 1999, currency: "USD",
  attachments: [{ mediaId: "11", kind: "photo", freePreview: true }, { mediaId: "12", kind: "photo", freePreview: false }],
  reasons: [], ready: true };
const envelope = (body: Record<string, unknown>) => ({ schemaVersion: IMPORT_SCHEMA, ok: true, accountId: ACCOUNT, ...body });

async function main() {
  // Strict response parsing, account binding and no unexpected envelope keys.
  assert(parseJobResponse(envelope({ job }), ACCOUNT));
  assert.equal(parseJobResponse(envelope({ job }), "acc-b"), null);
  assert.equal(parseJobResponse({ ...envelope({ job }), extra: 1 }, ACCOUNT), null);
  for (const change of [{ jobId: "x" }, { mode: "posts" }, { revision: -1 }, { coverage: "full_account" }])
    assert.equal(parseJobResponse(envelope({ job: { ...job, ...change } }), ACCOUNT), null);
  const page = parseCandidatePage(envelope({ job, items: [summary], nextCursor: null }), ACCOUNT);
  assert(page && page.items[0].observedPrices.length === 2, "every observed price is shown, none chosen");
  assert.equal(parseCandidatePage(envelope({ job, items: [{ ...summary, status: "enabled" }], nextCursor: null }), ACCOUNT), null);
  const detail = { ...summary, variants: [], samples: [], observations: [observation], assetReasons: [], existingItem: null };
  assert(parseCandidate(envelope({ candidate: detail }), ACCOUNT));
  for (const change of [{ previewIds: null, lockedText: null, ready: false, reasons: ["previews_unknown"] }])
    assert(parseCandidate(envelope({ candidate: { ...detail, observations: [{ ...observation, ...change }] } }), ACCOUNT), "unknown stays representable");
  for (const change of [{ priceCents: 19.99 }, { currency: "EUR" }, { mediaIds: [11] }, { lockedText: "false" }])
    assert.equal(parseCandidate(envelope({ candidate: { ...detail, observations: [{ ...observation, ...change }] } }), ACCOUNT), null);

  // Client requests never carry a price, actor or command key.
  const draft = { observationId: OBS, expectedFingerprint: "c".repeat(64), label: "Two photos",
    description: "Two approved photographs.", reuseConfirmed: true, descriptionApproved: true };
  assert(validDraft(draft) && validDraftRequest({ drafts: [draft] }));
  for (const change of [{ priceCents: 100 }, { actor: "x" }, { commandKey: "d".repeat(64) }, { reuseConfirmed: false },
    { descriptionApproved: false }, { description: " " }, { label: "" }])
    assert.equal(validDraft({ ...draft, ...change }), false);
  assert.equal(validDraftRequest({ drafts: Array(21).fill(draft) }), false);
  assert.equal(validDraftRequest({ drafts: [] }), false);
  assert(validJobRequest({ requestId: JOB, mode: "inventory", sources: null }));
  assert(validJobRequest({ requestId: JOB, mode: "refresh", sources: [{ fanId: "501", messageId: "1001" }] }));
  assert.equal(validJobRequest({ requestId: JOB, mode: "refresh", sources: Array(51).fill({ fanId: "501", messageId: "1001" }) }), false);
  assert.equal(validJobRequest({ requestId: JOB, mode: "inventory", sources: null, actor: "x" }), false);
  assert(validCancelRequest({ expectedRevision: 1 }) && !validCancelRequest({ expectedRevision: 0 }));

  // Per-item results must match the request exactly; partial batches stay partial.
  const keys = ["e".repeat(64), "f".repeat(64)];
  const results = [{ commandKey: keys[0], ok: true, itemId: "7", priceCents: 1999, sourceAt: null },
    { commandKey: keys[1], ok: false, code: "existing_item_conflict", error: "A catalogue item already holds these attachments." }];
  const parsed = parseDraftResults(envelope({ results, created: 1, failed: 1 }), ACCOUNT, keys);
  assert(parsed && parsed[0].ok && !parsed[1].ok);
  assert.equal(parseDraftResults(envelope({ results: results.slice(0, 1), created: 1, failed: 0 }), ACCOUNT, keys), null);
  assert.equal(parseDraftResults(envelope({ results: [...results].reverse(), created: 1, failed: 1 }), ACCOUNT, keys), null);
  assert.equal(usd(1007), "USD 10.07"); assert.equal(usd(300), "USD 3.00"); assert.equal(usd(20000), "USD 200.00");

  // Backend: content credential, import header, one attempt, uncertainty preserved.
  const calls: { url: string; init: RequestInit }[] = [];
  let reply: () => Response = () => new Response(JSON.stringify(envelope({ job })), { status: 200, headers: { "content-type": "application/json" } });
  const backend = createOfferImportBackend({ baseUrl: "http://backend.invalid/", token: "content-token", fetchImpl: (async (url: string, init: RequestInit) => {
    calls.push({ url, init }); return reply(); }) as typeof fetch });
  const started = await backend.startJob(ACCOUNT, { mode: "inventory", sources: null, commandKey: "a".repeat(64), actor: "op-session:" + "b".repeat(64) });
  assert(started.ok);
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(calls[0].url, "http://backend.invalid/onlyfans/offer-import/v1/accounts/acc-a/jobs");
  assert.equal(headers.Authorization, "Bearer content-token"); assert.equal(headers[IMPORT_HEADER], IMPORT_SCHEMA);
  assert.equal(calls[0].init.credentials, "omit"); assert.equal(calls[0].init.redirect, "error");
  reply = () => { throw new Error("network"); };
  const lost = await backend.drafts(ACCOUNT, [{ ...draft, commandKey: keys[0] }], "op-session:" + "b".repeat(64));
  assert(!lost.ok && lost.outcome === "unconfirmed", "a lost reply is never reported as failure");
  assert.equal(calls.length, 2, "no automatic retry");
  reply = () => new Response(JSON.stringify({ ok: false, error: "That command was already used with different details." }), { status: 409 });
  const refused = await backend.drafts(ACCOUNT, [{ ...draft, commandKey: keys[0] }], "op-session:" + "b".repeat(64));
  assert(!refused.ok && refused.outcome === "refused");

  // Content v2 adds provenance without changing v1.
  const item = { revision: 1, fingerprint: "a".repeat(64), label: "Two photos", labelTruncated: false, description: "Approved.",
    descriptionTruncated: false, priceCents: 1999, enabled: false, currency: "USD", isFreeTeaser: false };
  const provenance = { sourcePriceCents: 1999, sourceAt: "2026-09-01T12:00:00Z", sourceContext: "direct", previewIds: ["11"],
    withdrawn: false, label: "Price from selected OnlyFans offer" };
  const v2 = { schemaVersion: CONTENT_V2_SCHEMA, ok: true, accountId: ACCOUNT, itemId: "7",
    item: { ...item, pricingMode: "fixed", provenance, priceOverridden: false } };
  assert(parseContentItemV2(v2, ACCOUNT, "7")?.provenance?.sourcePriceCents === 1999);
  assert.equal(parseContentItem({ ...v2, schemaVersion: CONTENT_SCHEMA }, ACCOUNT, "7"), null, "v1 parser rejects v2 fields");
  assert.equal(parseContentItemV2({ ...v2, item: { ...v2.item, provenance: { ...provenance, label: "Current OnlyFans price" } } }, ACCOUNT, "7"), null);
  const request = { patch: { priceCents: 2500 }, expectedRevision: 1, expectedFingerprint: "a".repeat(64), acknowledgeOverride: true };
  assert(validContentRequestV2(request));
  assert.equal(validContentRequestV2({ ...request, acknowledgeOverride: "yes" }), false);
  assert.equal(validContentRequestV2({ patch: request.patch, expectedRevision: 1, expectedFingerprint: "a".repeat(64) }), false);
  const ack = { schemaVersion: CONTENT_V2_SCHEMA, ok: true, applied: true, accountId: ACCOUNT, itemId: "7", commandKey: "c".repeat(64),
    recordedRevision: 2, recordedFingerprint: "d".repeat(64) };
  assert(parseContentAckV2(ack, { ...request, accountId: ACCOUNT, itemId: "7" }));
  assert.equal(parseContentAckV2({ ...ack, schemaVersion: CONTENT_SCHEMA }, { ...request, accountId: ACCOUNT, itemId: "7" }), null);
  console.log("PASS offer import: strict scoped envelopes, every price variant shown, no client prices or identities, exact per-item results, one-attempt uncertain writes, content v2 provenance with v1 unchanged");
}

main().catch(error => { console.error(error); process.exit(1); });
