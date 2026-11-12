/**
 * KNOWN RED (W4 lib-onlyfans-preview-2-plus2 F4, F5, F6, F8, F9; REVIEW inv 7 "Isolation" + selection.ts:7-19 own
 * contract "a slow response can never overwrite a newer one", "a selection the newest read no longer supports is
 * dropped"). Pure state transitions in lib/onlyfans-preview/selection.ts, driven in the order
 * components/onlyfans-preview/OnlyFansWorkspace.tsx uses them (:455-470 refresh, :608-623 Load older, :629-637 Load more).
 *   F4 :107-109,131,139-142 applyAccounts drops an out-of-scope account without moving scopeGeneration; entryOf recreates
 *      a fresh entry (seq 0), so a late detail read for the dropped account is applied and resurrects its cache.
 *      Fixed looks like: a read for an account that left scope is refused and leaves no cache behind. Run over the
 *      detail, list and Load older apply paths.
 *   F5 :261,469-480 a failed list refresh clears `detail: {}` while Load older is in flight; appendOlderConversation then
 *      falls through to applyConversation (:480) and stores the OLDER page as the whole thread.
 *      Fixed looks like: an older page with no ready thread to extend is not stored as the thread.
 *   F6 :279 `current.nextCursor ?? fresh.nextCursor` treats null (end reached) as unknown; a background refresh revives
 *      Load more and the next page appends rows already shown (:312, no dedupe) -> duplicate conversationId.
 *      Fixed looks like: following Load more after the refresh never shows a conversation twice (keep null, or dedupe).
 *   F8 :395-399 a background detail refresh merges loaded older history only when the cache holds > 100 messages, so
 *      one Load older is dropped by the next refresh. Driven with 5-message pages so no threshold tweak turns it green.
 *      Second half (F8 gap): above 100 it always merges and keeps the cached previousCursor even when the fresh head
 *      shares no message with the cache, so a silent hole sits between the cached and the fresh messages.
 *      Fixed looks like: loaded older history survives a refresh of an overlapping newest page, and a non-overlapping
 *      head never keeps the old cursor across the gap (replace, or take the fresh cursor).
 *   F9 :304,308 appendConversations clears loadingMore for a stale (superseded) page, dropping the flag the newer
 *      in-flight request owns (the 3 s refresh at OnlyFansWorkspace.tsx:452 is gated on it).
 *      Fixed looks like: a stale page leaves the newer request's loading flag alone.
 * Team's Claude owns the fix. Not wired into npm scripts or init.sh.
 * Run: nice -n 10 node --import tsx --test --test-name-pattern='^control' <this file>   (green)
 *      nice -n 10 node --import tsx --test --test-skip-pattern='^control' <this file>   (red, ERR_ASSERTION)
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  appendConversations, appendOlderConversation, applyAccounts, applyConversation, applyConversationRefresh,
  applyConversations, cachedConversationIds, currentConversationState, initialSelectionState, isLoadingMore,
  nextConversationCursor, requestConversation, requestConversations, requestMoreConversations, selectAccount,
  type PreviewSelectionState,
} from "../../lib/onlyfans-preview/selection";
import type { ConversationDetail, ConversationMessage, ConversationSummary, CursorPage, OfAccount, RequestState } from "../../lib/onlyfans-preview/types";

const A = "of-a", B = "of-b", C = "100";
const account = (accountId: string) => ({ accountId }) as unknown as OfAccount;
const summary = (conversationId: string, accountId = A) => ({ conversationId, accountId }) as unknown as ConversationSummary;
const page = (ids: string[], nextCursor: string | null): RequestState<CursorPage<ConversationSummary>> =>
  ({ status: "ready", data: { items: ids.map(id => summary(id)), nextCursor } });
const message = (n: number): ConversationMessage => ({ messageId: String(n), conversationId: C, direction: "inbound", origin: "fan",
  body: "synthetic", occurredAt: new Date(Date.UTC(2026, 0, 1) + n * 1000).toISOString(), delivery: "none", evidenceRef: null });
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => message(from + i));
const thread = (messages: ConversationMessage[], previousCursor: string | null, accountId = A): RequestState<ConversationDetail> =>
  ({ status: "ready", data: { accountId, conversationId: C, messages, previousCursor } as unknown as ConversationDetail });
const ids = (state: PreviewSelectionState, accountId = A) => {
  const list = state.byAccount[accountId]?.conversations;
  return list && (list.status === "ready" || list.status === "stale") ? list.data.items.map(item => item.conversationId) : [];
};
const messageIds = (state: PreviewSelectionState, accountId = A) => {
  const detail = state.byAccount[accountId]?.detail[C];
  return detail && (detail.status === "ready" || detail.status === "stale") ? detail.data.messages.map(m => m.messageId) : null;
};

/** Accounts [A] read, A selected, its list applied. */
function withList(listIds: string[], nextCursor: string | null): PreviewSelectionState {
  let state = applyAccounts(initialSelectionState(), 0, { status: "ready", data: [account(A)] });
  state = selectAccount(state, A);
  const read = requestConversations(state, A);
  return applyConversations(read.state, A, read.generation, read.seq, page(listIds, nextCursor)).state;
}
/** withList plus the head of thread C (messages 51..100, older history behind "older-1"). */
function withThread(): PreviewSelectionState {
  const read = requestConversation(withList([C], null), A, C);
  return applyConversation(read.state, A, C, read.generation, read.seq, thread(range(51, 100), "older-1")).state;
}
/** withThread plus one Load older (messages 1..50). */
function withOlder(): PreviewSelectionState {
  const older = requestConversation(withThread(), A, C, { background: true });
  const result = appendOlderConversation(older.state, A, C, older.generation, older.seq, thread(range(1, 50), "older-2"));
  assert.equal(result.applied, true);
  return result.state;
}
/** Thread C as [older + head]: head `head` with cursor "older-1", then one Load older `older` with cursor "older-2". */
function withPages(head: [number, number], older: [number, number]): PreviewSelectionState {
  const read = requestConversation(withList([C], null), A, C);
  const opened = applyConversation(read.state, A, C, read.generation, read.seq, thread(range(...head), "older-1")).state;
  const more = requestConversation(opened, A, C, { background: true });
  const result = appendOlderConversation(more.state, A, C, more.generation, more.seq, thread(range(...older), "older-2"));
  assert.equal(result.applied, true);
  return result.state;
}
/** A background refresh of thread C with `messages` as the fresh head behind `cursor`. */
function refreshThread(state: PreviewSelectionState, messages: ConversationMessage[], cursor: string) {
  const refresh = requestConversation(state, A, C, { background: true });
  return applyConversation(refresh.state, A, C, refresh.generation, refresh.seq, thread(messages, cursor)).state;
}
const cursorOf = (state: PreviewSelectionState) => {
  const detail = state.byAccount[A]?.detail[C];
  return detail && (detail.status === "ready" || detail.status === "stale") ? detail.data.previousCursor : undefined;
};

