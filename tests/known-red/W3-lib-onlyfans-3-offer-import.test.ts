// KNOWN RED (W3 lib-onlyfans-3, findings L9-01..L9-09; docs/review/W3/lib-onlyfans-3.md). Offer import lib + route dispatch.
// L9-01 lib/onlyfans/offer-import-backend.ts:21 — a local refused list: upstream 503 after a write reads "refused" (REVIEW inv 7, D7:
//    only 400/401/403/404/405/409/410/413/422 prove not applied), so the panel drops the exact retry and the next click mints a new
//    command (second job). 422 falls through to "unconfirmed" (a proven refusal kept as an unresolvable retry). Fix: one shared classifier.
// L9-02 offer-import-backend.ts:24 + offer-import-route.ts:49 — upstream 401/403 (the SERVICE credential) is answered to the browser as
//    HTTP 401/403, which OfferImportPanel.tsx:39-42 reads as the operator's own session lost and wipes the queued drafts. Fix: map to 502/503.
// L9-03 offer-import-backend.ts:23 + offer-import.ts:150 — upstream error text reaches the browser (inv 6). Fix: dashboard-owned copy.
// L9-04 offer-import-route.ts:43 — cancel carries no commandKey; a lost-reply retry has no stable write identity (inv 7 idempotency key).
//    The test accepts a body commandKey / idempotencyKey / requestId or an Idempotency-Key header, and resends the cancel with a
//    browser requestId if the fixed route requires one; it pins only "present on the wire and identical across an exact retry".
// L9-05 offer-import-backend.ts:36 — command read `v => v`: any upstream JSON, even naming another account, is answered 200 ok:true.
// L9-06 offer-import.ts:149,:82,:85 — draft priceCents 0..2^31-1 and a ready observation at any price 0..1e8 (manual range 300..20000).
// L9-07 offer-import.ts:137 — existingItem.enabled unchecked. L9-08 offer-import.ts:62 — job status any string.
// L9-09 lib/onlyfans/route.ts:87 — requestId admits "." and ".."; startJob("..") resolves past the /accounts/ segment.
// Team's Claude owns the fix. Not wired into npm scripts. Run: node --import tsx --test <this file>.
// Offline: wire faked with fetchImpl returning Response, baseUrl https://backend.invalid, token "synthetic-token".
import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import test from "node:test";
import { createOfferImportBackend } from "../../lib/onlyfans/offer-import-backend";
import { IMPORT_SCHEMA, parseCandidate, parseDraftResults, parseJobResponse } from "../../lib/onlyfans/offer-import";

// lib/onlyfans/route.ts imports the bundler-only `server-only` marker; resolve it to the repo's stub for this process only.
const resolver = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
const resolveOriginal = resolver._resolveFilename, serverOnlyStub = createRequire(import.meta.url).resolve("../../scripts/server-only.ts");
resolver._resolveFilename = (request, ...rest) => request === "server-only" ? serverOnlyStub : resolveOriginal(request, ...rest);
type RouteModule = typeof import("../../lib/onlyfans/offer-import-route");
type ImportCall = Parameters<RouteModule["dispatchImport"]>[0];
const requestId = async (value: string) => (await import("../../lib/onlyfans/route")).requestId(value);

// Fixture shapes copied from scripts/check-onlyfans-offer-import.ts.
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
const detail = { ...summary, variants: [], samples: [], observations: [observation], assetReasons: [], existingItem: null };
const draft = { observationId: OBS, expectedFingerprint: "c".repeat(64), label: "Two photos",
  description: "Two approved photographs.", reuseConfirmed: true, descriptionApproved: true };
const envelope = (body: Record<string, unknown>, accountId = ACCOUNT) => ({ schemaVersion: IMPORT_SCHEMA, ok: true, accountId, ...body });
const jobBody = { requestId: JOB, mode: "inventory", sources: null };
const operator = "op-session:" + "b".repeat(64);
const MARKER = "upstream-diagnostic-marker-l9";

