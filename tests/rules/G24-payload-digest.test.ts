// RULE G24 (W4 lib-onlyfans-preview-1 F9): canonicalPayload (lib/onlyfans-preview/actions.ts) encodes fields as a JSON tuple, so
// {catalogItemId: 5, body: "hi"} and {body: "item-5:hi"} never share a commandId or idempotencyKey.
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
