// KNOWN RED (W5 lib-openrouter-plus6 F11, F12, F13, F14; docs/review/W5/lib-openrouter-plus6.md). lib/openrouter.ts
// treats provider answers that are not a finished answer as one.
// F11: orChat resolves a 200 whose finish_reason is "length" (cut off) or that carries a `refusal` as the answer
//      (lib/send-caption.ts:61 can store and send a cut-off caption; lib/sim.ts parses cut-off JSON).
// F12: orVisionDetailed throws on a billed 200 that stopped on "length" before it reads usage.cost, so the caller
//      (lib/caption.ts:66-81, which adds meta.costUsd only on success) never learns what the failed call cost. Green
//      only as a REJECTION that carries the 0.01: a resolve with cost metadata does not count, because lib/caption.ts
//      does not check finishReason and would use the cut-off text.
// F13: orChatWithToolsStream reassembles tool calls by `tc.index ?? 0` (merging index-less parallel calls) and runs a
//      tool with `{}` when its arguments do not parse (a write tool then proposes on "undefined"); a call whose
//      arguments do not parse must not run at all. Index-less parallel calls: green if both run with their own
//      arguments, or if no call runs with wrong arguments AND the stream emits an `error` event the caller can see;
//      silently running nothing (or only one) is still red.
// F14: an OpenRouter 400 "you requested 150000 tokens" and a 402 "can only afford 523" are retried by lib/retry.ts
//      withRetry as transient, because the HTTP status only exists inside the message and /5\d\d/ matches "150000"
//      and "523". Green may come from either side: lane 75's lib/retry.ts (O2) only if it checks a typed status or is
//      anchored on the `OpenRouter <status>:` prefix (a word-bounded /\b5\d\d\b/ still matches "afford 523"), or a
//      typed status on the OpenRouter error here (F14's own fix); the test only counts requests.
// OpenRouter faked at the wire (tests/support/W5-openrouter-wire.ts): only https://openrouter.ai is answered, from a
// per-test queue; any other host or an unplanned request throws. Synthetic key built at runtime; never a paid call.
// Assertions are on the observable outcome (resolved value, executeTool arguments, fetch count), not on a fix shape.
// Team's Claude owns the fix. Intended runner: init.sh's known-red loop (init.sh:54-56); not wired yet: orchestrator item.
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { completion, drain, installOrWire, sseChunk, sseReply, sseText, syntheticKey, textReply, type OrWire } from "../support/W5-openrouter-wire";
import { orChat, orChatWithToolsStream, orVisionDetailed } from "../../lib/openrouter";
import { withRetry } from "../../lib/retry";
import { harness } from "../support/W5-lib-openrouter-plus6-wire";

let wire: OrWire;
beforeEach(() => {
  process.env.OPENROUTER_API_KEY = syntheticKey();
  wire = installOrWire();
});
afterEach(() => {
  // A plain Error (crash), never a red: the harness, not the code under test, is wrong.
  if (wire.foreign.length) throw new Error(`harness: request to a non-fake host: ${wire.foreign.join(" | ")}`);
  if (wire.unserved) throw new Error(`harness: ${wire.unserved} request(s) without a queued reply`);
});

const DATA_URL = "data:image/png;base64,AAAA";
const settle = <T>(p: Promise<T>) => p.then((v) => ({ ok: true as const, v }), (e: unknown) => ({ ok: false as const, e }));

/** Every number reachable from an error's own properties (enumerable or not, `cause` included), depth-limited. */
function numbersIn(value: unknown, depth = 0, seen = new Set<unknown>()): number[] {
  if (typeof value === "number") return [value];
  if (value === null || typeof value !== "object" || depth > 6 || seen.has(value)) return [];
  seen.add(value);
  const out: number[] = [];
  for (const k of Object.getOwnPropertyNames(value)) {
    if (k === "stack") continue;
    out.push(...numbersIn((value as Record<string, unknown>)[k], depth + 1, seen));
  }
  return out;
}

// ── controls ────────────────────────────────────────────────────────────────
test("control: orChat with finish_reason stop returns the text", async () => {
  wire.queue(completion("a finished caption", "stop"));
  assert.equal(await orChat({ model: "fake/model", user: "hi" }), "a finished caption");
  assert.equal(wire.calls(), 1);
});

test("control: orVisionDetailed with finish_reason stop returns the text and usage.cost", async () => {
  wire.queue(completion('{"ok":true}', "stop", { cost: 0.01 }));
  const r = await orVisionDetailed({ model: "fake/vision", dataUrl: DATA_URL, prompt: "describe" });
  assert.equal(r.content, '{"ok":true}');
  assert.equal(r.meta.costUsd, 0.01);
});

test("control: orChatWithToolsStream runs one well-formed tool call with its parsed arguments", async () => {
  wire.queue(sseReply([
    sseChunk({ role: "assistant", tool_calls: [{ index: 0, id: "call_a", type: "function", function: { name: "tool_a", arguments: '{"x":' } }] }),
    sseChunk({ tool_calls: [{ index: 0, function: { arguments: "1}" } }] }),
    sseChunk({}, "tool_calls"),
  ]));
  wire.queue(sseText("done"));
  const seen: [string, Record<string, unknown>][] = [];
  await drain(orChatWithToolsStream({ model: "fake/model", messages: [{ role: "user", content: "q" }], tools: [], maxIterations: 2,
    executeTool: async (name, args) => { seen.push([name, args]); return { ok: true }; } }));
  assert.deepEqual(seen, [["tool_a", { x: 1 }]]);
});