test("control: list -> apply -> background refresh keeps the rows already shown", () => {
  const refresh = requestConversations(withList(["c1", "c2"], "p2"), A, { background: true });
  const result = applyConversationRefresh(refresh.state, A, refresh.generation, refresh.seq, page(["c3", "c1"], "p2b"));
  assert.equal(result.applied, true);
  assert.deepEqual([...ids(result.state)].sort(), ["c1", "c2", "c3"]);
});

test("control: a detail read applies and is the current conversation", () => {
  const state = withThread();
  const current = currentConversationState(state);
  assert.ok(current && current.status === "ready");
  assert.equal(current.data.messages.length, 50);
});

test("control: Load older onto a ready thread merges both pages and takes the older cursor", () => {
  const state = withOlder();
  assert.equal(messageIds(state)?.length, 100);
  const detail = state.byAccount[A].detail[C];
  assert.ok(detail.status === "ready");
  assert.equal(detail.data.previousCursor, "older-2");
});

test("control: a list read for an account still in scope applies after another account is dropped", () => {
  let state = applyAccounts(initialSelectionState(), 0, { status: "ready", data: [account(A), account(B)] });
  state = selectAccount(state, B);
  const listB = requestConversations(state, B);
  const dropped = applyAccounts(requestConversation(listB.state, A, C).state, listB.generation, { status: "ready", data: [account(B)] });
  const result = applyConversations(dropped, B, listB.generation, listB.seq,
    { status: "ready", data: { items: [summary("b1", B)], nextCursor: null } });
  assert.equal(result.applied, true);
  assert.deepEqual(ids(result.state, B), ["b1"]);
});

