// Rule ("our cost and margin never leave the building", CLAUDE.md), finding N1-follow-c follow-up memory-cost-agency + rwl round 1:
// /onlyfans/launch/memory admits agency sessions, BMemoryPanel renders RecentHistoryStatus, and that printed
// recentHistory.memoryModelAccounting (our model spend, USD) to agency viewers; the creator platforms page did the same through
// platformSnapshot -> connections.get. Fix (default deny): parseRecentHistory drops the cost unless called with cost=true, which only
// operator responses do (lib/onlyfans/reads.ts internalOperator). A stripped block must still re-parse in the browser (rwl #3).
// Driven for real through tests/helpers/W2c-delta-route-harness.ts (its declared mocks only): GET memory fans list + fan detail,
// GET /api/onlyfans-connections/accounts/[id] (operator), and configuredConnectionBackend().get, the call platformSnapshot and the
// creator GET make. Browser parsers: parseMemoryPageEnvelope, parseMemoryEnvelope, parseConnection. Synthetic values only.
// Run: nice -n 10 node --import tsx --test tests/rules/N1-memory-cost-agency.test.ts (re-runs itself under --experimental-test-module-mocks)
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { call, ensureModuleMocks, ready, reset, state, upstream } from "../helpers/W2c-delta-route-harness";
import { CONNECTION, connectionResponse, COST, RECENT } from "./core-recent-fixtures";
import type { RecentHistory } from "../../lib/onlyfans-connections/recent-history";
import { parseConnection } from "../../lib/onlyfans-connections/contract";
import { configuredConnectionBackend } from "../../lib/onlyfans-connections/backend";
import { parseMemoryEnvelope, parseMemoryPageEnvelope } from "../../lib/onlyfans/launch/memory/b-memory-client";
import RecentHistoryStatus from "../../components/onlyfans-preview/RecentHistoryStatus";
Object.assign(globalThis, { React }); // tsx compiles the component with the classic JSX runtime

const ACCOUNT = "of-a", FAN = "9007199254740993", AT = "2026-10-23T00:00:00Z", V = "a".repeat(64);
const GRANT = { creatorIds: ["11111111-1111-4111-8111-111111111111"], actor: "agency-user:a:b", canManage: false, canChat: false };
const BASE = RECENT, RAW = { ...RECENT, memoryModelAccounting: COST }; // the default projection; what the backend sends
const leaks = (v: unknown) => ["memoryModelAccounting", ...Object.values(COST)].filter(s => JSON.stringify(v).includes(s));
const recovery = (fanId: string | null) => ({ schemaVersion: "of-history-recovery.v1", accountId: ACCOUNT, fanId, status: "incomplete",
  discoveryComplete: false, conversationsDiscovered: 3, conversationsComplete: 1, conversationsRetrying: 0, conversationsDeferredForLiveInput: 0,
  pagesCommitted: 2, messagesObserved: 40, messagesAdded: 40, totalMessages: null, percentComplete: null, recentRecoveryNeeded: true, recentHistory: RAW });
const memory = { schemaVersion: "of-history-memory.v1", algorithm: "english-patterns.v1", revision: 1, version: V, canonicalDigest: V, fingerprint: V,
  facts: {}, summaries: { short_bio: null, bullet_points: null }, overrides: {}, interactions: [], summaryKind: "saved_profile_and_source_excerpts" };
const progress = { schemaVersion: "of-history-memory-progress.v1", algorithm: "english-patterns.v1", storedMessages: 4, processedCurrentMessages: 4,
  pendingMessages: 0, storedMemoryComplete: true, providerHistoryComplete: null, revision: 1, oldestStoredAt: AT, newestStoredAt: AT, lastProcessedAt: AT };