type Wire = { url: string; method: string; body: Record<string, unknown> | null; headers: Headers };
function wireBackend(reply: (sent: Wire) => Response) {
  const wire: Wire[] = [];
  const backend = createOfferImportBackend({ baseUrl: "https://backend.invalid", token: "synthetic-token", fetchImpl: (async (url: string, init: RequestInit) => {
    const sent = { url: String(url), method: String(init.method), body: typeof init.body === "string" ? JSON.parse(init.body) : null, headers: new Headers(init.headers) };
    wire.push(sent); return reply(sent);
  }) as typeof fetch });
  return { backend, wire };
}
const status = (code: number, body: unknown = { ok: false }) => () => Response.json(body, { status: code });
const dispatch = async (backend: ReturnType<typeof createOfferImportBackend>, extra: Partial<ImportCall>) =>
  (await import("../../lib/onlyfans/offer-import-route")).dispatchImport({ method: "POST", accountId: ACCOUNT, path: ["jobs"], after: null, actor: operator, canManage: true, body: jobBody, ...extra }, backend);
const outcomeOf = (result: unknown) => (result as { ok: boolean; outcome?: string }).outcome;

/** The three writes, each against a backend whose wire answers `code`. */
async function writesAnswered(code: number) {
  const { backend } = wireBackend(status(code));
  return {
    startJob: await backend.startJob(ACCOUNT, { mode: "inventory", sources: null, commandKey: "a".repeat(64), actor: operator }),
    cancel: await backend.cancel(ACCOUNT, JOB, { expectedRevision: 3, actor: operator }),
    drafts: await backend.drafts(ACCOUNT, [{ ...draft, reuseConfirmed: true, descriptionApproved: true, commandKey: "e".repeat(64) }], operator),
  };
}

// ---------- L9-01 D7 ----------
test("control: L9-01 a write answered 409 is refused", async () => {
  for (const [name, result] of Object.entries(await writesAnswered(409))) assert.equal(outcomeOf(result), "refused", name);
});
test("control: L9-01 a write answered 502 is unconfirmed", async () => {
  for (const [name, result] of Object.entries(await writesAnswered(502))) assert.equal(outcomeOf(result), "unconfirmed", name);
});
test("L9-01: a write answered 503 is unconfirmed, not refused (D7)", async () => {
  const seen = Object.fromEntries(Object.entries(await writesAnswered(503)).map(([name, result]) => [name, outcomeOf(result)]));
  assert.deepEqual(seen, { startJob: "unconfirmed", cancel: "unconfirmed", drafts: "unconfirmed" },
    `D7: upstream 503 does not prove a write was not applied, so it must read "unconfirmed"; actual ${JSON.stringify(seen)}`);
});
test("L9-01: a write answered 422 is refused, not unconfirmed (D7 refusal list)", async () => {
  const seen = Object.fromEntries(Object.entries(await writesAnswered(422)).map(([name, result]) => [name, outcomeOf(result)]));
  assert.deepEqual(seen, { startJob: "refused", cancel: "refused", drafts: "refused" },
    `D7: upstream 422 proves the write was not applied and must read "refused"; actual ${JSON.stringify(seen)}`);
});

// ---------- L9-02 upstream 401/403 is not the operator's session ----------
test("control: L9-02 a read-only session's write is refused 403 by the dashboard and never reaches upstream", async () => {
  const { backend, wire } = wireBackend(() => Response.json(envelope({ job })));
  const answer = await dispatch(backend, { canManage: false });
  assert.equal(answer.status, 403);
  assert.equal(wire.length, 0);
});
for (const code of [401, 403]) test(`L9-02: upstream ${code} on a job write is not answered as HTTP 401/403`, async () => {
  const { backend, wire } = wireBackend(status(code, { error: "service credential rejected" }));
  const answer = await dispatch(backend, {});
  assert.equal(wire.length, 1, "fixture: the write reached the fake upstream");
  assert.ok(![401, 403].includes(answer.status),
    `an upstream ${code} is the service credential, not the operator's session; answering it as 401/403 makes the panel wipe the queue (OfferImportPanel.tsx:39-42); actual status ${answer.status}`);
});

