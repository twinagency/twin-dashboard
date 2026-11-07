import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createHttpOnlyFansBackend } from "../../lib/onlyfans/backend";
import { readConversation } from "../../lib/onlyfans/reads";
import { accounts } from "../../lib/onlyfans-preview/fixtures";
import { operatorViewer } from "../../lib/onlyfans-preview/fixture-data-source";

async function main() {
  const path = process.env.ENGINE_JOURNEY_ARTIFACT;
  assert(path, "A synthetic backend journey artifact is required");
  const envelope = JSON.parse(readFileSync(path, "utf8"));
  const accountId = "acc-a", conversationId = "acc-a:101";
  const backend = createHttpOnlyFansBackend({ baseUrl: "https://synthetic.invalid", token: "fixture",
    fetchImpl: async () => new Response(JSON.stringify(envelope), { status: 200, headers: { "content-type": "application/json" } }) });
  const result = await readConversation({ auth: { operatorSession: true, agency: false, viewAs: false }, backend },
    { accountId, conversationId });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("Synthetic conversation read failed");
  const detail = result.body.conversation;
  assert.equal(detail.messages.at(-1)?.body, "Two plus two is four.");
  assert.equal(detail.messages.at(-1)?.delivery, "sent");
  (globalThis as unknown as { React: typeof React }).React = React;
  const requireNative = createRequire(import.meta.url);
  requireNative.extensions[".css"] = module => { module.exports = {}; };
  const { default: InboxView } = await import("../../components/onlyfans-preview/InboxView");
  const account = { ...accounts[0], accountId };
  const markup = renderToStaticMarkup(<InboxView
    accountsState={{ status: "ready", data: [account] }} activeAccount={account} activeAccountId={accountId}
    onSelectAccount={() => {}} conversations={{ status: "ready", data: { items: [detail.summary], nextCursor: null } }}
    selectedConversationId={conversationId} onSelectConversation={() => {}}
    detailState={{ status: "ready", data: detail }} viewer={operatorViewer()} onCommand={() => {}}
    commandResult={null} nextCursor={null} loadingMore={false} onLoadMore={() => {}} showPreviewChrome={false}
  />);
  assert.match(markup, /Two plus two is four\./);
  assert.match(markup, /Reply completed/);
  assert.match(markup, /Simulation/);
  assert.match(markup, /Sent to provider/);
  assert.doesNotMatch(markup, /Purchase recorded/);
  console.log("PASS signed webhook to canonical receipt, API response, dashboard reader and rendered inbox");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
