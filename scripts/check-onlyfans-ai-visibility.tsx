import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import { conversationTimeline, isAiChatting } from "../lib/onlyfans/ai-visibility";
import { accounts, conversationDetails } from "../lib/onlyfans-preview/fixtures";
import { readConversations } from "../lib/onlyfans/reads";
import { createFetchOnlyFansTransport } from "../lib/onlyfans-preview/server-data-source";
import { createHttpOnlyFansBackend, type OnlyFansBackend } from "../lib/onlyfans/backend";
import { createFixtureOnlyFansDataSource, operatorViewer } from "../lib/onlyfans-preview/fixture-data-source";
import { initialSelectionState, requestConversations, requestMoreConversations, applyConversations, appendConversations } from "../lib/onlyfans-preview/selection";
import type { ConversationDetail, ConversationSummary } from "../lib/onlyfans-preview/types";
import type { Handover } from "../lib/onlyfans/handover";

async function main() {
  const base = Object.values(conversationDetails).find(d => d.accountId === accounts[0].accountId)!;
  const summary: ConversationSummary = { ...base.summary, revision: 8, automationMode: "automated", takeoverState: "none" };
  const paused = { ...summary, conversationId: "paused-fan", automationMode: "paused" as const };
  assert(isAiChatting(summary));
  for (const automationMode of ["paused", "human_controlled", "no_contact"] as const) assert(!isAiChatting({ ...summary, automationMode }));
  for (const takeoverState of ["requested", "effective"] as const) assert(!isAiChatting({ ...summary, takeoverState }));
  const messages = ["imported", "human", "ai"].map((origin, index) => ({ messageId: `message-${index}`, conversationId: base.conversationId,
    direction: "outbound" as const, origin: origin as "imported" | "human" | "ai", body: "Synthetic test message", occurredAt: `2026-10-26T10:0${index * 2}:00Z`, delivery: "sent" as const, evidenceRef: null }));
  const detail: ConversationDetail = { ...base, summary, messages };
  const history: Handover = { schemaVersion: "of-handover.v1", accountId: detail.accountId, conversationId: detail.conversationId,
    revision: 8, mode: "automated", takeoverState: "none", owner: null, canActAsOwner: true, hasMore: false,
    events: [{ action: "resume_automation", mode: "automated", revision: 8, who: "you", at: "2026-10-26T10:03:00Z" },
      { action: "request_takeover", mode: "human_controlled", revision: 7, who: "you", at: "2026-10-26T10:01:00Z" }] };
  const timeline = conversationTimeline(detail, history);
  assert.deepEqual(timeline.map(e => e.kind), ["message", "control", "message", "control", "message"]);
  assert.deepEqual(timeline.filter(e => e.kind === "control").map(e => e.label), ["Manual takeover. AI paused", "AI took over"]);
  assert.equal(conversationTimeline(detail, { ...history, accountId: "another-account" }).length, 3);
  assert.equal(conversationTimeline(detail, { ...history, conversationId: "another-fan" }).length, 3);
  assert.equal(conversationTimeline(detail, { ...history, revision: 9 }).length, 3);
  assert.equal(conversationTimeline(detail, { ...history, events: [...history.events, history.events[0]] }).length, 5);
  assert.equal(conversationTimeline(detail).length, 3, "Missing history cannot invent a takeover time");

  const paths: string[] = [];
  const fakeFetch = async (url: string | URL | Request) => { paths.push(String(url)); return new Response(JSON.stringify({ schemaVersion: "of-preview.v2", accountId: summary.accountId, page: { items: [summary], nextCursor: "next-page" } }), { status: 200 }); };
  const transport = createFetchOnlyFansTransport(fakeFetch as typeof fetch);
  await transport.readConversations(summary.accountId, "next-page", true);
  assert.equal(new URL(paths.pop()!, "https://example.invalid").searchParams.get("filter"), "ai");
  const backend = createHttpOnlyFansBackend({ baseUrl: "https://example.invalid", token: "synthetic-test-token", fetchImpl: fakeFetch as typeof fetch });
  if (!backend) throw Error("Test backend configuration failed");
  await backend.listConversations(summary.accountId, "next-page", true);
  assert.equal(new URL(paths.pop()!).searchParams.get("filter"), "ai");
  const auth = { operatorSession: true, agency: false, viewAs: false };
  const ignoredFilter = { ...backend, listConversations: async () => ({ ok: true as const, data: { items: [paused], nextCursor: null } }) } as OnlyFansBackend;
  assert.equal((await readConversations({ auth, backend: ignoredFilter }, { accountId: summary.accountId, cursor: null, aiOnly: true })).ok, false);
  const fixture = createFixtureOnlyFansDataSource({ viewer: operatorViewer() });
  const filtered = await fixture.listConversations(accounts[0].accountId, null, true);
  if (filtered.status === "ready" || filtered.status === "stale") assert(filtered.data.items.every(isAiChatting));
  const pendingAll = requestConversations(initialSelectionState(), summary.accountId);
  const pendingAi = requestConversations(pendingAll.state, summary.accountId);
  const readyAi = applyConversations(pendingAi.state, summary.accountId, pendingAi.generation, pendingAi.seq, { status: "ready", data: { items: [summary], nextCursor: "next-page" } });
  assert(!applyConversations(readyAi.state, summary.accountId, pendingAll.generation, pendingAll.seq, { status: "ready", data: { items: [paused], nextCursor: null } }).applied);
  const oldPage = requestMoreConversations(readyAi.state, summary.accountId);
  const changedFilter = requestConversations(oldPage.state, summary.accountId);
  assert(!appendConversations(changedFilter.state, summary.accountId, oldPage.generation, oldPage.seq, { status: "ready", data: { items: [paused], nextCursor: null } }).applied);

  (globalThis as unknown as { React: typeof React }).React = React;
  createRequire(import.meta.url).extensions[".css"] = module => { module.exports = {}; };
  const { default: InboxView } = await import("../components/onlyfans-preview/InboxView");
  const props = { accountsState: { status: "ready" as const, data: [accounts[0]] }, activeAccount: accounts[0], activeAccountId: summary.accountId,
    onSelectAccount: () => {}, conversations: { status: "ready" as const, data: { items: [summary, paused], nextCursor: null } },
    selectedConversationId: detail.conversationId, onSelectConversation: () => {}, detailState: { status: "ready" as const, data: detail },
    viewer: operatorViewer(), onCommand: () => {}, commandResult: null, nextCursor: null, loadingMore: false, onLoadMore: () => {}, showPreviewChrome: false, handoverHistory: history };
  const html = renderToStaticMarkup(<InboxView {...props} />);
  assert.equal((html.match(/data-of-ai-chatting/g) || []).length, 2, "One AI list badge and one selected-chat badge");
  assert.equal((html.match(/data-of-ai-reply/g) || []).length, 1, "Only verified AI messages receive an AI reply label");
  assert.equal((html.match(/data-of-handover-event/g) || []).length, 2, "Saved handovers appear inline");
  assert.match(html, />AI took over</);
  assert.match(html, />AI chatting<\/button>/);
  const filteredHtml = renderToStaticMarkup(<InboxView {...props} aiOnly />);
  assert(!filteredHtml.includes('data-of-conversation-id="paused-fan"'));
  const refreshed = renderToStaticMarkup(<InboxView {...props} />);
  assert.equal((refreshed.match(/data-of-handover-event/g) || []).length, 2, "Reloading keeps persisted history visible");
  console.log("PASS AI visibility: saved modes, takeover states, filter forwarding and scoping, filtered pagination, late list/page rejection, AI-only attribution, persisted chronological handovers and rendered badges.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