const connection = connectionResponse({ ...CONNECTION, accountId: ACCOUNT, recentHistory: RAW });
const ok = (extra: object) => Response.json({ schemaVersion: "of-configuration.v3", ok: true, accountId: ACCOUNT, ...extra });
function wire() {
  upstream(c => c.path.endsWith("/history-memory/fans") ? ok({ memoryVersion: "of-history-memory.v1", fans: [], nextCursor: null })
    : c.path.endsWith("/history-memory/progress") ? ok({ progress: recovery(null) })
    : c.path.endsWith(`/fans/${FAN}/memory`) ? ok({ memory })
    : c.path.endsWith(`/fans/${FAN}/progress`) ? ok({ memory: progress, recovery: recovery(FAN) })
    : c.path.endsWith(`/connection/v1/accounts/${ACCOUNT}`) ? Response.json(connection)
    : Response.json({}, { status: 404 }));
}
/** The route's JSON, and what the browser's own parser keeps of it. */
const fans = async () => { const r = await call("onlyfans-launch/memory/accounts/[accountId]/fans", { accountId: ACCOUNT }); assert.equal(r.status, 200);
  const json = await r.json(); return { json, recent: parseMemoryPageEnvelope(json, ACCOUNT)?.progress.recentHistory }; };
const fan = async () => { const r = await call("onlyfans-launch/memory/accounts/[accountId]/fans/[fanId]", { accountId: ACCOUNT, fanId: FAN });
  assert.equal(r.status, 200); const json = await r.json(); return { json, recent: parseMemoryEnvelope(json, ACCOUNT, FAN)?.recovery.recentHistory }; };

test("parseConnection keeps recentHistory but never the cost by default (creator projection)", () => {
  const c = parseConnection(connection, ACCOUNT);
  assert.deepEqual(c?.recentHistory, BASE); assert.deepEqual(leaks(c), []);
});

test("RecentHistoryStatus renders no US$ line without accounting, and still renders it for the operator", () => {
  const html = (value: RecentHistory) => renderToStaticMarkup(React.createElement(RecentHistoryStatus, { value }));
  assert.equal(html(BASE).includes("US$"), false);
  assert.ok(html(BASE).includes("Recent history ready"));
  assert.ok(html(RAW).includes(`US$${COST.providerReportedUsd}`));
});

if (ensureModuleMocks(import.meta.url, { controls: 3, rest: 3 })) {
  beforeEach(async () => { reset(); await ready(); wire(); });

  test("control: the operator gets the cost on both memory reads, and the browser parsers keep it", async () => {
    for (const { json, recent } of [await fans(), await fan()]) {
      assert.equal(leaks(json).length, 5, "operator payload lost the cost"); assert.deepEqual(recent, RAW);
    }
  });

  test("control: the operator connection GET carries the cost, and ConnectionEditor's parse keeps it", async () => {
    const r = await call("onlyfans-connections/accounts/[accountId]", { accountId: ACCOUNT });
    assert.equal(r.status, 200);
    const json = await r.json();
    assert.deepEqual(parseConnection(json, ACCOUNT, true)?.recentHistory, RAW);
  });

  test("control: an agency session reaches both memory reads", async () => {
    state.identity = { grant: GRANT };
    await fans(); await fan();
  });

  test("agency: memory fans list has no cost, and the browser still shows the rest of recentHistory", async () => {
    state.identity = { grant: GRANT };
    const { json, recent } = await fans();
    assert.deepEqual(leaks(json), [], "our model cost reached an agency session");
    assert.deepEqual(recent, BASE, "the stripped block must still re-parse in the browser");
  });

  test("agency: memory fan detail has no cost, and the browser still shows the rest of recentHistory", async () => {
    state.identity = { grant: GRANT };
    const { json, recent } = await fan();
    assert.deepEqual(leaks(json), [], "our model cost reached an agency session");
    assert.deepEqual(recent, BASE, "the stripped block must still re-parse in the browser");
  });

  test("connections.get (platformSnapshot, creator GET) never returns the cost", async () => {
    const r = await configuredConnectionBackend()!.get(ACCOUNT);
    assert.ok(r.ok); assert.deepEqual(r.data.recentHistory, BASE); assert.deepEqual(leaks(r), [], "a creator would receive our model cost");
  });
}
