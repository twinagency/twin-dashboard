// CHARACTERIZATION (W5 lib-openrouter-plus6 "Rules check": the OpenRouter key never reaches a client/log/error/response;
// docs/review/W5/lib-openrouter-plus6.md). Holds today; mutation-proven (tests/rules/mutations/W5-lib-openrouter-plus6/).
// For orChat, orVisionDetailed and orChatWithToolsStream: on a 200 success, an upstream 401, an upstream 500 (bodies
// that do not echo the key) and a network throw, the synthetic key never appears in a thrown error (message or any own
// property), a returned value (text and meta), or an emitted stream event; with the key unset nothing is sent at all.
// console.log/info/warn/error/debug are spied for every test: no logged argument may carry the key. The key does go
// out in the Authorization header (sanity: the rule is about everywhere else).
// OpenRouter faked at the wire (tests/support/W5-openrouter-wire.ts); any other host throws; never a paid call.
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { completion, drain, installOrWire, sseText, syntheticKey, textReply, type OrWire } from "../support/W5-openrouter-wire";
import { harness } from "../support/W5-lib-openrouter-plus6-wire";
import { orChat, orChatWithToolsStream, orVisionDetailed } from "../../lib/openrouter";

const KEY = syntheticKey();
let wire: OrWire;
const LEVELS = ["log", "info", "warn", "error", "debug"] as const;
type Level = (typeof LEVELS)[number];
let logged: { level: Level; args: unknown[] }[] = [];
const real = Object.fromEntries(LEVELS.map((l) => [l, console[l]])) as Record<Level, (...a: unknown[]) => void>;
beforeEach(() => {
  process.env.OPENROUTER_API_KEY = KEY;
  wire = installOrWire();
  logged = [];
  for (const l of LEVELS) console[l] = (...args: unknown[]) => { logged.push({ level: l, args }); };
});
afterEach(() => {
  for (const l of LEVELS) console[l] = real[l];
  harness(!wire.foreign.length, `request to a non-fake host: ${wire.foreign.join(" | ")}`);
  harness(!wire.unserved, `${wire.unserved} request(s) without a queued reply`);
});

/** Every string reachable from a value (own properties, enumerable or not, `cause` included), stack excluded. */
function strings(value: unknown, depth = 0, seen = new Set<unknown>()): string[] {
  if (typeof value === "string") return [value];
  if (value === null || typeof value !== "object" || depth > 6 || seen.has(value)) return [];
  seen.add(value);
  const out: string[] = [];
  for (const k of Object.getOwnPropertyNames(value)) {
    if (k === "stack") continue;
    out.push(...strings((value as Record<string, unknown>)[k], depth + 1, seen));
  }
  return out;
}
const outcome = <T>(p: Promise<T>) => p.then((v) => v as unknown, (e: unknown) => e);
function assertNoKey(label: string, value: unknown) {
  const leaks = strings(value).filter((s) => s.includes(KEY));
  assert.deepEqual(leaks, [], `${label}: the key reached the caller`);
  const inLogs = logged.filter((e) => strings(e.args).some((s) => s.includes(KEY))).map((e) => e.level);
  assert.deepEqual(inLogs, [], `${label}: the key was logged via console.${inLogs.join("/")}`);
}

const chat = () => outcome(orChat({ model: "fake/model", user: "hi" }));
const vision = () => outcome(orVisionDetailed({ model: "fake/vision", dataUrl: "data:image/png;base64,AAAA", prompt: "describe" }));
const stream = () => drain(orChatWithToolsStream({ model: "fake/model", messages: [{ role: "user", content: "q" }], tools: [], maxIterations: 1,
  executeTool: async () => ({}) }));
const FNS = { orChat: chat, orVisionDetailed: vision, orChatWithToolsStream: stream } as const;

const UPSTREAM: Record<string, () => () => Response> = {
  "401": () => textReply(JSON.stringify({ error: { message: "No auth credentials found", code: 401 } }), 401),
  "500": () => textReply(JSON.stringify({ error: { message: "Internal Server Error", code: 500 } }), 500),
};

const SUCCESS: Record<keyof typeof FNS, () => () => Response> = {
  orChat: () => completion("a finished caption", "stop"),
  orVisionDetailed: () => completion('{"ok":true}', "stop", { cost: 0.01 }),
  orChatWithToolsStream: () => sseText("done"),
};

for (const [name, run] of Object.entries(FNS) as [keyof typeof FNS, () => Promise<unknown>][]) {
  test(`${name}: a 200 success never carries the key in the returned text, meta or stream events`, async () => {
    wire.queue(SUCCESS[name]());
    const out = await run();
    harness(wire.calls() === 1, "one request went out");
    harness(wire.auth[0] === `Bearer ${KEY}`, "the key is sent in the Authorization header");
    harness(!(out instanceof Error), `the success path threw: ${String(out)}`);
    assertNoKey(`${name} 200`, out);
  });

  for (const [status, reply] of Object.entries(UPSTREAM)) {
    test(`${name}: an upstream ${status} never carries the key back to the caller`, async () => {
      wire.queue(reply());
      const out = await run();
      harness(wire.calls() === 1, "one request went out");
      harness(wire.auth[0] === `Bearer ${KEY}`, "the key is sent in the Authorization header");
      assertNoKey(`${name} ${status}`, out);
    });
  }

  test(`${name}: a network failure never carries the key back to the caller`, async () => {
    wire.queue(() => { throw new TypeError("fetch failed"); });
    const out = await run();
    harness(wire.calls() === 1, "one request went out");
    assertNoKey(`${name} network`, out);
  });

  test(`${name}: with the key unset nothing is sent and the caller learns only that it is missing`, async () => {
    delete process.env.OPENROUTER_API_KEY;
    const out = await run();
    assert.equal(wire.calls(), 0, "a request went out without a key");
    assert.ok(strings(out).some((s) => s.includes("OPENROUTER_API_KEY missing")), `outcome: ${JSON.stringify(strings(out))}`);
    assertNoKey(`${name} unset`, out);
  });
}
