// RULE G24 (W4 lib-onlyfans-preview-1 F8): commandPayloadProblem (lib/onlyfans-preview/actions.ts) is at least as strict as the
// live adapter (server-data-source.ts submitControl), so the fixture never accepts a payload the live adapter refuses.
import assert from "node:assert/strict";
import test from "node:test";
import { commandPayloadProblem, createCommandRequest } from "../../lib/onlyfans-preview/actions";
import { createFetchOnlyFansTransport } from "../../lib/onlyfans-preview/server-data-source";
import type { CommandPayload, PreviewCommand } from "../../lib/onlyfans-preview/types";

const MEDIA = { mediaIds: ["101", "102"], previewIds: ["101"], priceCents: 500 };
const CASES: Array<[string, PreviewCommand, CommandPayload]> = [
  ["resolution decided not_delivered", "resolve_delivery_evidence", { kind: "delivery_resolution", attemptId: "a1", decision: "not_delivered" }],
  ["delivered resolution without a provider message id", "resolve_delivery_evidence", { kind: "delivery_resolution", attemptId: "a1", decision: "delivered" }],
  ["media send with catalogItemId null", "send_manual_message", { kind: "manual_message", body: "hi", media: MEDIA, catalogItemId: null }],
];
const VALID: Array<[string, PreviewCommand, CommandPayload]> = [
  ["text send", "send_manual_message", { kind: "manual_message", body: "hi" }],
  ["media send", "send_manual_message", { kind: "manual_message", body: "hi", media: MEDIA }],
  ["delivered resolution with a provider message id", "resolve_delivery_evidence", { kind: "delivery_resolution", attemptId: "a1", decision: "delivered", providerMessageId: "123" }],
];

/**
 * The live adapter's verdict over a fake fetch that records each call and then throws, so nothing reaches a network.
 * "refused_before_fetch": its own validator refused, zero calls. "reached_fetch": it called fetch (which threw).
 */
async function liveVerdict(command: PreviewCommand, payload: CommandPayload): Promise<"refused_before_fetch" | "reached_fetch" | "other"> {
  const calls: string[] = [];
  const fakeFetch: typeof fetch = async (input) => { calls.push(String(input)); throw new Error("no network in tests"); };
  const transport = createFetchOnlyFansTransport(fakeFetch);
  assert.ok(transport.submitControl, "the fetch transport submits controls");
  const result = await transport.submitControl(createCommandRequest({ command, accountId: "of-acc-ava-001",
    conversationId: "of-conv-ava-1002", expectedRevision: 17, payload }));
  if (calls.length > 0) return "reached_fetch";
  return result.outcome === "refused" ? "refused_before_fetch" : "other";
}

test("control: valid payloads pass both validators and reach fetch; an empty send is refused by both before fetch", async () => {
  for (const [name, command, payload] of VALID) {
    assert.equal(commandPayloadProblem(command, payload), null, `shared validator refuses valid ${name}`);
    assert.equal(await liveVerdict(command, payload), "reached_fetch", `live adapter did not send valid ${name}`);
  }
  const empty: CommandPayload = { kind: "manual_message", body: "  " };
  assert.notEqual(commandPayloadProblem("send_manual_message", empty), null);
  assert.equal(await liveVerdict("send_manual_message", empty), "refused_before_fetch");
});

for (const [name, command, payload] of CASES) {
  test(`F8: the shared validator and the live adapter agree on a ${name}`, async () => {
    const fixtureRefuses = commandPayloadProblem(command, payload) !== null;
    const live = await liveVerdict(command, payload);
    assert.notEqual(live, "other", `live adapter neither refused nor sent the ${name}`);
    assert.equal(fixtureRefuses, live === "refused_before_fetch", `fixture refuses: ${fixtureRefuses}, live: ${live}`);
  });
}