// ---------- L9-03 upstream text never reaches the browser ----------
test("control: L9-03 a 200 drafts envelope with one failed item parses as failed", () => {
  const key = "e".repeat(64);
  const parsed = parseDraftResults(envelope({ results: [{ commandKey: key, ok: false, code: "existing_item_conflict", error: "x" }], created: 0, failed: 1 }), ACCOUNT, [key]);
  assert.ok(parsed && parsed[0].ok === false);
});
test("L9-03: an upstream refusal's error text does not reach the browser answer", async () => {
  const { backend } = wireBackend(status(409, { error: MARKER }));
  const answer = await dispatch(backend, {});
  assert.equal(answer.status, 409, "fixture: the 409 is a refusal");
  const sent = JSON.stringify(answer.body);
  assert.ok(!sent.includes(MARKER), `inv 6: upstream diagnostic text must be replaced by dashboard-owned copy; actual body ${sent}`);
});
test("L9-03: a failed draft item's upstream error text does not reach the browser answer", async () => {
  const { backend } = wireBackend(sent => {
    const keys = (sent.body!.drafts as { commandKey: string }[]).map(d => d.commandKey);
    return Response.json(envelope({ results: keys.map(commandKey => ({ commandKey, ok: false, code: "existing_item_conflict", error: MARKER })), created: 0, failed: keys.length }));
  });
  const answer = await dispatch(backend, { path: ["drafts"], body: { drafts: [draft] } });
  assert.equal(answer.status, 200, "fixture: the draft envelope parsed");
  const sent = JSON.stringify(answer.body);
  assert.ok(!sent.includes(MARKER), `inv 6: per-draft upstream error text must be replaced by dashboard-owned copy; actual body ${sent}`);
});

// ---------- L9-04 cancel idempotency ----------
test("control: L9-04 an identical job retry carries the same commandKey", async () => {
  const { backend, wire } = wireBackend(() => Response.json(envelope({ job })));
  await dispatch(backend, {}); await dispatch(backend, {});
  assert.match(String(wire[0].body!.commandKey), /^[a-f0-9]{64}$/);
  assert.equal(wire[0].body!.commandKey, wire[1].body!.commandKey);
});
test("L9-04: a cancel carries an idempotency key and an identical retry reuses it", async () => {
  // The current body first; a fixed route may instead require a browser requestId (as /jobs does), so resend with one if refused.
  let wire: Wire[] = [];
  for (const body of [{ expectedRevision: 3 }, { expectedRevision: 3, requestId: "2f0e0d0c-0b0a-4908-8706-050403020100" }]) {
    const run = wireBackend(() => Response.json(envelope({ job: { ...job, status: "cancelled", revision: 4 } })));
    const cancel = { path: ["jobs", JOB, "cancel"], body };
    await dispatch(run.backend, cancel); await dispatch(run.backend, cancel);
    wire = run.wire; if (wire.length === 2) break;
  }
  assert.equal(wire.length, 2, "fixture: both cancels reached the fake upstream");
  const idOf = (w: Wire) => w.body?.commandKey ?? w.body?.idempotencyKey ?? w.body?.requestId ?? w.headers.get("idempotency-key");
  const keys = wire.map(idOf);
  assert.ok(keys.every(k => typeof k === "string" && k.length >= 16),
    `inv 7: every upstream write carries an idempotency key a user retry reuses; actual cancel wire body keys ${JSON.stringify(Object.keys(wire[0].body ?? {}).sort())}`);
  assert.equal(keys[0], keys[1], "an identical cancel retry must resolve to the same command");
});