test("control: an overlapping refresh keeps a live cursor (Load more stays available)", () => {
  const refresh = requestConversations(withList(["c1", "c2"], "p2"), A, { background: true });
  const state = applyConversationRefresh(refresh.state, A, refresh.generation, refresh.seq, page(["c3", "c1"], "p2b")).state;
  assert.notEqual(nextConversationCursor(state, A), null);
});

test("control: Load more appends the next page onto a ready list", () => {
  const more = requestMoreConversations(withList(["c1"], "p2"), A);
  const result = appendConversations(more.state, A, more.generation, more.seq, page(["c2"], null));
  assert.equal(result.applied, true);
  assert.deepEqual(ids(result.state), ["c1", "c2"]);
  assert.equal(nextConversationCursor(result.state, A), null);
  assert.equal(isLoadingMore(result.state, A), false);
});

test("control: a small cache refreshed by a head sharing no message is replaced, not bridged with the old cursor", () => {
  const state = refreshThread(withPages([6, 10], [1, 5]), range(20, 24), "older-gap");
  assert.notEqual(cursorOf(state), "older-2");
});

test("F4: a late detail read for an account that left scope is refused and leaves no cache", () => {
  const read = requestConversation(withList([C], null), A, C);
  const dropped = applyAccounts(read.state, read.generation, { status: "ready", data: [account(B)] });
  assert.equal(dropped.byAccount[A], undefined, "precondition: the out-of-scope account's entry is gone");
  const late = applyConversation(dropped, A, C, read.generation, read.seq, thread(range(51, 100), "older-1"));
  assert.equal(late.applied, false, "a read issued for a dropped account must not apply");
  assert.deepEqual(cachedConversationIds(late.state, A), [], "the dropped account's thread cache must not come back");
});

test("F4: a late list read for an account that left scope is refused and leaves no entry", () => {
  let state = applyAccounts(initialSelectionState(), 0, { status: "ready", data: [account(A), account(B)] });
  state = selectAccount(state, A);
  const read = requestConversations(state, A);
  const dropped = applyAccounts(read.state, read.generation, { status: "ready", data: [account(B)] });
  assert.equal(dropped.byAccount[A], undefined, "precondition: the out-of-scope account's entry is gone");
  const late = applyConversations(dropped, A, read.generation, read.seq, page(["c1"], null));
  assert.equal(late.applied, false, "a list read issued for a dropped account must not apply");
  assert.equal(late.state.byAccount[A], undefined, "the dropped account's entry must not come back");
});

test("F4: a late Load older page for an account that left scope is refused and leaves no cache", () => {
  const older = requestConversation(withThread(), A, C, { background: true });
  const dropped = applyAccounts(older.state, older.generation, { status: "ready", data: [account(B)] });
  assert.equal(dropped.byAccount[A], undefined, "precondition: the out-of-scope account's entry is gone");
  const late = appendOlderConversation(dropped, A, C, older.generation, older.seq, thread(range(1, 50), "older-2"));
  assert.equal(late.applied, false, "an older page issued for a dropped account must not apply");
  assert.deepEqual(cachedConversationIds(late.state, A), [], "the dropped account's thread cache must not come back");
});

