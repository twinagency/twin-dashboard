// G04c1 R1 O2: SharedMediaPanel offers "Check upload status" from the receipt's `held` flag (the stored row, which GET emits before
// its provider overlay), not from the displayed status. A held row whose GET projection reads complete still offers Check; a history
// row (retryable, or adopted, or active) offers none; a refresh answer for a different receipt id (the source's newer live receipt)
// is shown, not thrown.
// Real SharedMediaPanel in jsdom (7a-harness), `fetch` stubbed with the route's response shapes. Offline, synthetic ids.
import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import React from "react";
import { all, click, render, settle, text } from "./7a-harness";
import SharedMediaPanel from "../../components/SharedMediaPanel";

const C = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", S = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const row = (id: string, status: string, held: boolean, sourceId = S) => ({ id, sourceId, kind: "photo", status, held, mediaId: status === "complete" ? "777" : null,
  processing: false, receivedBytes: 1024, sizeBytes: 1024, error: held ? "This transfer needs review. Refresh its status before retrying." : null });
const original = globalThis.fetch;
afterEach(() => { globalThis.fetch = original; });
const checks = () => all("button").filter(b => b.textContent === "Check upload status");

async function mount(transfers: unknown[], refresh?: unknown) {
  const posts: unknown[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("/api/onlyfans/accounts")) return Response.json({ accounts: [{ accountId: "of-a", binding: { creatorId: C, handle: "a" }, health: "connected" }] });
    if (init?.method === "POST") { posts.push(JSON.parse(String(init.body))); return Response.json({ ok: true, transfer: refresh }); }
    return Response.json({ ok: true, creatorId: C, accountId: "of-a", enabled: true, statusAvailable: true, transfers });
  }) as typeof fetch;
  await render(React.createElement(SharedMediaPanel, { creatorId: C, selected: [] }));
  await click(all("button").find(b => b.textContent?.startsWith("Use content across channels")));
  await settle();
  return posts;
}

test("control: a held failed row offers Check upload status", async () => {
  await mount([row("receipt-1", "failed", true)]);
  assert.equal(checks().length, 1);
});

test("a held row whose GET projection reads complete still offers Check", async () => {
  await mount([row("receipt-1", "complete", true)]);
  assert.match(text(), /Available in OnlyFans vault/);
  assert.equal(checks().length, 1, "held is the stored row, not the overlaid status");
});

test("history, adopted and active rows offer no Check", async () => {
  await mount([row("receipt-1", "expired", false), row("receipt-2", "complete", false), row("receipt-3", "pending", false)]);
  assert.equal(checks().length, 0);
});

test("a refresh answer for a different receipt id is shown, not thrown", async () => {
  const posts = await mount([row("receipt-1", "failed", true)], row("receipt-2", "complete", false));
  await click(checks()[0]);
  assert.deepEqual(posts, [{ kind: "photo", sourceId: S, action: "refresh" }]);
  assert.match(text(), /Upload status checked: Available in OnlyFans vault\./);
  assert.doesNotMatch(text(), /could not be verified/);
});

test("a refresh answer for a different file is refused", async () => {
  await mount([row("receipt-1", "failed", true)], row("receipt-2", "complete", false, "cccccccc-cccc-4ccc-8ccc-cccccccccccc"));
  await click(checks()[0]);
  assert.match(text(), /Upload status could not be verified\./);
});
