// KNOWN RED (W4 lib-onlyfans-preview-1 F9): canonicalPayload (lib/onlyfans-preview/actions.ts:200-219) joins fields with
// ":" and no escaping, so {catalogItemId: 5, body: "hi"} and {body: "item-5:hi"} get the same commandId and
// idempotencyKey from createCommandRequest, contradicting actions.ts:194-196 ("two different messages ... must not
// share a command identity"). Tested through createCommandRequest only, so a move to a per-click UUID (S3) stays green.
// Team's Claude owns the fix. Not wired into npm scripts or init.sh (lane may not edit init.sh; window close wires it).
import assert from "node:assert/strict";
import test from "node:test";
import { createCommandRequest } from "../../lib/onlyfans-preview/actions";
import type { CommandPayload } from "../../lib/onlyfans-preview/types";

const request = (payload: CommandPayload) => createCommandRequest({ command: "send_manual_message", accountId: "of-acc-ava-001",
  conversationId: "of-conv-ava-1003", expectedRevision: 9, payload });
const withItem: CommandPayload = { kind: "manual_message", body: "hi", catalogItemId: 5 };
const spoofed: CommandPayload = { kind: "manual_message", body: "item-5:hi" };

test("control: different bodies get different command ids", () => {
  assert.notEqual(request({ kind: "manual_message", body: "hi" }).commandId, request({ kind: "manual_message", body: "hello" }).commandId);
});

test("F9: a catalogue item send and a body that spells the item prefix never share a command id", () => {
  assert.notEqual(request(withItem).commandId, request(spoofed).commandId);
});

test("F9: a catalogue item send and a body that spells the item prefix never share an idempotency key", () => {
  assert.notEqual(request(withItem).idempotencyKey, request(spoofed).idempotencyKey);
});