test("F5: an older page landing after a failed list cleared the thread is not stored as the whole thread", () => {
  const older = requestConversation(withThread(), A, C, { background: true });
  const list = requestConversations(older.state, A, { background: true });
  const failed = applyConversationRefresh(list.state, A, list.generation, list.seq, { status: "error", message: "synthetic failure" }).state;
  assert.equal(messageIds(failed), null, "precondition: the failed list read cleared the thread cache");
  const late = appendOlderConversation(failed, A, C, older.generation, older.seq, thread(range(1, 50), "older-2"));
  const stored = messageIds(late.state);
  assert.ok(stored === null || stored.includes("100"),
    `the older page alone (messages 1..50) must not become thread ${C}; stored ${stored?.length} messages without the newest`);
});

test("F6: after the list reached its end, a background refresh plus Load more never shows a conversation twice", () => {
  const refresh = requestConversations(withList(["c1", "c2"], null), A, { background: true });
  let state = applyConversationRefresh(refresh.state, A, refresh.generation, refresh.seq, page(["c3", "c1"], "p2")).state;
  const cursor = nextConversationCursor(state, A);
  if (cursor !== null) {
    // The backend's page 2 for the fresh ordering [c3, c1] | [c2].
    const more = requestMoreConversations(state, A);
    state = appendConversations(more.state, A, more.generation, more.seq, page(["c2"], null)).state;
  }
  const shown = ids(state);
  assert.deepEqual(shown, [...new Set(shown)], `cursor ${JSON.stringify(cursor)} revived Load more; rows ${shown.join(",")}`);
});

test("F8: a background refresh of the newest page keeps the older history already loaded", () => {
  // Head 6..10, one Load older 1..5, then the newest 5 with one new message (7..11): overlap 7..10.
  const state = refreshThread(withPages([6, 10], [1, 5]), range(7, 11), "older-1b");
  const stored = new Set(messageIds(state) ?? []);
  const lost = range(1, 6).filter(m => !stored.has(m.messageId)).length;
  assert.equal(lost, 0, `${lost} of the 6 messages older than the fresh head were dropped by the refresh`);
});

test("F8 gap: a fresh head sharing no message with a large cache does not keep the old cursor across the gap", () => {
  // Cache 1..120 (> 100) behind "older-2"; the fresh head 200..204 shares nothing with it.
  const state = refreshThread(withPages([61, 120], [1, 60]), range(200, 204), "older-gap");
  assert.notEqual(cursorOf(state), "older-2", "messages 121..199 are missing and Load older would skip past them");
});

test("control: a failed CURRENT Load more clears the loading flag", () => {
  const more = requestMoreConversations(withList(["c1"], "p2"), A);
  const failed = appendConversations(more.state, A, more.generation, more.seq, { status: "error", message: "synthetic failure" });
  assert.equal(failed.applied, false);
  assert.equal(isLoadingMore(failed.state, A), false, "the only Load more in flight failed; the button must come back");
  assert.deepEqual(ids(failed.state), ["c1"], "a failed page keeps the rows already shown");
});

test("F9: a superseded Load more page does not clear the newer request's loading flag", () => {
  const first = requestMoreConversations(withList(["c1"], "p2"), A);
  const second = requestMoreConversations(first.state, A);
  const stale = appendConversations(second.state, A, first.generation, first.seq, page(["c2"], "p3"));
  assert.equal(stale.applied, false, "precondition: the first page is stale");
  assert.equal(isLoadingMore(stale.state, A), true, "the second Load more is still in flight");
});

test("F9: a superseded Load more that failed does not clear the newer request's loading flag", () => {
  const first = requestMoreConversations(withList(["c1"], "p2"), A);
  const second = requestMoreConversations(first.state, A);
  const stale = appendConversations(second.state, A, first.generation, first.seq, { status: "error", message: "synthetic failure" });
  assert.equal(stale.applied, false, "precondition: a failed page adds nothing");
  assert.equal(isLoadingMore(stale.state, A), true, "the second Load more is still in flight");
});