test("control: withRetry around orChat retries a 429 (transient) once more", async () => {
  wire.queueTimes(2, textReply("rate limited", 429));
  await settle(withRetry(() => orChat({ model: "fake/model", user: "hi" }), 2, { baseMs: 1 }));
  assert.equal(wire.calls(), 2);
});

// ── findings ────────────────────────────────────────────────────────────────
test("F11: orChat does not resolve a cut-off (finish_reason length) answer as the reply", async () => {
  wire.queue(completion("Hey babe, I just took this one for you and I", "length"));
  const r = await settle(orChat({ model: "fake/model", user: "caption" }));
  assert.ok(!(r.ok && r.v === "Hey babe, I just took this one for you and I"),
    "orChat resolved the truncated text as if it were the finished answer");
});

test("F11: orChat does not resolve a refused answer as the reply", async () => {
  wire.queue(completion("I can't help with that.", "stop", { refusal: "I can't help with that." }));
  const r = await settle(orChat({ model: "fake/model", user: "caption" }));
  assert.ok(!(r.ok && r.v === "I can't help with that."), "orChat resolved a refusal as if it were the answer");
});

test("F12: a billed vision 200 that stopped on length still tells the caller its cost (0.01)", async () => {
  wire.queue(completion('{"short_label":"girl in', "length", { cost: 0.01 }));
  const r = await settle(orVisionDetailed({ model: "fake/vision", dataUrl: DATA_URL, prompt: "describe" }));
  // A resolve does not count: lib/caption.ts uses the content without checking finishReason.
  assert.equal(r.ok, false, `a cut-off (length) vision answer resolved as content: ${JSON.stringify(r.ok ? r.v : null)}`);
  assert.ok(numbersIn(r.e).includes(0.01),
    `the rejection carries no cost: ${String((r.e as Error)?.message ?? r.e)} (own props: ${Object.getOwnPropertyNames(r.e ?? {}).join(",")})`);
});

test("F13: two index-less parallel tool calls are never run with merged arguments", async () => {
  wire.queue(sseReply([
    sseChunk({ role: "assistant", tool_calls: [{ id: "call_a", type: "function", function: { name: "tool_a", arguments: '{"x":1}' } }] }),
    sseChunk({ tool_calls: [{ id: "call_b", type: "function", function: { name: "tool_b", arguments: '{"y":2}' } }] }),
    sseChunk({}, "tool_calls"),
  ]));
  wire.queue(sseText("done"));
  const seen: [string, Record<string, unknown>][] = [];
  const events = await drain(orChatWithToolsStream({ model: "fake/model", messages: [{ role: "user", content: "q" }], tools: [], maxIterations: 2,
    executeTool: async (name, args) => { seen.push([name, args]); return { ok: true }; } }));
  // No call may run with arguments the model did not send for it.
  const sent: Record<string, Record<string, unknown>> = { tool_a: { x: 1 }, tool_b: { y: 2 } };
  for (const [name, args] of seen) {
    assert.deepEqual(args, sent[name], `executeTool("${name}", ${JSON.stringify(args)}): not the arguments the model sent for ${name}`);
  }
  // And either both ran (faithfully, checked above), or the caller is told: an `error` event in the stream.
  const both = ["tool_a", "tool_b"].every((n) => seen.some(([name]) => name === n));
  const told = events.some((e) => e.type === "error");
  assert.ok(both || told, `ran ${JSON.stringify(seen.map(([n]) => n))} of [tool_a, tool_b] and emitted no error event: a call was dropped silently`);
});

test("F13: a tool call whose arguments do not parse is never run", async () => {
  wire.queue(sseReply([
    sseChunk({ role: "assistant", tool_calls: [{ index: 0, id: "call_w", type: "function", function: { name: "propose_toggle", arguments: '{"clone":"abc","field":"of' } }] }),
    sseChunk({}, "tool_calls"),
  ]));
  wire.queue(sseText("done"));
  const seen: [string, Record<string, unknown>][] = [];
  await drain(orChatWithToolsStream({ model: "fake/model", messages: [{ role: "user", content: "q" }], tools: [], maxIterations: 2,
    executeTool: async (name, args) => { seen.push([name, args]); return { ok: true }; } }));
  assert.deepEqual(seen, [], "executeTool ran a call whose arguments did not parse");
});

test("F14: withRetry around orChat does not retry a 400 'you requested 150000 tokens' (calls OpenRouter once)", async () => {
  const body = JSON.stringify({ error: { code: 400, message: "This endpoint's maximum context length is 128000 tokens. However, you requested 150000 tokens." } });
  wire.queueTimes(3, textReply(body, 400));
  const r = await settle(withRetry(() => orChat({ model: "fake/model", user: "long" }), 3, { baseMs: 1 }));
  harness(!r.ok, "a 400 must reject");
  assert.equal(wire.calls(), 1, `a non-transient 400 was sent to OpenRouter ${wire.calls()} times`);
});

test("F14: withRetry around orChat does not retry a 402 'can only afford 523' (calls OpenRouter once)", async () => {
  const body = JSON.stringify({ error: { code: 402, message: "This request requires more credits, or fewer max_tokens. You requested up to 4096 tokens, but can only afford 523." } });
  wire.queueTimes(3, textReply(body, 402));
  const r = await settle(withRetry(() => orChat({ model: "fake/model", user: "long" }), 3, { baseMs: 1 }));
  harness(!r.ok, "a 402 must reject");
  assert.equal(wire.calls(), 1, `a non-transient 402 (out of credits) was sent to OpenRouter ${wire.calls()} times`);
});
