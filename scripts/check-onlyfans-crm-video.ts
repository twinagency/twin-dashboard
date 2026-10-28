import assert from "node:assert/strict";
import { createControlBackend } from "../lib/onlyfans/controls-backend";
import { CONTROL_SCHEMA, controlRefusalNote, parseControlAck } from "../lib/onlyfans/controls";
import { threadNeedsRefresh, mergeListControl } from "../lib/onlyfans/thread-refresh";
import { effectiveAiStatus, isAiChatting } from "../lib/onlyfans/ai-visibility";
import { displayTime, displayDay } from "../lib/onlyfans/time";
import { createHttpOnlyFansBackend } from "../lib/onlyfans/backend";
import type { ConversationSummary, OfAccount } from "../lib/onlyfans-preview/types";

async function main() {
  const command = { accountId: "creator-a", conversationId: "creator-a:101", action: "manual_message" as const, expectedRevision: 7, commandKey: "a".repeat(64), actor: "op-session:" + "b".repeat(64), body: "Verification" };
  const backend = createControlBackend({ baseUrl: "https://backend.invalid", token: "service-only", fetchImpl: async () => Response.json({ schemaVersion: CONTROL_SCHEMA, ok: false, code: "history_repair_required", error: "Do not display arbitrary upstream text" }, { status: 409 }) });
  const refusal = await backend(command);
  assert.equal(refusal.ok, false);
  if (!refusal.ok) { assert.equal(refusal.code, "history_repair_required"); assert.match(refusal.error, /History import requires repair/); assert.doesNotMatch(refusal.error, /arbitrary/); }
  assert.match(controlRefusalNote(409, { schemaVersion: CONTROL_SCHEMA, ok: false, code: "takeover_pending", outcome: "refused" }), /Takeover is still pending/);
  assert.doesNotMatch(controlRefusalNote(409, { error: "private cookies", code: "__proto__" }), /cookies/);
  const lost = createControlBackend({ baseUrl: "https://backend.invalid", token: "service-only", fetchImpl: async () => { throw new Error("lost acknowledgement"); } });
  const result = await lost(command); assert(!result.ok && result.outcome === "unconfirmed");
  assert.equal(command.commandKey, "a".repeat(64));
  assert(parseControlAck({ schemaVersion: CONTROL_SCHEMA, ok: true, applied: true, commandKey: command.commandKey, accountId: command.accountId, conversationId: command.conversationId, action: "resolve_delivery_evidence", recordedRevision: 7 }, { ...command, action: "resolve_delivery_evidence" }));
  const row = { accountId: "creator-a", conversationId: "creator-a:101", revision: 7, lastActivityAt: "2026-10-28T12:00:00Z", lastMessageId: "501", lastMessagePreview: "Newest preview", automationMode: "automated", takeoverState: "none", delivery: "sent", historyHeld: false } as ConversationSummary;
  const older = { ...row, lastMessageId: "500", lastMessagePreview: "Older thread" };
  assert(threadNeedsRefresh(row, older));
  assert(!threadNeedsRefresh({ ...row, accountId: "creator-b" }, older));
  assert.equal(mergeListControl(row, { ...older, revision: 8, automationMode: "human_controlled" }).lastMessagePreview, "Newest preview");
  const account = { health: "connected", runtime: { enabled: false, deliveryEnabled: true, sender: { state: "running", observedAt: null, reason: null } } } as OfAccount;
  assert(isAiChatting(row)); assert.match(effectiveAiStatus(row, account), /Account paused/);
  assert.match(effectiveAiStatus(row, { ...account, runtime: { ...account.runtime!, enabled: true, sender: { state: "held", observedAt: null, reason: null } } }), /Sender unavailable/);
  assert.equal(displayTime("2026-10-28T12:08:00Z"), "22:08 AEST");
  assert.match(displayDay("2026-10-28T23:59:00Z"), /29 Oct/);
  let target = "";
  const read = createHttpOnlyFansBackend({ baseUrl: "https://backend.invalid", token: "read-only", fetchImpl: async input => { target = String(input); return Response.json({ schemaVersion: "of-preview.v2", accountId: "creator-a", page: { items: [], nextCursor: null } }); } });
  assert((await read.listConversations("creator-a", null, false, "@u318022380")).ok);
  assert.equal(new URL(target).searchParams.get("query"), "@u318022380");
  assert.match(new URL(target).pathname, /accounts\/creator-a\/conversations$/);
  console.log("PASS: specific refusals, uncertain outcome, reconciliation acknowledgement, same-second refresh, account isolation, preview preservation, runtime pause, sender hold, Brisbane time and server search transport");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
