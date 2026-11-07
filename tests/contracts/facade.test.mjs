import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { CONTROL_SCHEMA, parseControlAck } from "../../lib/onlyfans/controls.ts";
import { createControlBackend } from "../../lib/onlyfans/controls-backend.ts";
import { configuredBackendPurpose } from "../../lib/onlyfans/backend-transport.ts";
import { authorizeRead, readConversations, readConversation } from "../../lib/onlyfans/reads.ts";
import { MOXY_SCHEMA, moxyAck } from "../../lib/onlyfans/moxy.ts";

const { expected, ack } = JSON.parse(readFileSync(new URL("./fixtures/manual-queued.json", import.meta.url), "utf8"));
const command = { ...expected, actor: "synthetic-operator", body: "Synthetic test message" };
const operator = { operatorSession: true, agency: false, viewAs: false };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("manual acknowledgement means a queued intent, not delivery", () => {
  assert.equal(CONTROL_SCHEMA, "of-controls.v1");
  assert.deepEqual(parseControlAck(ack, expected), ack);
  assert.equal(ack.outcome, "queued");
  for (const mutation of [
    { accountId: "of-other" }, { conversationId: "of-other:42" },
    { recordedRevision: 8 }, { schemaVersion: "of-controls.v2" },
    { outcome: "sent" }, { commandKey: "b".repeat(64) }, { unexpected: true },
  ]) assert.equal(parseControlAck({ ...ack, ...mutation }, expected), null);
});

test("control request carries the exact scope and version, and writes once", async () => {
  const calls = [];
  const submit = createControlBackend({ baseUrl: "https://synthetic.invalid", token: "synthetic-token",
    fetchImpl: async (url, options) => { calls.push({ url, options }); return json(ack); } });
  const result = await submit(command);
  assert.equal(result.ok, true);
  assert.equal(result.ack.outcome, "queued");
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /accounts\/of-synthetic-a\/conversations\/of-synthetic-a%3A42$/);
  assert.equal(calls[0].options.headers["X-OnlyFans-Control-Version"], "of-controls.v1");
  assert.equal(calls[0].options.credentials, "omit");
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.expectedRevision, 7);
  assert.equal(body.commandKey, expected.commandKey);
  assert.equal(body.actor, command.actor);
});

test("stale revision, permission denial and unconfigured backend stay refusals", async () => {
  for (const [response, expectedStatus] of [
    [json({ schemaVersion: CONTROL_SCHEMA, ok: false, code: "revision_changed" }, 409), 409],
    [json({ ok: false }, 403), 403], [json({ ok: false }, 503), 503],
  ]) {
    let calls = 0;
    const submit = createControlBackend({ baseUrl: "https://synthetic.invalid", token: "synthetic-token",
      fetchImpl: async () => { calls++; return response; } });
    const result = await submit(command);
    assert.equal(calls, 1);
    assert.equal(result.ok, false);
    assert.equal(result.status, expectedStatus);
    assert.equal(result.outcome, "refused");
  }
});

test("lost, malformed or server-error acknowledgement remains unconfirmed without retry", async () => {
  const responses = [async () => { throw new Error("lost response"); },
    async () => json({ ...ack, accountId: "of-other" }), async () => json({ ok: false }, 500)];
  for (const response of responses) {
    let calls = 0;
    const submit = createControlBackend({ baseUrl: "https://synthetic.invalid", token: "synthetic-token",
      fetchImpl: async () => { calls++; return response(); } });
    const result = await submit(command);
    assert.equal(calls, 1);
    assert.equal(result.ok, false);
    assert.equal(result.outcome, "unconfirmed");
  }
});

test("read authorization precedes access; cross-account responses are refused", async () => {
  assert.equal(authorizeRead({ operatorSession: false, agency: false, viewAs: false }).status, 401);
  assert.equal(authorizeRead({ ...operator, viewAs: true }).status, 403);
  assert.equal(authorizeRead({ ...operator, agency: true }).status, 403);
  let calls = 0;
  const backend = {
    listConversations: async () => { calls++; return { ok: true, data: { items: [{ accountId: "of-other" }] } }; },
    getConversation: async () => ({ ok: true, data: { accountId: "of-other", conversationId: "other:42" } }),
  };
  const unauthorized = await readConversations({ auth: { ...operator, operatorSession: false }, backend },
    { accountId: "of-synthetic-a", cursor: null });
  assert.equal(unauthorized.status, 401);
  assert.equal(calls, 0);
  const wrongAccount = await readConversations({ auth: operator, backend }, { accountId: "of-synthetic-a", cursor: null });
  assert.equal(wrongAccount.code, "scope_violation");
  const wrongDetail = await readConversation({ auth: operator, backend },
    { accountId: "of-synthetic-a", conversationId: "of-synthetic-a:42" });
  assert.equal(wrongDetail.code, "scope_violation");
  const unavailable = await readConversations({ auth: operator, backend: null }, { accountId: "of-synthetic-a", cursor: null });
  assert.equal(unavailable.state, "unavailable");
});

test("configuration acknowledgements retain account, schema and revision checks", () => {
  const change = { expectedRevision: 3, mode: "off", settings: {} };
  const body = { ok: true, schemaVersion: MOXY_SCHEMA, accountId: "of-synthetic-a",
    moxy: { mode: "off", revision: 4, readiness: { ready: false, blockers: ["not configured"] } } };
  assert.equal(MOXY_SCHEMA, "of-configuration.v3");
  assert.equal(moxyAck(body, "of-synthetic-a", change), true);
  assert.equal(moxyAck({ ...body, accountId: "of-other" }, "of-synthetic-a", change), false);
  assert.equal(moxyAck({ ...body, schemaVersion: "of-configuration.v4" }, "of-synthetic-a", change), false);
  assert.equal(moxyAck({ ...body, moxy: { ...body.moxy, revision: 3 } }, "of-synthetic-a", change), false);
});

test("purpose credentials must be present and distinct", () => {
  const names = ["ONLYFANS_API_BASE_URL", "ONLYFANS_API_TOKEN", "ONLYFANS_CONTROL_TOKEN"];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    process.env.ONLYFANS_API_BASE_URL = "https://synthetic.invalid";
    process.env.ONLYFANS_API_TOKEN = "synthetic-read-token";
    delete process.env.ONLYFANS_CONTROL_TOKEN;
    assert.equal(configuredBackendPurpose("CONTROL"), null);
    process.env.ONLYFANS_CONTROL_TOKEN = "synthetic-read-token";
    assert.equal(configuredBackendPurpose("CONTROL"), null);
    process.env.ONLYFANS_CONTROL_TOKEN = "synthetic-control-token";
    assert.deepEqual(configuredBackendPurpose("CONTROL"), { baseUrl: "https://synthetic.invalid", token: "synthetic-control-token" });
  } finally {
    for (const name of names) previous[name] === undefined ? delete process.env[name] : process.env[name] = previous[name];
  }
});
