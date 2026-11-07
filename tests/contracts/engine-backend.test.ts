import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createEngineStatusBackend, parseEnginePageQuery } from "../../lib/onlyfans/engine-status-backend";
import { createEngineOperatorBackend, engineOperatorEvidenceRef, ENGINE_OPERATOR_SCHEMA } from "../../lib/onlyfans/engine-operator";
import { canReconcile, needsReview, parseEngineUnresolved } from "../../lib/onlyfans/engine-unresolved";
import { agencyOnlyFansRequest } from "../../lib/onlyfans/agency-scope";
import { engineControlLabel, orderControls } from "../../lib/onlyfans/engine-controls";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));
const query = (text: string) => parseEnginePageQuery(new URLSearchParams(text));

test("page parameters are validated before they reach the backend", () => {
  assert.deepEqual(query(""), { cursor: null, limit: 20 });
  assert.deepEqual(query("limit=100&cursor=abc_-="), { cursor: "abc_-=", limit: 100 });
  for (const bad of ["limit=0", "limit=101", "limit=-1", "limit=2.5", "limit=abc", "limit=1000", "cursor=a%20b", "cursor=" + "x".repeat(513), "cursor=%2F"]) assert.equal(query(bad), null, bad);
});

test("the conversation status read sends version, cursor and limit and parses the page", async () => {
  const seen: { url: string; init?: RequestInit }[] = [];
  const read = createEngineStatusBackend({ baseUrl: "http://backend.invalid/", token: "t", fetchImpl: async (url, init) => { seen.push({ url: String(url), init }); return Response.json(fixture("engine-status-live")); } });
  const result = await read.conversation("of-a", "of-a:42", { cursor: "abc=", limit: 20 });
  assert.equal(result.ok, true);
  assert.equal(seen[0].url, "http://backend.invalid/onlyfans/api/v1/accounts/of-a/conversations/of-a%3A42/engine-status?limit=20&cursor=abc%3D");
  assert.equal(new Headers(seen[0].init?.headers).get("X-OnlyFans-Schema-Version") !== null, true);
  assert.equal(new Headers(seen[0].init?.headers).get("Authorization"), "Bearer t");
  assert.equal(seen[0].init?.redirect, "error"); assert.equal(seen[0].init?.credentials, "omit");
});

test("a different account, a missing route or a lost reply is reported, not shown as data", async () => {
  const run = (response: () => Response | Promise<Response>) => createEngineStatusBackend({ baseUrl: "http://backend.invalid", token: "t", fetchImpl: async () => response() }).conversation("of-a", "of-a:42", { cursor: null, limit: 20 });
  assert.deepEqual(await run(() => Response.json({ ...fixture("engine-status-live"), accountId: "of-b" })), { ok: false, status: 502, error: "Request status could not be read." });
  assert.equal((await run(() => new Response(null, { status: 404 }))).ok, false);
  const missing = await run(() => new Response(null, { status: 404 })); if (!missing.ok) assert.equal(missing.status, 404);
  const lost = await run(() => { throw new Error("lost"); }); if (!lost.ok) assert.equal(lost.status, 503);
  const html = await run(() => new Response("<html>", { status: 200 })); assert.equal(html.ok, false);
});

test("the account-wide read uses its own path and parses owner, next step and supported commands", async () => {
  const urls: string[] = [];
  const read = createEngineStatusBackend({ baseUrl: "http://backend.invalid", token: "t", fetchImpl: async url => { urls.push(String(url)); return Response.json(fixture("engine-unresolved-live")); } });
  const result = await read.unresolved("of-a", { cursor: null, limit: 20 });
  assert.equal(urls[0], "http://backend.invalid/onlyfans/api/v1/accounts/of-a/engine/unresolved?limit=20");
  assert.equal(result.ok, true);
  if (!result.ok || result.data.state !== "current") return assert.fail();
  const [unknown, access, held] = result.data.items;
  assert.equal(unknown.owner, "engine"); assert.equal(unknown.nextStep, "reconcile_existing_action");
  assert.equal(canReconcile(unknown), true); assert.equal(canReconcile(access), false); assert.equal(canReconcile(held), false);
  assert.equal(held.supportedActions.length, 0); assert.equal(held.fanLabel, null);
  assert.equal(needsReview(unknown), true);
  assert.equal(needsReview({ status: "completed", actionOutcome: "unknown" }), true);
  assert.equal(needsReview({ status: "completed", actionOutcome: "accepted" }), false);
});

test("the account-wide parser refuses another account, a foreign conversation and an unsupported command", () => {
  const view = fixture("engine-unresolved-live");
  assert.equal(parseEngineUnresolved(view, "of-b"), null);
  assert.equal(parseEngineUnresolved({ ...view, items: [{ ...view.items[0], conversationId: "of-b:42" }] }, "of-a"), null);
  assert.equal(parseEngineUnresolved({ ...view, items: [{ ...view.items[0], supportedActions: ["delete_everything"] }] }, "of-a"), null);
  assert.equal(parseEngineUnresolved({ ...view, items: [view.items[0], view.items[0]] }, "of-a"), null);
  assert.equal(parseEngineUnresolved({ ...view, environment: "staging" }, "of-a"), null);
  assert.equal(parseEngineUnresolved({ schemaVersion: "of-engine.v1", state: "unavailable" }, "of-a")?.state, "unavailable");
});

const command = { accountId: "of-a", conversationId: "of-a:42", requestId: "0a1b2c3d-1111-4222-8333-444455556661", action: "complete" as const,
  expectedRevision: 3, commandKey: "a".repeat(64), actor: "op-session:" + "b".repeat(64), note: "Checked the receipt" };
