// Regression guard (G25): was KNOWN RED tests/known-red/W4-lib-onlyfans-preview-2-plus2-server-data-source.test.ts (origin/jaka/fix-sweep-20261112), fixed in this PR (lib/onlyfans-preview/server-data-source.ts). Promoted: F10 (accounts, conversations). Left red at the source (not in this file): F11, F12, F14. Original header below.
/**
 * KNOWN RED (W4 lib-onlyfans-preview-2-plus2 F10, F11, F12, F14; REVIEW inv 7 "No false success" + known failure mode
 * "unbounded polling or retries in client components"; types.ts:64-70,223-240 own contract). Driven through the real
 * createFetchOnlyFansTransport over a fake fetch at the wire (base https://dashboard.invalid/api/onlyfans) and the real
 * createServerOnlyFansDataSource.
 *   F10 lib/onlyfans-preview/server-data-source.ts:190,206,227-231 picks cast rows and oldestStale reads `value.stale`;
 *       one row without syncFreshness/freshness throws after transport "ok", so listAccounts/listConversations REJECT
 *       and the workspace (no .catch, OnlyFansWorkspace.tsx:343-347,433-435) sits on loading.
 *       Fixed looks like: a malformed row resolves to {status:"error"}.
 *   F11 :116-118 a 2xx JSON reply in the wrong envelope goes through notJson() -> unavailable "the dashboard session was
 *       not accepted"; schema drift tells the operator their session is broken (types.ts:227-232: wrong data = error).
 *       Fixed looks like: status "error" (not ready, not unavailable), and no mention of the session.
 *       The text/html control pins the other half: a non-JSON reply (login redirect, proxy page) stays "unavailable", so
 *       "notJson everywhere -> failed" is not a fix.
 *   F12 :92-97 reads pass no signal (writes do, :162). The assertion `init.signal instanceof AbortSignal` is a PROXY for
 *       "every read is bounded/abortable"; a fix that bounds reads some other way may need this check adjusted.
 *   F14 :234-246 toState picks ready vs stale from the `stale` flag only; `maxAgeSeconds` is never read, so a detail an
 *       hour old with a 60 s budget reads "ready". Fixed looks like: past maxAgeSeconds reads "stale".
 * Team's Claude owns the fix. Not wired into npm scripts or init.sh.
 * Run: nice -n 10 node --import tsx --test --test-name-pattern='^control' <this file>   (green)
 *      nice -n 10 node --import tsx --test --test-skip-pattern='^control' <this file>   (red, ERR_ASSERTION)
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createFetchOnlyFansTransport, createServerOnlyFansDataSource } from "../../lib/onlyfans-preview/server-data-source";
import type { RequestState } from "../../lib/onlyfans-preview/types";

const BASE = "https://dashboard.invalid/api/onlyfans";
const fresh = () => ({ asOf: new Date().toISOString(), maxAgeSeconds: 60, stale: false });
const accountRow = (accountId: string) => ({ accountId, syncFreshness: fresh() });
const summaryRow = (conversationId: string) => ({ conversationId, accountId: "of-a", freshness: fresh() });
const detailBody = (freshness: unknown) =>
  ({ conversation: { accountId: "of-a", conversationId: "42", messages: [], freshness } });

function wire(body: unknown) {
  const inits: Array<RequestInit | undefined> = [];
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    inits.push(init);
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  const source = createServerOnlyFansDataSource({ transport: createFetchOnlyFansTransport(fetchImpl, BASE) });
  return { inits, source };
}
async function settle<T>(read: Promise<RequestState<T>>): Promise<RequestState<T> | { rejected: string }> {
  try { return await read; } catch (error) { return { rejected: `${(error as Error)?.name}: ${(error as Error)?.message}` }; }
}

test("control: a valid accounts body reads ready", async () => {
  const state = await wire({ accounts: [accountRow("of-a")] }).source.listAccounts();
  assert.equal(state.status, "ready");
});

test("control: a valid conversation detail reads ready", async () => {
  const state = await wire(detailBody(fresh())).source.getConversation("of-a", "42");
  assert.equal(state.status, "ready");
});

test("control: a valid conversations page reads ready", async () => {
  const state = await wire({ page: { items: [summaryRow("1"), summaryRow("2")], nextCursor: "p2" } }).source.listConversations("of-a");
  assert.equal(state.status, "ready");
  if (state.status === "ready") assert.equal(state.data.nextCursor, "p2");
});

test("control: a 200 text/html reply (login page, proxy) reads unavailable, never data", async () => {
  const fetchImpl = (async () => new Response("<html>synthetic sign-in page</html>",
    { status: 200, headers: { "Content-Type": "text/html" } })) as typeof fetch;
  const source = createServerOnlyFansDataSource({ transport: createFetchOnlyFansTransport(fetchImpl, BASE) });
  assert.equal((await source.listAccounts()).status, "unavailable");
});

test("F10: an accounts row without syncFreshness resolves to an error state instead of rejecting", async () => {
  const state = await settle(wire({ accounts: [accountRow("of-a"), { accountId: "of-b" }] }).source.listAccounts());
  assert.ok(!("rejected" in state), `listAccounts rejected (${"rejected" in state ? state.rejected : ""}); callers have no .catch`);
  assert.equal(state.status, "error");
});

test("F10: a conversation row without freshness resolves to an error state instead of rejecting", async () => {
  const body = { page: { items: [summaryRow("1"), { conversationId: "2", accountId: "of-a" }], nextCursor: null } };
  const state = await settle(wire(body).source.listConversations("of-a"));
  assert.ok(!("rejected" in state), `listConversations rejected (${"rejected" in state ? state.rejected : ""})`);
  assert.equal(state.status, "error");
});
