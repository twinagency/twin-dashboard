// Rule (W1 lane 7a finding 7, REVIEW inv 7 "Stale work"): when the first page changes (the parent refreshes it every 15 s),
// later pages are dropped, including one still in flight; a page from an invalidated cursor never comes back.
// Offline: 7a-harness (jsdom), synthetic engine views, a deferred page loader. No network.
import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import { all, click, engineView, q, settle, showEngine } from "./7a-harness";

const id = (n: number) => `7a000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const row = (n: number, revision: number) => ({ requestId: id(n), sourceMessageId: String(n), status: "open", owner: "engine", nextStep: "none", actionOutcome: null, actionType: "reply", revision });
const page = (requests: unknown[], nextCursor: string | null) => engineView(requests, { environment: "simulation", mode: "active", nextCursor });
const shown = () => all("[data-engine-request]").map(item => item.getAttribute("data-engine-request"));

/** Page 1 on screen, Load more clicked, page 2 held in flight. `show` re-renders the same tree (a parent refresh). */
async function setup() {
  let resolvePage!: (value: unknown) => void;
  const cursors: string[] = [];
  const onLoadMore = (cursor: string) => { cursors.push(cursor); return new Promise<unknown>(resolve => { resolvePage = resolve; }); };
  const show = (value: unknown, keep = true) => showEngine(value, { onLoadMore }, keep);
  await show(page([row(1, 1)], "cursor-one"), false);
  await click(q("[data-engine-load-more]"));
  assert.deepEqual(cursors, ["cursor-one"], "fixture: page 2 was requested");
  const resolve = async (value: unknown) => { await act(async () => { resolvePage(value); }); await settle(); };
  return { show, resolve };
}

test("finding 7: control: an undisturbed Load more appends the page 2 rows", async () => {
  const { resolve } = await setup();
  await resolve(page([row(2, 1)], null));
  assert.deepEqual(shown(), [id(1), id(2)]);
});

test("finding 7: a page requested before the first page changed is dropped, not shown", async () => {
  const { show, resolve } = await setup();
  // A refresh arrives while page 2 is in flight: request 1 has a new revision and the cursor moved.
  await show(page([row(1, 2)], "cursor-two"));
  assert.deepEqual(shown(), [id(1)], "fixture: the refresh reset the loaded pages");
  await resolve(page([row(2, 1)], null));
  assert.deepEqual(shown(), [id(1)], "a page from the invalidated cursor must not come back (stale rows)");
});

test("a page requested before a first-page outcome changed is dropped, even with the same revision and cursor", async () => {
  const { show, resolve } = await setup();
  await show(page([{ ...row(1, 1), actionOutcome: "unknown" }], "cursor-one"));
  await resolve(page([row(2, 1)], null));
  assert.deepEqual(shown(), [id(1)], "the first page changed, so the in-flight page is stale");
});
