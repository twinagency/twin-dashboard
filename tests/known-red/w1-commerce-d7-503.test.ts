// KNOWN RED (rule b dashboard part, REVIEW.md inv 7 "Unconfirmed is not refused (D7)"; W1 lane 3 finding F1).
// vault-backend.ts:15 and preparation-backend.ts:16 list 503 among the statuses that prove a write was NOT applied, so a
// backend 503 after the category price write (:28), the category drafts write (:41) or a preparation POST reads "refused".
// A 503 after the call does not prove anything was not applied: the UI drops the retry key on "refused"
// (CategoryDrafts.tsx:37), the next click mints a new commandKey, and duplicate drafts or spend can follow.
// Moxy save already maps 503 to "unconfirmed" (moxy-backend.ts:22); that rule is owned by tests/rules/w1-commerce-holds.test.ts.
// Team's Claude owns the fix. Not wired into npm scripts; init.sh does not list it yet (lane 10/orchestrator wires it).
import assert from "node:assert/strict";
import test from "node:test";
import { createVaultBackend } from "../../lib/onlyfans/vault-backend";
import { configuredPreparationBackend } from "../../lib/onlyfans/preparation-backend";
import type { CategoryDraft } from "../../lib/onlyfans/commercial-categories";

const HASH = "e".repeat(64);
const BASE = "https://backend.invalid";
function stub(status: number, body: unknown = null) {
  const calls: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => { calls.push(String(input));
    return new Response(body === null ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }) as typeof fetch;
  return { calls, fetchImpl };
}
function preparationBackend(fetchImpl: typeof fetch) {
  const saved = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith("ONLYFANS_")));
  for (const k of Object.keys(process.env)) if (k.startsWith("ONLYFANS_")) delete process.env[k];
  process.env.ONLYFANS_API_BASE_URL = BASE; process.env.ONLYFANS_CONFIGURATION_TOKEN = "synthetic-token";
  try { const backend = configuredPreparationBackend(fetchImpl); assert.ok(backend, "synthetic CONFIGURATION env must configure the backend"); return backend; }
  finally { for (const k of Object.keys(process.env)) if (k.startsWith("ONLYFANS_")) delete process.env[k]; Object.assign(process.env, saved); }
}
const category: CategoryDraft = { folderId: 7, priceCents: 5000, categoryPriceRevision: 1, classificationConfirmed: true, rightsConfirmed: true,
  reviewedState: { version: "agency-category-review.v1", bindingId: "binding-1", categoryFingerprint: HASH, assets: { "1001": HASH } },
  products: [{ label: "Beach single", description: "One beach photo.", mediaIds: ["1001"], previewMediaIds: [] }] };
const identity = { actor: "operator:synthetic", commandKey: HASH };
const stop = { action: "stop" as const, expectedRevision: 3, reason: "stop spending", ...identity };

async function threeWrites(status: number) {
  const out: { name: string; calls: number; outcome: string | null }[] = [];
  for (const name of ["setCategoryPrice", "categoryDrafts", "preparation POST"]) {
    const { calls, fetchImpl } = stub(status);
    const vault = createVaultBackend({ baseUrl: BASE, token: "synthetic-token", fetchImpl });
    const result = name === "setCategoryPrice" ? await vault.setCategoryPrice("of-a", "7", { priceCents: 5000, expectedFingerprint: HASH, ...identity })
      : name === "categoryDrafts" ? await vault.categoryDrafts("of-a", { category, ...identity })
      : await preparationBackend(fetchImpl).request("of-a", stop);
    out.push({ name, calls: calls.length, outcome: result.ok ? null : result.outcome });
  }
  return out;
}

test("control: a 409 on each of the three writes is refused after exactly one call", async () => {
  for (const r of await threeWrites(409)) { assert.equal(r.calls, 1, `${r.name}: one call`); assert.equal(r.outcome, "refused", `${r.name}: 409 proves not applied`); }
});

test("F1: a 503 after the category price, category drafts or preparation write is unconfirmed, not refused", async () => {
  const results = await threeWrites(503);
  for (const r of results) assert.equal(r.calls, 1, `${r.name}: one call, never retried`);
  assert.deepEqual(results.map(r => `${r.name}: ${r.outcome}`), ["setCategoryPrice: unconfirmed", "categoryDrafts: unconfirmed", "preparation POST: unconfirmed"],
    "a 503 after the call does not prove the write was not applied");
});
