// KNOWN RED (W3 ui-onlyfans-preview-2 P11/P16/P17, ContentSyncStatus.tsx):
//   P16 :45-52 one non-ok operation read never reschedules the poll: "Sync running" stays disabled with no not-confirmed label
//      and no further operation read.
//   P17 :34,:41 a 403 status read calls router.refresh() and the 10 s interval keeps doing it forever.
//   P11 :36 after one good read, a failing status read keeps the old snapshot with no staleness marker.
// P18 (POST /sync 503 dropping the retry) moved to HANDOFF lib-onlyfans-1: the root is content-sync-backend.ts:8,24 +
// content-sync-client.ts:30; ContentSyncStatus.tsx:61-63 dropping the retry on `refused` is correct once the lib maps it. No test here.
// Team's Claude owns the fixes. Offline: jsdom, fetch stubbed, setTimeout/setInterval mocked (helper mockTimers), synthetic ids.
import { advance, click, inNextApp, json, mockTimers, mount, nextRouter, stubFetch } from "../helpers/w3-preview2-dom";
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import ContentSyncStatus from "../../components/onlyfans-preview/ContentSyncStatus";
import { SYNC_SCHEMA } from "../../lib/onlyfans/content-sync";

const ACCOUNT = "acct-sync-1";
const at = "2026-10-17T08:00:00.000Z";
const coverage = { state: "current", checkedAt: at, detail: null };
const syncState = { enabled: true, status: "active", revision: 1, blockedReason: null, lastIncrementalAt: at, nextIncrementalAt: "2026-10-17T08:10:00.000Z",
  lastReconcileAt: null, nextReconcileAt: null, lastFullReconcileAt: null, coveredThroughMessageId: null, backlog: 0, initial: null,
  coverage: { media: coverage, paidMessages: coverage, paidPosts: coverage }, openConflicts: 0,
  uploads: { draft: 0, queued: 0, uploading: 0, verifying: 0, synced: 0, retrying: 0, connectionRequired: 0, needsReview: 0, outcomeUnconfirmed: 0 } };
const operation = (status: string) => ({ operationId: "op-1", kind: "sync_now", status, createdAt: null, updatedAt: null, completedAt: null, coverage: null,
  result: null, lastError: null, retryable: false, draftId: null, assetId: null });
const ok = (data: unknown) => json({ ok: true, data });
/** The live shape of a sync that cannot be read (content-sync-backend.ts:29-32 -> content-sync-route.ts:19). */
const unavailable503 = () => json({ schemaVersion: SYNC_SCHEMA, ok: false, outcome: "refused", code: "sync_unavailable", error: "Content sync is unavailable right now. Try again shortly." }, 503);
const plain500 = () => json({ ok: false }, 500);
const FAILURES = [["503 refused/sync_unavailable", unavailable503], ["500", plain500]] as const;

type Route = { status?: (n: number) => Response; post?: (n: number) => Response; op?: (n: number) => Response };
function backend(route: Route) {
  return stubFetch((url, method, n) => {
    if (url.includes("/conflicts")) return ok([]);
    if (method === "POST" && url.endsWith("/sync")) return (route.post ?? (() => ok(operation("running"))))(n);
    if (url.includes("/operations/")) return (route.op ?? (() => ok(operation("complete"))))(n);
    if (url.endsWith("/status")) return (route.status ?? (() => ok(syncState)))(n);
    return json({ ok: false }, 404);
  });
}
async function show(router = nextRouter()) {
  await mount(inNextApp(<ContentSyncStatus accountId={ACCOUNT} />, router, "/onlyfans/content"));
  return router;
}
const section = () => document.querySelector("[data-content-sync-status]")?.textContent ?? "";
const syncNow = () => document.querySelector<HTMLButtonElement>("[data-sync-now]");
const STALENESS = /could not (be )?refresh|not confirmed|unavailable|stale|out of date|as of/i;

beforeEach(() => { mockTimers(["setTimeout", "setInterval"]); });

// ---- P16 ----
test("control: Sync now → op running → op read complete re-enables Sync now", async () => {
  backend({});
  await show();
  await click(syncNow());
  assert.equal(syncNow()?.textContent, "Sync running");
  await advance(3000);
  assert.match(document.querySelector("[data-sync-operation]")?.textContent ?? "", /Check finished/);
  assert.equal(syncNow()?.disabled, false);
});

for (const [name, failure] of FAILURES) {
  test(`P16: operation read ${name}: the poll keeps reading or Sync now comes back, and a disabled Sync now says not confirmed`, async () => {
    const fetchStub = backend({ op: failure });
    await show();
    await click(syncNow());
    await advance(3000); await advance(3000); await advance(3000);
    const measured = { opReads: fetchStub.matching(/\/operations\//).length, syncNowDisabled: syncNow()?.disabled, label: syncNow()?.textContent, operation: document.querySelector("[data-sync-operation]")?.textContent, notice: document.querySelector("[data-sync-notice]")?.textContent ?? "" };
    const recovers = measured.opReads >= 2 || measured.syncNowDisabled === false;
    const honest = measured.syncNowDisabled === false || /not confirmed|could not|unavailable/i.test(`${measured.operation} ${measured.notice}`);
    assert.deepEqual({ recovers, honest }, { recovers: true, honest: true },
      `operation poll stopped after one failed read and the screen still claims a running check: ${JSON.stringify(measured)}`);
  });
}

// ---- P17 ----
test("control: a 403 status read shows the sign-in copy and refreshes the router once", async () => {
  backend({ status: () => json({ ok: false }, 403) });
  const router = await show();
  assert.match(section(), /Your session cannot read sync status/);
  assert.equal(router.refreshes, 1);
});

test("P17: denied is terminal: no further router.refresh() on later 10 s ticks", async () => {
  backend({ status: () => json({ ok: false }, 403) });
  const router = await show();
  await advance(10_000); await advance(10_000); await advance(10_000);
  assert.equal(router.refreshes, 1, `router.refresh() called ${router.refreshes} times over 30 s: a full server re-render every 10 s`);
});

// ---- P11 ----
test("control: a good status read shows the snapshot and no staleness wording", async () => {
  backend({});
  await show();
  assert.match(section(), /Up to date/);
  assert.doesNotMatch(section(), STALENESS);
});

for (const [name, failure] of FAILURES) {
  test(`P11: ok status, then status reads fail (${name}): either the snapshot is withdrawn or a staleness marker appears`, async () => {
    backend({ status: n => n === 0 ? ok(syncState) : failure() });
    await show();
    await advance(10_000); await advance(10_000);
    const measured = { upToDateShown: /Up to date/.test(section()), stalenessMarker: STALENESS.test(section()) };
    assert.equal(!measured.upToDateShown || measured.stalenessMarker, true,
      `status reads failed for 20 s and the screen still shows the old snapshot as current: ${JSON.stringify(measured)}`);
  });
}
