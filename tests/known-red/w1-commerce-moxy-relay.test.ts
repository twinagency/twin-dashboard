// KNOWN RED (REVIEW.md inv 7 "No send, no auto-retry", inv 6 "Secrets"; W1 lane 3 findings F4, F5).
// F4: the Moxy PUT (moxy-backend.ts:19) carries no idempotency key, so a user retry after a lost response is a new write and
//     a committed-then-409 reads "refused". Fixed looks like a hashed commandKey (64 hex) or a kept requestId in the body.
//     The test calls save twice with identical inputs and needs the same key both times (a per-call random key stays red),
//     then saves a different change and needs a different key (a constant key stays red).
//     The real property is route-level reuse across a user retry (moxy/route.ts, lane 6); if the fix makes the key a
//     caller argument of save(), this test needs a TEST-CHANGE to pass it.
// F5: on 400/401/403/404/409/413 the raw upstream `error` text (<=2000 chars) is returned to the browser (:24, shown in
//     MoxyControls.tsx:84); on success the raw ack is returned unprojected (`ack: raw`, :21), extra upstream keys included.
// F6 (settings echo in the ack) was downgraded to low and is not tested: revision+1 under the expectedRevision CAS is
//     evidence the command applied; whether the ack must echo settings is a backend contract question.
// Team's Claude owns the fix. Not wired into npm scripts; init.sh does not list it yet (lane 10/orchestrator wires it).
import assert from "node:assert/strict";
import test from "node:test";
import { createMoxyBackend } from "../../lib/onlyfans/moxy-backend";
import { MOXY_SCHEMA, moxyAck, starterSettings, type MoxyChange } from "../../lib/onlyfans/moxy";

const change: MoxyChange = { expectedRevision: 4, mode: "off", settings: starterSettings("synthetic") };
const ack = (moxy: Record<string, unknown> = {}, top: Record<string, unknown> = {}) => ({ ok: true, schemaVersion: MOXY_SCHEMA, accountId: "of-a", ...top,
  moxy: { engine: "moxy", moxySelected: true, mode: change.mode, revision: change.expectedRevision + 1, readiness: { ready: false, blockers: ["synthetic_blocker"] },
    settings: change.settings, decisions: [], ...moxy } });
function save(status: number, body: unknown, sent: MoxyChange = change) {
  const bodies: unknown[] = [];
  const fetchImpl = (async (_: RequestInfo | URL, init?: RequestInit) => { bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }) as typeof fetch;
  return createMoxyBackend({ baseUrl: "https://backend.invalid", token: "synthetic-token", fetchImpl }).save("of-a", sent, "operator:synthetic")
    .then(result => ({ result, bodies }));
}

test("control: a matching ack is ok and a 409 without an error field is refused with fixed text", async () => {
  const saved = await save(200, ack());
  assert.equal(saved.result.ok, true); assert.equal(saved.bodies.length, 1);
  assert.equal(moxyAck(ack(), "of-a", change), true);
  const refused = await save(409, {});
  assert.equal(refused.result.ok, false);
  if (!refused.result.ok) { assert.equal(refused.result.outcome, "refused"); assert.equal(refused.result.error, "The change was not accepted. Refresh and review readiness."); }
});

const key = (body: Record<string, unknown>) => typeof body.commandKey === "string" && /^[a-f0-9]{64}$/.test(body.commandKey) ? body.commandKey
  : typeof body.requestId === "string" && body.requestId.length > 0 ? body.requestId : null;

test("F4: the Moxy PUT carries an idempotency key a user retry can reuse", async () => {
  const other: MoxyChange = { ...change, expectedRevision: 5 };
  const bodies = [...(await save(200, ack())).bodies, ...(await save(200, ack())).bodies,
    ...(await save(200, ack({ revision: other.expectedRevision + 1 }), other)).bodies] as Record<string, unknown>[];
  assert.equal(bodies.length, 3);
  for (const body of bodies) assert.notEqual(key(body), null, `PUT body keys ${Object.keys(body).sort().join(",")} carry no commandKey or requestId`);
  assert.equal(key(bodies[0]), key(bodies[1]), "a retry of the same change must carry the same key");
  assert.notEqual(key(bodies[2]), key(bodies[0]), "a different change must carry a different key");
});

test("F5: upstream refusal text never reaches the browser", async () => {
  const { result } = await save(409, { error: "synthetic upstream diagnostic: relation x" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.includes("synthetic upstream diagnostic"), false, "raw upstream error text was passed through");
});

test("F5: a successful save returns only checked fields, not the raw upstream ack", async () => {
  const { result } = await save(200, ack({}, { internalDebug: "synthetic" }));
  assert.equal(!result.ok || !JSON.stringify(result).includes("internalDebug"), true, "unchecked upstream key reached the result (refusal or projection both fix it)");
});
