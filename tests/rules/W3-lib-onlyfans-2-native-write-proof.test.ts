/**
 * Characterization (W3-lib-onlyfans-2; REVIEW.md inv 7 "No false success" + "Unconfirmed is not refused (D7)" + "no
 * auto-retry"): rules that HOLD today in lib/onlyfans/launch/native-backend.ts for the configuration (:17-93) and
 * control (:144-203) write transports. A write answered 2xx with a body that does not prove it (missing ok, another
 * account, unparseable JSON) and a write whose fetch throws both read "unconfirmed" with status 502; an upstream 409
 * reads "refused"; the upstream is called exactly once. Fake fetch at https://backend.invalid, synthetic tokens.
 * Mutation proof: tests/rules/mutations/W3-lib-onlyfans-2/native-write-proof.md.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  createNativeConfigurationBackend,
  createNativeControlBackend,
  type NativeResult,
} from "../../lib/onlyfans/launch/native-backend";
import { CONFIGURATION_SCHEMA } from "../../lib/onlyfans/configuration";
import { CONTROL_SCHEMA } from "../../lib/onlyfans/controls";

const BASE = "https://backend.invalid";
const TOKEN = "synthetic-token";
const KEY = "a".repeat(64);

type Answer = { status: number; body: string } | "throw";
function fake(answer: Answer) {
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    calls.push(String(url));
    if (answer === "throw") throw new TypeError("synthetic network failure");
    return new Response(answer.body, { status: answer.status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const configWrite = async (answer: Answer) => {
  const f = fake(answer);
  const write = createNativeConfigurationBackend({ baseUrl: BASE, token: TOKEN, fetchImpl: f.fetchImpl });
  const result = await write("of-a", "engagement/settings", "POST", { settings: { enabled: true }, actor: "operator:synthetic", commandKey: KEY });
  assert.deepEqual(f.calls, [`${BASE}/onlyfans/configuration/v1/accounts/of-a/engagement/settings`], "one upstream call, never retried");
  return result;
};
const controlWrite = async (answer: Answer) => {
  const f = fake(answer);
  const write = createNativeControlBackend({ baseUrl: BASE, token: TOKEN, fetchImpl: f.fetchImpl });
  const result = await write("of-a", "control", { action: "stop", reason: "synthetic check", actor: "operator:synthetic", commandKey: KEY });
  assert.deepEqual(f.calls, [`${BASE}/onlyfans/control/v1/accounts/of-a/control`], "one upstream call, never retried");
  return result;
};

const configAck = (extra: Record<string, unknown>) => JSON.stringify({ schemaVersion: CONFIGURATION_SCHEMA, ok: true, accountId: "of-a", commandKey: KEY, ...extra });
const controlAck = (extra: Record<string, unknown>) => JSON.stringify({ schemaVersion: CONTROL_SCHEMA, ok: true, accountId: "of-a", command: { recorded: true, commandKey: KEY }, ...extra });

function assertUnconfirmed(result: NativeResult, why: string) {
  assert.equal(result.ok, false, why);
  if (!result.ok) {
    assert.equal(result.outcome, "unconfirmed", why);
    assert.equal(result.status, 502, why);
  }
}

test("configuration write: a proving ack is ok (baseline for the unproving cases)", async () => {
  assert.equal((await configWrite({ status: 200, body: configAck({}) })).ok, true);
});

test("configuration write: 2xx missing ok is unconfirmed 502", async () => {
  assertUnconfirmed(await configWrite({ status: 200, body: configAck({ ok: undefined }) }), "missing ok");
});

test("configuration write: 2xx for another account is unconfirmed 502", async () => {
  assertUnconfirmed(await configWrite({ status: 200, body: configAck({ accountId: "of-b" }) }), "wrong accountId");
});

test("configuration write: 2xx with unparseable JSON is unconfirmed 502", async () => {
  assertUnconfirmed(await configWrite({ status: 200, body: "{not json" }), "unparseable body");
});

test("configuration write: a thrown fetch is unconfirmed 502", async () => {
  assertUnconfirmed(await configWrite("throw"), "network failure");
});

test("configuration write: upstream 409 is refused", async () => {
  const result = await configWrite({ status: 409, body: "{}" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.deepEqual([result.status, result.outcome], [409, "refused"]);
});

test("control write: a proving ack is ok (baseline for the unproving cases)", async () => {
  assert.equal((await controlWrite({ status: 200, body: controlAck({}) })).ok, true);
});

test("control write: 2xx missing ok is unconfirmed 502", async () => {
  assertUnconfirmed(await controlWrite({ status: 200, body: controlAck({ ok: undefined }) }), "missing ok");
});

test("control write: 2xx for another account is unconfirmed 502", async () => {
  assertUnconfirmed(await controlWrite({ status: 200, body: controlAck({ accountId: "of-b" }) }), "wrong accountId");
});

test("control write: 2xx with unparseable JSON is unconfirmed 502", async () => {
  assertUnconfirmed(await controlWrite({ status: 200, body: "{not json" }), "unparseable body");
});

test("control write: a thrown fetch is unconfirmed 502", async () => {
  assertUnconfirmed(await controlWrite("throw"), "network failure");
});

test("control write: upstream 409 is refused", async () => {
  const result = await controlWrite({ status: 409, body: "{}" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.deepEqual([result.status, result.outcome], [409, "refused"]);
});
