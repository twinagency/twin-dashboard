/** Synthetic read contracts; no network or backend fixtures in production. */
import assert from "node:assert/strict";
import { parseWorkspace, formatRecordedMoney } from "../lib/onlyfans/workspace";
import { createHttpOnlyFansBackend } from "../lib/onlyfans/backend";

async function main() {
  const base = { schemaVersion: "of-workspace.v1", accountId: "acc-a", asOf: "2026-10-18T01:00:00Z",
    lastCompleteSyncAt: null, historyRecoveryRequired: true, providerConnectionVerified: false };
  const item = { itemId: "1", label: "Neutral collection", kind: "video", description: "A scenic video.",
    descriptionTruncated: false, mediaCount: 3, previewCount: 1, priceCents: 1000, currency: "USD",
    readiness: "terms_checked", updatedAt: null };
  const content = { ...base, section: "content", items: [item], nextCursor: null };
  assert(parseWorkspace(content, "acc-a", "content"));
  assert.equal(parseWorkspace(content, "acc-b", "content"), null);
  assert.equal(parseWorkspace(content, "acc-a", "sales"), null);
  for (const mutation of [{ priceCents: -1 }, { priceCents: 1.1 }, { currency: "" }, { mediaCount: 36 },
    { mediaCount: true }, { readiness: { toString: "invalid" } }, { itemId: 1 }]) {
    assert.equal(parseWorkspace({ ...content, items: [{ ...item, ...mutation }] }, "acc-a", "content"), null);
  }
  const badItem = { ...item, priceCents: null, mediaCount: null, readiness: "needs_review" };
  assert(parseWorkspace({ ...content, items: [badItem] }, "acc-a", "content"));
  assert.equal(parseWorkspace({ ...content, items: [item, item] }, "acc-a", "content"), null);
  assert.equal(parseWorkspace({ ...content, privateSource: "not allowed" }, "acc-a", "content"), null);
  const tx = { transactionId: "20", fanId: "101", messageId: null, kind: "ppv_message", status: "refunded",
    grossCents: 1000, netCents: null, currency: "EUR", occurredAt: base.asOf };
  const total = { currency: "EUR", status: "refunded", count: 1, grossCents: 1000 };
  const sales = { ...base, section: "sales", transactions: [tx], totals: [total], nextCursor: null, openOffers: [], openOfferCount: 0, moreOpenOffers: false };
  assert(parseWorkspace(sales, "acc-a", "sales"));
  assert.equal(parseWorkspace({ ...sales, totals: [total, total] }, "acc-a", "sales"), null);
  assert.equal(parseWorkspace({ ...sales, moreOpenOffers: true }, "acc-a", "sales"), null);
  for (const mutation of [{ grossCents: 1.1 }, { grossCents: Number.MAX_SAFE_INTEGER + 1 }, { currency: "usd" }, { occurredAt: "yesterday" }, { netCents: true }]) {
    assert.equal(parseWorkspace({ ...sales, transactions: [{ ...tx, ...mutation }] }, "acc-a", "sales"), null);
  }
  assert(parseWorkspace({ ...sales, transactions: [{ ...tx, grossCents: -1000 }] }, "acc-a", "sales"));
  assert.equal(formatRecordedMoney(1000, "EUR"), "EUR 10.00");
  assert.equal(formatRecordedMoney(-123, "USD"), "USD −1.23");
  assert.equal(formatRecordedMoney(Number.MAX_SAFE_INTEGER, "USD"), "USD 90071992547409.91");
  assert.throws(() => formatRecordedMoney(1.5, "USD"));
  const cfg = { personaExcerpt: "Approved synthetic persona", personaTruncated: false, creatorFacts: [{ label: "Age", value: "28" }],
    language: null, savedDefaultModel: null, savedReplyModelOverride: null, dailyModelCapCents: 100,
    salesPermissions: { pack_send_enabled: true, pack_on_ask_enabled: null, qualification_gate_enabled: false }, issues: [] };
  const settings = { ...base, section: "settings", runtimeEnabled: false, deliveryPolicy: null, configuration: cfg };
  assert(parseWorkspace(settings, "acc-a", "settings"));
  assert.equal(parseWorkspace({ ...settings, configuration: { ...cfg, dailyModelCapCents: -1 } }, "acc-a", "settings"), null);
  assert.equal(parseWorkspace({ ...settings, configuration: { ...cfg, issues: ["invented"] } }, "acc-a", "settings"), null);
  assert.equal(parseWorkspace({ ...settings, configuration: { ...cfg, salesPermissions: { ...cfg.salesPermissions, pack_send_enabled: "true" } } }, "acc-a", "settings"), null);
  let calls = 0;
  const backend = createHttpOnlyFansBackend({ baseUrl: "http://127.0.0.1:1", token: "synthetic-read-only",
    fetchImpl: async (url, init) => {
      calls += 1;
      assert.equal(String(url), "http://127.0.0.1:1/onlyfans/api/v1/accounts/acc-a/workspace/content");
      assert.equal(init?.method, "GET"); assert.equal(init?.credentials, "omit");
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer synthetic-read-only");
      assert.equal(new Headers(init?.headers).get("cookie"), null);
      return Response.json({ schemaVersion: "of-preview.v2", workspace: content });
    } });
  const result = await backend.getWorkspace!("acc-a", "content");
  assert(result.ok && result.data.section === "content");
  assert.equal(calls, 1);
  assert.equal((await backend.getWorkspace!("acc-a", "content", "bad==")).ok, false);
  assert.equal(calls, 1);
  console.log("PASS workspace: scoped strict models; missing/invalid catalogue terms; original-currency/status records; signed exact money; no unsafe integer rounding; bounded snapshots/cursors; read-only credential and no cookie forwarding");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
