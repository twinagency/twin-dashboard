import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import { classifyPreview, nextPreviewStep, groupReasons, operationRows, vaultSelectionSummary, syncStatusLine, factSource, MULTI_CATEGORY_NOTE } from "../lib/onlyfans/section8";

async function main() {
  (globalThis as unknown as { React: typeof React }).React = React;
  createRequire(import.meta.url).extensions[".css"] = module => { module.exports = {}; };
  const { default: FactFieldView } = await import("../components/onlyfans-preview/FactFieldView");
  const { default: MediaPreviewState } = await import("../components/onlyfans-preview/MediaPreviewState");

  // Media preview: classification and bounded retry.
  assert.equal(classifyPreview({ status: 202 }), "preparing");
  assert.equal(classifyPreview({ status: 403 }), "denied");
  assert.equal(classifyPreview({ status: 404 }), "unavailable");
  assert.equal(classifyPreview({ status: 410 }), "expired");
  assert.equal(classifyPreview({ status: 200, mimeOk: false }), "unsupported");
  assert.deepEqual(nextPreviewStep(1, { status: 202 }), { action: "retry", delayMs: 2000 });
  assert.deepEqual(nextPreviewStep(2, { status: 503 }), { action: "retry", delayMs: 5000 });
  assert.deepEqual(nextPreviewStep(3, { status: 202 }), { action: "stop", state: "preparing_timeout" });
  assert.deepEqual(nextPreviewStep(3, { status: null }), { action: "stop", state: "temporary" });
  assert.deepEqual(nextPreviewStep(1, { status: 404 }), { action: "stop", state: "unavailable" });
  const terminal = renderToStaticMarkup(<MediaPreviewState state="preparing_timeout" onRetry={() => {}} />);
  assert.match(terminal, /Still preparing/); assert.match(terminal, /Retry preview/);
  assert.doesNotMatch(renderToStaticMarkup(<MediaPreviewState state="denied" onRetry={() => {}} />), /Retry preview/);

  // Vault summary and sync.
  const line = vaultSelectionSummary({ folderName: "Lingerie", folderCount: 12, matching: 12, kind: "photo", query: "", needsReview: false });
  assert.equal(line, "Category: Lingerie (12) · Type: Photos · 12 matching files");
  assert.match(MULTI_CATEGORY_NOTE, /several categories/);
  const sync = { status: "pending", requestedAt: "2026-10-29T01:00:00Z", updatedAt: "2026-10-29T01:00:00Z", completedAt: null, itemsSeen: 0 };
  assert.match(syncStatusLine(sync, iso => iso), /^Sync: Queued since 2026-10-29T01:00:00Z$/);
  assert.match(syncStatusLine({ ...sync, status: "failed", updatedAt: "X" }, iso => iso), /Failed, last progress X/);

  // Settings facts.
  assert.equal(factSource({ value: "", overridden: false, sharedState: "current" }), "not_provided");
  const empty = renderToStaticMarkup(<FactFieldView label="Height" factKey="height" savedValue="" value="" overridden={false} sharedState="current" editing={false} readOnly={false} onEdit={() => {}}><input/></FactFieldView>);
  assert.match(empty, /Not provided/); assert.doesNotMatch(empty, /<input/);
  const inherited = renderToStaticMarkup(<FactFieldView label="Height" factKey="height" savedValue="170" value="170" overridden={false} sharedState="current" editing={false} readOnly={false} onEdit={() => {}}><input/></FactFieldView>);
  assert.match(inherited, /Inherited from Twin/);
  assert.match(renderToStaticMarkup(<FactFieldView label="Height" factKey="height" savedValue="170" value="170" overridden sharedState="current" editing={false} readOnly={false} onEdit={() => {}}><input/></FactFieldView>), /OnlyFans override/);

  // Operations grouped by reason.
  const groups = groupReasons(["history_not_current", "history_quarantined", "delivery_disabled", "runtime_disabled"]);
  assert.deepEqual(groups.map(g => [g.key, g.reasons.length]), [["history", 2], ["sending", 1], ["connection", 1]]);
  const rows = operationRows({ providerConnectionVerified: false, intake: { pending: 0, quarantined: 0 }, work: { blocked: 2 }, delivery: { queued: 0, unknown: 0, dispatching: 0 },
    reasons: ["commerce_evidence_conflict"], runtime: { registered: true, enabled: true, recoveryRequired: false, lastCompleteSyncAt: null }, policy: null });
  assert.deepEqual(rows.map(r => r.key), ["provider", "inbox", "archive", "payments", "memory", "vault", "sending"]);
  assert.equal(rows.find(r => r.key === "payments")!.status, "Needs review");
  assert.equal(rows.find(r => r.key === "vault")!.status, "Not reported");
  assert.ok(rows.every(r => !/reset|release|bypass/i.test(r.action)));
  console.log("PASS OnlyFans section 8: preview terminal states, vault summary and sync, settings facts, grouped operations.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
