// KNOWN RED (W3 lane 2 ui-onlyfans-launch, findings L13 L14 L15; REVIEW.md inv 7: a cancel (brake) is never harder than a go, and a
// write is reported only as what the backend proved).
//   L13 automation/EngagementPanel.tsx:370-374,383,401-408  "Newest actions" renders only in the ok branch: an older page whose cursor read
//       fails (400 expired cursor) leaves only a Retry of the same cursor, so every "Request cancellation" is unreachable until remount.
//   L14 automation/EngagementPanel.tsx:201,210,291  one `busy` flag for all rows: a "Refresh durable state" in flight on row A disables
//       "Request cancellation" on every other row (up to the 20 s POST timeout).
//   L15 automation/EngagementPanel.tsx:302-304  any 200 with a parseable row reads "Cancellation request recorded", even when the
//       returned row still says cancelRequested:false / status scheduled.
// Fixed looks like: a way back to the newest page whatever the page read says; per-row in-flight state; the cancel notice keyed on
// `cancelRequested` (and the action id). Copy not pinned: L15 accepts any notice that does not pair "cancel" with
// recorded/requested/sent/accepted unless it is negated (not / unconfirmed / unchanged); L13 matches "newest".
// Mounts the real EngagementPanel. Offline: jsdom, stub fetch, synthetic ids. Not wired into npm scripts.
//   nice -n 10 node --import tsx --test --test-name-pattern='^control' tests/known-red/W3-ui-onlyfans-launch-engagement-cancel.test.tsx   (green)
//   nice -n 10 node --import tsx --test --test-skip-pattern='^control' tests/known-red/W3-ui-onlyfans-launch-engagement-cancel.test.tsx   (red, ERR_ASSERTION)
import { button, click, json, mount, never, stubFetch, unmount } from "../helpers/w3-launch-dom";
import { ACTION_A, ACTION_B, action, actionReply, followUps, settings } from "../helpers/w3-launch-fixtures";
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

const AUTO = "/api/onlyfans-launch/automation/accounts/of-a";
type Answers = { page?: (url: string) => Response; post?: (body: { actionId: string; action: string }) => Response | Promise<Response> };
async function open(a: Answers) {
  const stub = stubFetch((url, method, _n, raw) => {
    if (url === `${AUTO}/settings` && method === "GET") return json(settings(3));
    if (url.startsWith(`${AUTO}/follow-ups`) && method === "GET") return a.page ? a.page(url) : json(followUps([action(ACTION_A), action(ACTION_B)]));
    if (url === `${AUTO}/follow-ups` && method === "POST" && a.post) return a.post(JSON.parse(String(raw)));
    throw new TypeError(`unexpected fetch ${method} ${url}`);
  });
  const { default: EngagementPanel } = await import("../../components/onlyfans-launch/automation/EngagementPanel");
  await mount(React.createElement(EngagementPanel, { accountId: "of-a", manage: true }));
  return stub;
}
/** Each helper asserts its container exists (boolean) before looking inside it, so a missing card or row cannot pass. */
function card() {
  const c = document.querySelector('[data-b-card="follow-ups"]');
  assert.equal(Boolean(c), true, "follow-ups card is rendered");
  return c!;
}
function row(id: string) {
  const r = [...card().querySelectorAll("[data-b-followup]")].find(li => (li.textContent ?? "").includes(id));
  assert.equal(Boolean(r), true, `row ${id} is rendered`);
  return r!;
}
/** Booleans only: a failing assertion that inspects a jsdom node can exhaust the heap. */
const cancelOf = (id: string) => { const b = button(/^Request cancellation$/, row(id)); return { present: Boolean(b), enabled: Boolean(b && !b.disabled) }; };
const newest = () => { const b = button(/newest/i, card()); return { present: Boolean(b), enabled: Boolean(b && !b.disabled) }; };
const notice = () => [...card().querySelectorAll("[role=status]")].map(n => n.textContent ?? "").join(" ");
/** True when the notice says a cancellation went through. Key words only, so a reword cannot slip past; a negated notice ("not recorded",
 * "unconfirmed", "unchanged") is not a claim. */
const claimsCancelled = (text: string) => /cancel/i.test(text) && /recorded|requested|sent|accepted/i.test(text) && !/\bnot\b|unconfirmed|unchanged/i.test(text);

const pages = (older: () => Response) => (url: string) => url.includes("?cursor=") ? older() : json(followUps([action(ACTION_A)], "cursor-2"));

test("control: on the newest page the 'Newest actions' button exists and is disabled, older page reachable", async () => {
  const stub = await open({ page: pages(() => json(followUps([action(ACTION_B)]))) });
  assert.deepEqual(newest(), { present: true, enabled: false });
  await click(button(/^Older actions$/));
  assert.equal(stub.calls.some(c => c.url.endsWith("?cursor=cursor-2")), true, "older page requested by cursor");
  assert.deepEqual(newest(), { present: true, enabled: true }, "older page ok: way back to newest");
  await unmount();
});

test("L13: older page read answers 400, an enabled way back to the newest page exists", async () => {
  const stub = await open({ page: pages(() => json({ error: "That page cursor is invalid." }, 400)) });
  await click(button(/^Older actions$/));
  assert.equal(stub.calls.some(c => c.url.endsWith("?cursor=cursor-2")), true, "older page requested by cursor");
  assert.deepEqual(newest(), { present: true, enabled: true }, "failed cursor read hides the way back (EngagementPanel.tsx:375-382,401-419)");
  await unmount();
});

test("control: nothing in flight, both scheduled rows offer an enabled 'Request cancellation'", async () => {
  await open({});
  assert.deepEqual([cancelOf(ACTION_A), cancelOf(ACTION_B)], [{ present: true, enabled: true }, { present: true, enabled: true }]);
  await unmount();
});

test("L14: a refresh in flight on row A leaves row B's 'Request cancellation' enabled", async () => {
  const stub = await open({ post: body => body.action === "refresh" ? never() : json(actionReply(action(body.actionId, { cancelRequested: true }))) });
  await click(button(/^Refresh durable state$/, row(ACTION_A)));
  assert.equal(stub.posts(/\/follow-ups$/).length, 1, "refresh POST for A is in flight");
  assert.deepEqual(cancelOf(ACTION_B), { present: true, enabled: true }, "one row's refresh disables every row's cancel (EngagementPanel.tsx:201,210,291)");
  await unmount();
});

const cancelA = async (reply: Record<string, unknown>) => {
  const stub = await open({ post: body => json(actionReply(action(body.actionId, reply))) });
  await click(button(/^Request cancellation$/, row(ACTION_A)));
  assert.equal(stub.posts(/\/follow-ups$/).length, 1, "one cancel POST");
  return notice();
};

test("control: cancel POST answers the row with cancelRequested:true, notice claims the cancellation", async () => {
  const text = await cancelA({ cancelRequested: true });
  assert.equal(claimsCancelled(text), true, `notice: ${text}`);
  await unmount();
});

test("L15: cancel POST answers 200 with the row unchanged (scheduled, cancelRequested:false), notice does not claim a cancellation", async () => {
  const text = await cancelA({ cancelRequested: false, status: "scheduled" });
  assert.equal(claimsCancelled(text), false, `unchanged row reported as a recorded cancellation (EngagementPanel.tsx:302-304): ${text}`);
  await unmount();
});
