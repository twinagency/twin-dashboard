/**
 * Offer import fixtures for the W3 ui-onlyfans-preview-3 tests: route envelopes in the exact shape `dispatchImport`
 * (lib/onlyfans/offer-import-route.ts) returns, values that pass the lib/onlyfans/offer-import.ts parsers, and a fake
 * same-origin backend for OfferImportPanel. ContentSyncStatus (embedded in the panel) gets a 404 for its status read and
 * shows "Sync status is unavailable", which it tolerates. Nothing here is cookie or token shaped.
 */
import { calls, button, click, mount, json, q, serve, type, type Call } from "./w3-preview3-dom";
import React from "react";
import { IMPORT_SCHEMA, type CandidateDetail, type CandidateSummary, type ImportJob } from "../../lib/onlyfans/offer-import";

export const ACCOUNT = "of-a";
export const BASE = `/api/onlyfans-content/accounts/${ACCOUNT}/imports`;
export const JOB = "11111111-1111-4111-8111-111111111111";
export const REFRESH_JOB = "22222222-2222-4222-8222-222222222222";
export const CANDIDATE = "c".repeat(64);
export const OBSERVATION = "33333333-3333-4333-8333-333333333333";

export const job = (status: string, mode: "inventory" | "refresh" = "inventory", jobId = mode === "inventory" ? JOB : REFRESH_JOB, revision = 1): ImportJob => ({
  jobId, commandKey: (mode === "inventory" ? "a" : "b").repeat(64), mode, status, revision, rowsScanned: 12, pagesRead: 1, pageBudget: 10,
  targetsTotal: mode === "refresh" ? 1 : 0, targetsDone: 0, lastError: null, requestedAt: "2026-11-12T09:00:00Z", updatedAt: "2026-11-12T09:00:00Z",
  completedAt: ["pending", "running"].includes(status) ? null : "2026-11-12T09:01:00Z", coverage: mode === "inventory" ? "imported_history" : "selected_sources" });
export const summary: CandidateSummary = { candidateId: CANDIDATE, revision: 1, attachmentCount: 1, sourceCount: 1, observedPrices: [1000], variantCount: 1,
  verifiedSources: 1, itemId: null, status: "ready_for_review" };
export const detail: CandidateDetail = { ...summary,
  variants: [{ key: "v1", priceCents: 1000, mediaIds: ["501"], count: 1, latest: null }],
  samples: [{ fanId: "77", messageId: 9001, priceCents: 1000, sentAt: "2026-11-01T10:00:00Z", sourceKind: "message" }],
  observations: [{ observationId: OBSERVATION, fingerprint: "f".repeat(64), sourceKind: "message", sourceId: "9001", fanId: "77", sourceContext: "direct",
    sourceAt: "2026-11-01T10:00:00Z", observedAt: "2026-11-01T10:05:00Z", mediaIds: ["501"], previewIds: [], lockedText: false, priceCents: 1000, currency: "USD",
    attachments: [{ mediaId: "501", kind: "photo", freePreview: false }], reasons: [], ready: true }],
  assetReasons: [], existingItem: null };

/** A confirmed route reply. */
export const ok = (data: unknown) => json({ schemaVersion: IMPORT_SCHEMA, ok: true, accountId: ACCOUNT, data });
/** The route's refusal envelope (`refuse()` in offer-import-route.ts). */
export const refused = (status: number, error = "Your team access is read-only.") => json({ schemaVersion: IMPORT_SCHEMA, ok: false, outcome: "refused", error }, status);
/** The route's lost-upstream reply: backend `post()` returns status 502 + outcome "unconfirmed", the route spreads it. */
export const unconfirmed502 = () => json({ schemaVersion: IMPORT_SCHEMA, ok: false, status: 502, outcome: "unconfirmed",
  error: "The outcome is not confirmed. Retry the same request or check the result." }, 502);
/** A proxy/gateway page in front of the app: not JSON, not an import envelope. */
export const html = (status: number) => new Response("<html><body><h1>Gateway Timeout</h1></body></html>", { status, headers: { "Content-Type": "text/html" } });

type Answer = (call: Call, n: number) => Response | Promise<Response> | undefined;
export type Routes = Partial<Record<"status" | "job" | "candidates" | "candidate" | "start" | "cancel" | "drafts", Answer>>;
/** Routes each request to its kind; `n` counts earlier requests of the same kind (0 = first). */
export function importBackend(routes: Routes) {
  const seen: Record<string, number> = {};
  serve(call => {
    const path = call.url.split("?")[0];
    const kind = path === `/api/onlyfans-content/accounts/${ACCOUNT}/sync/status` ? "status"
      : !path.startsWith(BASE) ? null
      : call.method === "POST" ? (path === `${BASE}/jobs` ? "start" : path === `${BASE}/drafts` ? "drafts" : /\/jobs\/[^/]+\/cancel$/.test(path) ? "cancel" : null)
      : /\/jobs\/[^/]+\/candidates\/[^/]+$/.test(path) ? "candidate" : /\/jobs\/[^/]+\/candidates$/.test(path) ? "candidates" : /\/jobs\/[^/]+$/.test(path) ? "job" : null;
    if (!kind) return undefined;
    const n = seen[kind] ?? 0; seen[kind] = n + 1;
    if (kind === "status" && !routes.status) return new Response("not found", { status: 404 });
    return routes[kind as keyof Routes]?.(call, n);
  });
}

export const startPosts = () => calls.filter(c => c.method === "POST" && c.url === `${BASE}/jobs`);
export const jobReads = (jobId = JOB) => calls.filter(c => c.method === "GET" && c.url === `${BASE}/jobs/${jobId}`);
/** The panel's own status line (ContentSyncStatus has its own role=status lines inside its section). */
export const panelNotice = () => q('[data-offer-import] > p[role="status"]')?.textContent ?? "";

export async function mountPanel() {
  const { default: OfferImportPanel } = await import("../../components/onlyfans-preview/OfferImportPanel");
  await mount(<OfferImportPanel accountId={ACCOUNT} readOnly={false} />, "/onlyfans/content");
}
export const scanButton = () => button(/^Scan imported history$/);
export const retryButton = () => button(/^Retry the same request$/, q("[data-offer-import]") ?? document);

/** Scan answered with a finished job, its one offer group listed, and that group opened (refresh enabled: one message source). */
export async function scannedAndOpened() {
  await click(scanButton());
  await click(q('ul[aria-label="Offer groups"] button'));
  if (!q("[data-import-review]")) throw new Error("fixture: the offer review did not open");
}
/** Route answers for a scan that finishes at once with one group, and that group's detail. */
export const finishedScan: Routes = {
  start: (call, n) => n === 0 ? ok(job("complete")) : undefined,
  candidates: () => ok({ job: job("complete"), items: [summary], nextCursor: null }),
  candidate: () => ok(detail),
};

/** Opens the group, chooses its one observation, confirms both boxes, writes label + description and adds it to the queue. */
export async function queueOneDraft() {
  await scannedAndOpened();
  await click(q('input[type="radio"][name="source"]'));
  await type(q("[data-import-review] label input:not([type])"), "Beach set");
  await type(q("[data-import-review] textarea"), "Three photos on a beach.");
  for (const box of document.querySelectorAll('[data-import-review] input[type="checkbox"]')) await click(box);
  await click(button(/^Add to drafts$/));
  if (!q('section[aria-label="Drafts to create"]')) throw new Error("fixture: the draft was not queued");
}
