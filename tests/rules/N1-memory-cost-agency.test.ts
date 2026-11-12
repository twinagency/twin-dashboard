// Rule ("our cost and margin never leave the building", CLAUDE.md), finding N1-follow-c follow-up memory-cost-agency:
// /onlyfans/launch/memory admits agency sessions (requireOnlyFansRead({ agency: true })), BMemoryPanel renders RecentHistoryStatus,
// and that printed recentHistory.memoryModelAccounting (our model spend, USD) to agency viewers. Fix (Fable): omit it SERVER-side
// unless the session is the internal operator (lib/onlyfans/reads.ts internalOperator), never just hide it in the client.
// Serializers covered: GET /api/onlyfans-launch/memory/accounts/[accountId]/fans (progress.recentHistory) and .../fans/[fanId]
// (recovery.recentHistory), driven for real through tests/helpers/W2c-delta-route-harness.ts (its declared mocks only); the creator
// GET app/creator-auth/platforms/onlyfans/[accountId] (connection.recentHistory to a creator) by source check, since no offline
// harness drives creator sessions. Agency still gets every other field; the operator's payload is unchanged.
// Run: nice -n 10 node --import tsx --test tests/rules/N1-memory-cost-agency.test.ts (re-runs itself under --experimental-test-module-mocks)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { beforeEach } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { call, ensureModuleMocks, ready, reset, state, upstream } from "../helpers/W2c-delta-route-harness";
import { RECENT } from "./core-recent-fixtures";
import { withoutModelCost } from "../../lib/onlyfans-connections/recent-history";
import RecentHistoryStatus from "../../components/onlyfans-preview/RecentHistoryStatus";
Object.assign(globalThis, { React }); // tsx compiles the component with the classic JSX runtime

const ACCOUNT = "of-a", FAN = "9007199254740993", AT = "2026-10-23T00:00:00Z", V = "a".repeat(64);
const GRANT = { creatorIds: ["11111111-1111-4111-8111-111111111111"], actor: "agency-user:a:b", canManage: false, canChat: false };
const COST = Object.values(RECENT.memoryModelAccounting!);
const recovery = (fanId: string | null) => ({ schemaVersion: "of-history-recovery.v1", accountId: ACCOUNT, fanId, status: "incomplete",
  discoveryComplete: false, conversationsDiscovered: 3, conversationsComplete: 1, conversationsRetrying: 0, conversationsDeferredForLiveInput: 0,
  pagesCommitted: 2, messagesObserved: 40, messagesAdded: 40, totalMessages: null, percentComplete: null, recentRecoveryNeeded: true, recentHistory: RECENT });
const memory = { schemaVersion: "of-history-memory.v1", algorithm: "english-patterns.v1", revision: 1, version: V, canonicalDigest: V, fingerprint: V,
  facts: {}, summaries: { short_bio: null, bullet_points: null }, overrides: {}, interactions: [], summaryKind: "saved_profile_and_source_excerpts" };
const progress = { schemaVersion: "of-history-memory-progress.v1", algorithm: "english-patterns.v1", storedMessages: 4, processedCurrentMessages: 4,
  pendingMessages: 0, storedMemoryComplete: true, providerHistoryComplete: null, revision: 1, oldestStoredAt: AT, newestStoredAt: AT, lastProcessedAt: AT };
const ok = (extra: object) => Response.json({ schemaVersion: "of-configuration.v3", ok: true, accountId: ACCOUNT, ...extra });
function wire() {
  upstream(c => c.path.endsWith("/history-memory/fans") ? ok({ memoryVersion: "of-history-memory.v1", fans: [], nextCursor: null })
    : c.path.endsWith("/history-memory/progress") ? ok({ progress: recovery(null) })
    : c.path.endsWith(`/fans/${FAN}/memory`) ? ok({ memory })
    : c.path.endsWith(`/fans/${FAN}/progress`) ? ok({ memory: progress, recovery: recovery(FAN) })
    : Response.json({}, { status: 404 }));
}
const fans = () => call("onlyfans-launch/memory/accounts/[accountId]/fans", { accountId: ACCOUNT });
const fan = () => call("onlyfans-launch/memory/accounts/[accountId]/fans/[fanId]", { accountId: ACCOUNT, fanId: FAN });
type Recent = { recentHistory?: Record<string, unknown> };
const recentOf = async (r: Response, key: "progress" | "recovery") => {
  assert.equal(r.status, 200); return ((await r.json()) as Record<string, Recent>)[key].recentHistory!; };
const { memoryModelAccounting: _cost, ...RECENT_NO_COST } = RECENT;

test("withoutModelCost drops only memoryModelAccounting and leaves the input intact", () => {
  const v = { a: 1, recentHistory: RECENT };
  assert.deepEqual(withoutModelCost(v), { a: 1, recentHistory: RECENT_NO_COST });
  assert.ok(v.recentHistory.memoryModelAccounting, "input not mutated");
  const bare: { a: number; recentHistory?: typeof RECENT } = { a: 1 };
  assert.deepEqual(withoutModelCost(bare), { a: 1 });
});

test("RecentHistoryStatus renders no US$ line without accounting, and still renders it for the operator", () => {
  const html = (value: typeof RECENT) => renderToStaticMarkup(React.createElement(RecentHistoryStatus, { value }));
  assert.equal(html(RECENT_NO_COST).includes("US$"), false);
  assert.ok(html(RECENT_NO_COST).includes("Recent history ready"));
  assert.ok(html(RECENT).includes(`US$${RECENT.memoryModelAccounting!.providerReportedUsd}`));
});

test("creator platform GET strips the cost from connection.recentHistory", () => {
  const src = readFileSync(new URL("../../app/creator-auth/platforms/onlyfans/[accountId]/route.ts", import.meta.url), "utf8");
  assert.match(src, /connection:withoutModelCost\(result\.data\)/, "a creator must never receive our model cost");
});

if (ensureModuleMocks(import.meta.url, { controls: 2, rest: 2 })) {
  beforeEach(async () => { reset(); await ready(); wire(); });

  test("control: the operator still gets memoryModelAccounting on both memory reads", async () => {
    assert.deepEqual(await recentOf(await fans(), "progress"), RECENT);
    assert.deepEqual(await recentOf(await fan(), "recovery"), RECENT);
  });

  test("control: an agency session reaches both memory reads (agency is admitted)", async () => {
    state.identity = { grant: GRANT };
    assert.equal((await fans()).status, 200); assert.equal((await fan()).status, 200);
  });

  test("agency: memory fans list carries no model cost, everything else intact", async () => {
    state.identity = { grant: GRANT };
    const r = await fans(), text = await r.clone().text();
    assert.equal(text.includes("memoryModelAccounting"), false, "our model cost reached an agency session");
    assert.deepEqual(COST.filter(v => v !== "0" && text.includes(`"${v}"`)), []);
    assert.deepEqual(await recentOf(r, "progress"), RECENT_NO_COST);
  });

  test("agency: memory fan detail carries no model cost, everything else intact", async () => {
    state.identity = { grant: GRANT };
    const r = await fan(), text = await r.clone().text();
    assert.equal(text.includes("memoryModelAccounting"), false, "our model cost reached an agency session");
    assert.deepEqual(await recentOf(r, "recovery"), RECENT_NO_COST);
  });
}
