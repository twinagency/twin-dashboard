import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import InboxView from "../../components/onlyfans-preview/InboxView";
import { accounts } from "../../lib/onlyfans-preview/fixtures";
import { operatorViewer } from "../../lib/onlyfans-preview/fixture-data-source";
import type { EngineActionHandler } from "../../components/onlyfans-preview/EngineStatus";
import type { EngineStatusView } from "../../lib/onlyfans/engine-status";
import type { ConversationDetail } from "../../lib/onlyfans-preview/types";

async function main() {
  const [envelope, sequence, live, livePage2] = await Promise.all([fetch("/journey.json").then(r => r.json()), fetch("/sequence.json").then(r => r.json()),
    fetch("/live.json").then(r => r.json()), fetch("/live-page2.json").then(r => r.json())]);
  window.fetch = async () => Response.json({ error: "No external calls in the browser fixture." }, { status: 503 });
  const detail = envelope.conversation as ConversationDetail;
  function App() {
    const [value, setValue] = useState<EngineStatusView>(detail.engineStatus as EngineStatusView);
    const onAction: EngineActionHandler = async (id, action, revision, note) => {
      (window as unknown as { actions: unknown[] }).actions.push({ id, action, revision, note });
      await new Promise(resolve => setTimeout(resolve, 250));
      setValue(current => current.state === "current" ? { ...current, requests: current.requests.map(request => request.requestId === id ?
        { ...request, revision: revision + 1, status: action === "request_handover" ? "handover_pending" : action === "accept_handover" ? "handover_accepted" : action === "complete" ? "completed" : "declined",
          nextStep: action === "request_handover" ? "await_handover_acceptance" : action === "accept_handover" ? "human_review" : "none" } : request) } : current);
      return { ok: true };
    };
    const account = { ...accounts[0], accountId: detail.accountId };
    // Real-shaped backend pages, rescoped to the open conversation. A later page is served only for the first page's cursor.
    const scoped = (page: object) => ({ ...page, accountId: detail.accountId, conversationId: detail.conversationId });
    const onLoadMore = async (cursor: string) => { (window as unknown as { cursors: string[] }).cursors.push(cursor); await new Promise(resolve => setTimeout(resolve, 100)); return scoped(livePage2); };
    return <main><button type="button" data-load-sequence onClick={() => setValue(sequence)}>Load ordered-request fixture</button>
      <button type="button" data-load-live onClick={() => setValue(scoped(live) as EngineStatusView)}>Load live fixture</button><InboxView accountsState={{ status: "ready", data: [account] }} activeAccount={account} activeAccountId={detail.accountId}
      onSelectAccount={() => {}} conversations={{ status: "ready", data: { items: [detail.summary], nextCursor: null } }}
      selectedConversationId={detail.conversationId} onSelectConversation={() => {}} detailState={{ status: "ready", data: { ...detail, engineStatus: value } }}
      viewer={operatorViewer()} onCommand={() => {}} onEngineAction={onAction} onEngineLoadMore={onLoadMore} commandResult={null} nextCursor={null} loadingMore={false}
      onLoadMore={() => {}} showPreviewChrome={true} /></main>;
  }
  (window as unknown as { actions: unknown[]; cursors: string[] }).actions = []; (window as unknown as { cursors: string[] }).cursors = [];
  createRoot(document.getElementById("root")!).render(<App />);
}
void main();