// ---------- L9-05 command read ----------
test("L9-05: a command read whose upstream body names another account is not answered 200 ok:true", async () => {
  const { backend } = wireBackend(() => Response.json({ accountId: "acc-b", ok: false, marker: "x" }));
  const answer = await dispatch(backend, { method: "GET", path: ["commands", "d".repeat(64)], canManage: false, body: undefined });
  const body = answer.body as { ok?: unknown };
  assert.ok(!(answer.status === 200 && body.ok === true),
    `inv 7 isolation: a command body for acc-b requested under acc-a must be refused, not passed through; actual ${answer.status} ${JSON.stringify(answer.body)}`);
});

// ---------- L9-06 money ----------
test("control: L9-06 a draft created at USD 19.99 and a ready observation at USD 19.99 parse", () => {
  const key = "e".repeat(64);
  assert.ok(parseDraftResults(envelope({ results: [{ commandKey: key, ok: true, itemId: "7", priceCents: 1999, sourceAt: null }], created: 1, failed: 0 }), ACCOUNT, [key]));
  assert.ok(parseCandidate(envelope({ candidate: detail }), ACCOUNT));
  assert.ok(parseCandidate(envelope({ candidate: { ...detail, observations: [{ ...observation, priceCents: 0, reasons: ["price_out_of_range"], ready: false }] } }), ACCOUNT),
    "an out-of-range price flagged not ready stays representable");
});
for (const priceCents of [0, 2_000_000]) test(`L9-06: a created draft at ${priceCents} cents is rejected`, () => {
  const key = "e".repeat(64);
  const parsed = parseDraftResults(envelope({ results: [{ commandKey: key, ok: true, itemId: "7", priceCents, sourceAt: null }], created: 1, failed: 0 }), ACCOUNT, [key]);
  assert.equal(parsed, null, `money: a draft price outside the manual range 300..20000 must not parse as "Draft created"; actual ${JSON.stringify(parsed)}`);
});
for (const priceCents of [0, 2_000_000]) test(`L9-06: a ready observation at ${priceCents} cents is rejected`, () => {
  const parsed = parseCandidate(envelope({ candidate: { ...detail, observations: [{ ...observation, priceCents }] } }), ACCOUNT);
  const kept = parsed?.observations?.[0];
  assert.ok(parsed === null || kept?.ready === false,
    `money: an observation priced outside 300..20000 must not parse or not be selectable (ready false); actual observation price ${kept?.priceCents} ready ${kept?.ready}`);
});

// ---------- L9-07 / L9-08 ----------
test("control: L9-07 a full existingItem parses", () => {
  assert.ok(parseCandidate(envelope({ candidate: { ...detail, existingItem: { itemId: "7", priceCents: 1999, enabled: true, pricingMode: "manual", importedBy: null } } }), ACCOUNT));
});
test("L9-07: an existingItem without a boolean enabled is rejected", () => {
  const parsed = parseCandidate(envelope({ candidate: { ...detail, existingItem: { itemId: "7", priceCents: 1999 } } }), ACCOUNT);
  assert.equal(parsed, null, `existingItem.enabled must be a boolean (the panel reads its truthiness as draft/enabled); actual ${JSON.stringify(parsed?.existingItem)}`);
});
test("control: L9-08 a job with status complete parses", () => {
  assert.ok(parseJobResponse(envelope({ job }), ACCOUNT));
});
test("L9-08: a job with an unknown status is rejected", () => {
  const parsed = parseJobResponse(envelope({ job: { ...job, status: "mystery" } }), ACCOUNT);
  assert.equal(parsed, null, `job status must be a known status, never shown as backend truth; actual status ${JSON.stringify(parsed?.status)}`);
});

// ---------- L9-09 dot segments ----------
test("control: L9-09 a plain account id is kept", async () => {
  assert.equal(await requestId("acc-a"), "acc-a");
});
for (const id of [".", ".."]) test(`L9-09: requestId(${JSON.stringify(id)}) is rejected`, async () => {
  const kept = await requestId(id);
  assert.equal(kept, null, `a dot segment must never become a path account id; actual ${JSON.stringify(kept)}`);
});