const ack = (action: string, status: string, revision = 4) => ({ schemaVersion: ENGINE_OPERATOR_SCHEMA, ok: true, accountId: command.accountId, conversationId: command.conversationId,
  requestId: command.requestId, action, commandKey: command.commandKey, status, owner: "engine", nextStep: "none", recordedRevision: revision, replayed: false });

test("operator evidence is synthetic only in simulation and a real operator string otherwise", async () => {
  assert.equal(engineOperatorEvidenceRef("simulation", "n"), "synthetic:operator:n");
  assert.equal(engineOperatorEvidenceRef("live", "n"), "operator:live:n");
  assert.equal(engineOperatorEvidenceRef("fansapi", "n"), "operator:fansapi:n");
  const note = "x".repeat(108);
  for (const environment of ["simulation", "live", "fansapi"] as const) assert.ok(engineOperatorEvidenceRef(environment, note).length <= 128);
  const bodies: Record<string, unknown>[] = [];
  const backend = createEngineOperatorBackend({ baseUrl: "http://backend.invalid", token: "t", fetchImpl: async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return Response.json(ack("complete", "completed")); } });
  assert.deepEqual(await backend(command), { ok: true });
  assert.deepEqual(await backend({ ...command, environment: "simulation" }), { ok: true });
  assert.deepEqual(await backend({ ...command, environment: "live" }), { ok: true });
  assert.deepEqual(await backend({ ...command, environment: "fansapi" }), { ok: true });
  assert.deepEqual(bodies.map(body => body.evidenceRef), ["synthetic:operator:Checked the receipt", "synthetic:operator:Checked the receipt", "operator:live:Checked the receipt", "operator:fansapi:Checked the receipt"]);
  assert.equal(bodies.every(body => !JSON.stringify(body).includes("synthetic:") || body.evidenceRef === "synthetic:operator:Checked the receipt"), true);
  const handover: Record<string, unknown>[] = [];
  await createEngineOperatorBackend({ baseUrl: "http://backend.invalid", token: "t", fetchImpl: async (_u, init) => { handover.push(JSON.parse(String(init?.body))); return Response.json(ack("request_handover", "handover_pending")); } })({ ...command, action: "request_handover", environment: "live" });
  assert.equal("evidenceRef" in handover[0], false);
});

test("mark_reconciled is a typed command that needs a note and never claims success from a bad reply", async () => {
  const sent: Record<string, unknown>[] = [];
  const ok = createEngineOperatorBackend({ baseUrl: "http://backend.invalid", token: "t", fetchImpl: async (_u, init) => { sent.push(JSON.parse(String(init?.body))); return Response.json(ack("mark_reconciled", "waiting_provider")); } });
  assert.deepEqual(await ok({ ...command, action: "mark_reconciled", environment: "live" }), { ok: true });
  assert.equal(sent[0].action, "mark_reconciled"); assert.equal(sent[0].evidenceRef, "operator:live:Checked the receipt");
  const wrongRevision = createEngineOperatorBackend({ baseUrl: "http://backend.invalid", token: "t", fetchImpl: async () => Response.json(ack("mark_reconciled", "waiting_provider", 9)) });
  const result = await wrongRevision({ ...command, action: "mark_reconciled" }); assert.equal(result.ok, false);
  const refused = createEngineOperatorBackend({ baseUrl: "http://backend.invalid", token: "t", fetchImpl: async () => new Response(null, { status: 400 }) });
  const rejected = await refused({ ...command, action: "mark_reconciled" }); assert.equal(rejected.ok === false && rejected.outcome, "refused");
});

test("the new read routes are open to the team and the catalogue decision stays manager only", () => {
  const account = "/api/onlyfans/accounts/of-a";
  for (const path of [`${account}/conversations/of-a%3A42/engine-status`, `${account}/engine/unresolved`, `${account}/engine/catalogue`]) {
    assert.equal(agencyOnlyFansRequest(path, "GET", false, false, false), true, path);
    assert.equal(agencyOnlyFansRequest(path, "POST", false, false, true), false, path);
  }
  assert.equal(agencyOnlyFansRequest(`${account}/engine/other`, "GET", false, false, false), false);
  assert.equal(agencyOnlyFansRequest(`${account}/conversations/of-a%3A42/engine-status/extra`, "GET", false, false, false), false);
  const decide = "/api/onlyfans-content/accounts/of-a/engine-catalogue/11";
  assert.equal(agencyOnlyFansRequest(decide, "POST", false, true, false), true);
  assert.equal(agencyOnlyFansRequest(decide, "POST", false, false, true), false);
  assert.equal(agencyOnlyFansRequest(decide, "POST", false, false, false), false);
});

test("takeover, hand back and resume share one vocabulary and one order", () => {
  assert.deepEqual(["request_takeover", "release_takeover", "resume_automation", "pause_automation"].map(a => engineControlLabel(a as never, true)),
    ["Take over", "Hand back to engine", "Resume engine replies", "Pause engine replies"]);
  assert.deepEqual(["request_takeover", "release_takeover", "resume_automation", "pause_automation"].map(a => engineControlLabel(a as never, false)),
    ["Take over", "Hand back to AI", "Resume AI", "Pause AI"]);
  assert.deepEqual(orderControls([{ action: "pause_automation" }, { action: "resolve_delivery_evidence" }, { action: "resume_automation" }, { action: "release_takeover" }, { action: "request_takeover" }]).map(e => e.action),
    ["request_takeover", "release_takeover", "resume_automation", "pause_automation", "resolve_delivery_evidence"]);
});
