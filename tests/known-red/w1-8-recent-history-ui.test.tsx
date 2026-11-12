// KNOWN RED (W1 lane 8 P5, P6 and P19; D2 recent-history surface).
// P5 (CLAUDE.md "Our cost and margin never leave the building"; REVIEW.md inv 4 spirit): RecentHistoryStatus.tsx:13-14 renders the
//   model cost ("Model charges reported: US$…", token estimates, reservations) and is mounted by ConnectionSyncStatus.tsx:8 (creator
//   portal /creator/platforms, operator connection editor) and by BMemoryPanel MemoryDiagnostics (inbox sidebar, chatters).
//   Fixed looks like: no model-cost money in either surface (internal managers only, or not carried through parseRecentHistory).
// P6 (REVIEW.md "UI claims that outrun backend evidence"): ConnectionSyncStatus.tsx:8 returns early with recent history, dropping the
//   quarantined/pending sync block; RecentHistoryStatus.tsx:5 says "Recent history ready" while providerOrdering
//   "id_desc_exhaustive_date_filter" means coverage is unverified. Fixed looks like: recent history rendered IN ADDITION to the sync
//   block, and no ready claim while ordering is unverified.
// P19 (D2; REVIEW.md "UI claims that outrun backend evidence", reversed: a false alarm): RecentHistoryStatus.tsx:12 raises the
//   role=alert "Blockers" line on Object.keys(h.providerErrors).length, so a ready block whose provider errors are all 0 (which
//   recent-history.ts:40 `.some(Boolean)` accepts) shows "Recent history ready" next to "Blockers: <key>". Fixed looks like: the
//   alert counts only non-zero provider errors. Asserts no role=alert naming the zero-count key; copy not pinned.
// Copy is not pinned: money is found by its fixture values and "US$"; the sync signal by any quarantine/conflict/review wording.
// Not wired into npm scripts; init.sh does not run it yet. Offline: SSR (react-dom/server, hook-free components), no fetch at all.
//   node --import tsx --test --test-name-pattern='^control' tests/known-red/w1-8-recent-history-ui.test.tsx   (green)
//   node --import tsx --test --test-skip-pattern='^control' tests/known-red/w1-8-recent-history-ui.test.tsx   (red, ERR_ASSERTION)
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToString } from "react-dom/server";
import ConnectionSyncStatus from "../../components/onlyfans-preview/ConnectionSyncStatus";
import { MemoryDiagnostics } from "../../components/onlyfans-launch/memory/BMemoryPanel";
import RecentHistoryStatus from "../../components/onlyfans-preview/RecentHistoryStatus";
import { connectionState } from "../../lib/onlyfans-connections/presentation";
import { parseRecentHistory } from "../../lib/onlyfans-connections/recent-history";
import { MODEL_USD, QUARANTINED, connection, memoryProgress, recentHistory, recovery } from "../helpers/w1-8-fixtures";

Object.assign(globalThis, { React }); // the components use the classic JSX transform under tsx

const text = (markup: string) => markup.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const sync = (extra: Record<string, unknown> = {}) => { const c = connection(extra); return text(renderToString(React.createElement(ConnectionSyncStatus, { connection: c, state: connectionState(c) }))); };
/** The quarantine signal in any wording, with its count. */
const quarantineShown = (t: string) => new RegExp(`\\b${QUARANTINED}\\b[^.]*\\b(conflict|quarantin|review)`, "i").test(t) || /quarantin|needs review/i.test(t);
const moneyShown = (t: string) => ["US$", ...Object.values(MODEL_USD)].filter(v => t.includes(v));
const statusTexts = (markup: string) => [...markup.matchAll(/<[^>]*role="status"[^>]*>(.*?)<\/(p|div|span|section)>/g)].map(m => text(m[1]));

const ERROR_KEY = "provider_rate_limited";
/** recentHistory() with providerErrors replaced; `state` lets the control use an incomplete block. Checked by the real parser. */
function withProviderErrors(providerErrors: Record<string, number>, state: "recent_history_ready" | "incomplete") {
  const base = recentHistory();
  const value = { ...base, initialHistory: { ...base.initialHistory, state, providerErrors },
    memoryProcessing: state === "incomplete" ? { ...base.memoryProcessing, state: "incomplete" } : base.memoryProcessing };
  const parsed = parseRecentHistory(value);
  assert.ok(parsed, "fixture: recent history must pass parseRecentHistory");
  assert.equal(parsed.initialHistory.state, state);
  return parsed;
}
const alerts = (markup: string) => [...markup.matchAll(/<[^>]*role="alert"[^>]*>(.*?)<\/(p|div|span|section)>/g)].map(m => text(m[1]));

test("control: an incomplete block with a non-zero provider error raises an alert naming it", () => {
  const markup = renderToString(React.createElement(RecentHistoryStatus, { value: withProviderErrors({ [ERROR_KEY]: 2 }, "incomplete") }));
  assert.equal(alerts(markup).filter(a => a.includes(ERROR_KEY)).length, 1, "alert finder sees the provider error");
});

test("control: a connection without recentHistory shows the quarantine/sync block", () => {
  const t = sync();
  assert.ok(quarantineShown(t), `quarantine signal missing: ${t}`);
  assert.match(t, /\b5\b[^.]*waiting/i, "pending messages shown");
  assert.equal(moneyShown(t).length, 0);
});

test("P5 A: connection sync status with recentHistory shows no model-cost money", () => {
  const t = sync({ recentHistory: recentHistory() });
  assert.deepEqual(moneyShown(t), [], "model cost rendered on the connection/creator surface");
});

test("P5 B: inbox memory diagnostics with recentHistory show no model-cost money", () => {
  const t = text(renderToString(React.createElement(MemoryDiagnostics, { progress: memoryProgress(0), recovery: recovery(recentHistory()) })));
  assert.match(t, /stored/i, "diagnostics rendered");
  assert.deepEqual(moneyShown(t), [], "model cost rendered in the inbox memory diagnostics");
});

test("P6 A: with recentHistory, the quarantined sync signal is still shown", () => {
  const t = sync({ recentHistory: recentHistory() });
  assert.ok(quarantineShown(t), `recent history replaced the sync block; ${QUARANTINED} quarantined messages not shown: ${t.slice(0, 300)}`);
});

test("P6 B: recent history with unverified timestamp ordering is not headlined as ready", () => {
  const c = connection({ recentHistory: recentHistory("id_desc_exhaustive_date_filter") });
  const markup = renderToString(React.createElement(ConnectionSyncStatus, { connection: c, state: connectionState(c) }));
  const ready = statusTexts(markup).filter(s => /\bready\b/i.test(s));
  assert.deepEqual(ready, [], "status headline claims ready while ordering is unverified");
  assert.doesNotMatch(text(markup), /recent history ready/i);
});

test("P19: a ready block whose provider errors are all zero raises no Blockers alert", () => {
  const markup = renderToString(React.createElement(RecentHistoryStatus, { value: withProviderErrors({ [ERROR_KEY]: 0 }, "recent_history_ready") }));
  assert.match(text(markup), /ready/i, "fixture: the block renders as ready");
  assert.deepEqual(alerts(markup).filter(a => a.includes(ERROR_KEY)), [], "ready block raises an alert for a provider error counted 0");
});
