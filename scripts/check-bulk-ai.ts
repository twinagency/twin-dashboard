import assert from "node:assert/strict";
import { enableExistingFanChats } from "../lib/onlyfans/bulk-ai";
import { accounts, conversationDetails } from "../lib/onlyfans-preview/fixtures";
import { operatorViewer } from "../lib/onlyfans-preview/fixture-data-source";
import type { OnlyFansDataSource } from "../lib/onlyfans-preview/data-source";
import type { ConversationSummary } from "../lib/onlyfans-preview/types";
async function main() {
  const account = accounts[0], viewer = operatorViewer();
  const detail = Object.values(conversationDetails).find(d => d.accountId === account.accountId)!;
  const base: ConversationSummary = { ...detail.summary, revision: 0, automationMode: "paused", takeoverState: "none", delivery: "none" };
  const rows = [base, { ...base, conversationId: "manual", revision: 3 }, { ...base, conversationId: "excluded", automationMode: "no_contact" as const },
    { ...base, conversationId: "takeover", takeoverState: "effective" as const }, { ...base, conversationId: "on", automationMode: "automated" as const },
    { ...base, conversationId: "later" }];
  let sends: string[] = [], fail = false, race = false, foreign = false;
  const source = { kind: "live", async listConversations(_a: string, cursor: string | null) {
    return { status: "ready", data: { items: cursor ? [foreign ? { ...rows[5], accountId: "other" } : rows[5]] : rows.slice(0,5), nextCursor: cursor ? null : "page2" } };
  }, async getConversation(_a: string, id: string) {
    const summary = rows.find(s => s.conversationId === id)!;
    return { status: "ready", data: { ...detail, conversationId: id, summary: race ? {...summary, revision: 1, takeoverState: "effective"} : summary, deliveryIncident: null } };
  }, async submitCommand(request: any) {
    sends.push(request.conversationId);
    return { simulated: false, applied: !fail, accepted: !fail, outcome: fail ? "unconfirmed" : "recorded", request, note: "" };
  } } as unknown as OnlyFansDataSource;
  const options = { account, viewer, source, cancelled: () => false, progress: () => {}, stopHold: () => null };
  const result = await enableExistingFanChats(options);
  assert.equal(result.enabled, 2); assert.equal(result.protected, 3); assert.equal(result.alreadyOn, 1);
  assert.deepEqual(sends, [base.conversationId, "later"]);
  sends = []; race = true;
  assert.equal((await enableExistingFanChats(options)).enabled, 0); assert.equal(sends.length, 0);
  race = false; fail = true;
  await assert.rejects(enableExistingFanChats(options), /not confirmed/); assert.equal(sends.length, 1);
  sends = []; foreign = true;
  await assert.rejects(enableExistingFanChats(options), /changed account/); assert.equal(sends.length, 0);
  await assert.rejects(enableExistingFanChats({...options, viewer: {...viewer, canManage: false}}), /cannot enable/);
  await assert.rejects(enableExistingFanChats({...options, cancelled: () => true}), /Stopped/);
  console.log("PASS bulk AI: complete pagination, protected chats, race checks, uncertain writes, account isolation, permissions and cancellation.");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
