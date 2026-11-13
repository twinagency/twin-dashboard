/** ContentSyncConflict fixtures (W3 ui-onlyfans-preview-1): two open conflicts on one account, answered through the recording fetch stub. */
import assert from "node:assert/strict";
import React from "react";
import type { SyncConflict } from "../../lib/onlyfans/content-sync";
import { ACCOUNT, click, json, mount, posts, q, routeFailure, serve, submit, type Answer } from "./w3-preview1-dom";

export const FIRST = "conflict-1", SECOND = "conflict-2";
const terms = (priceCents: number) => ({ priceCents, mediaCount: 2, previewCount: 0, sourceAt: "2026-11-01T00:00:00.000Z" });
const conflict = (conflictId: string, itemId: string, revision: number): SyncConflict => ({ conflictId, itemId, revision, status: "open", createdAt: "2026-11-01T00:00:00.000Z",
  current: terms(1200), source: { ...terms(1500), lockedText: false }, itemFingerprint: (itemId + "f".repeat(64)).slice(0, 64), resolution: null, resolvedAt: null, sourceIssue: null });
export const CONFLICTS = [conflict(FIRST, "101", 3), conflict(SECOND, "102", 5)];
export const resolved: Answer = () => json({ ok: true, data: { conflict: { ...CONFLICTS[0], status: "resolved" }, itemId: "101" } });
export const refusedWith = (status: number, code: string): Answer => () => routeFailure(status, "refused", { code });

/** Mounts ContentSyncConflict; the open list always reads CONFLICTS; the n-th resolve POST is answered by `resolve(n)`. */
export async function conflicts(resolve: (n: number) => Response | Promise<Response>) {
  let n = 0;
  serve(call => call.method === "GET" ? json({ ok: true, data: CONFLICTS }) : resolve(n++));
  const { default: ContentSyncConflict } = await import("../../components/onlyfans-preview/ContentSyncConflict");
  await mount(<ContentSyncConflict accountId={ACCOUNT} />, "/onlyfans/content");
  assert.equal(document.querySelectorAll("[data-sync-conflict]").length, 2, "both conflicts rendered from the fixture");
}
const form = (itemId: string) => q(`[data-sync-conflict="${itemId}"]`);
export const applyButton = (itemId: string) => form(itemId)?.querySelector<HTMLButtonElement>("[data-conflict-apply]") ?? null;
export const retryButton = (itemId: string) => form(itemId)?.querySelector<HTMLButtonElement>("[data-conflict-retry]") ?? null;
export const choose = (itemId: string, resolution = "keep_crm") => click(form(itemId)?.querySelector(`[data-conflict-choice="${resolution}"]`));
export const applyDecision = (itemId: string) => submit(form(itemId));
export const resolvePosts = () => posts().filter(call => call.url.endsWith("/resolve"));
export const notice = () => q("[data-conflict-notice]")?.textContent ?? "";
