// The sign-in service has three different "busy" answers. The creator must be told which one.
// Run: npm run test:sign-in-busy  (uses the scripts tsconfig for the server-only stub)
import assert from "node:assert/strict";
import { busyMessage, createSignInBackend, SignInBackendError } from "../lib/onlyfans-sign-in/backend";

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const scope = { creatorId: "creator-a", actor: "creator-session:" + "a".repeat(64) };
const id = "11111111-1111-1111-1111-111111111111";
const network = { accountId: null, ownerId: null, proxyUrl: null, fingerprint: "f".repeat(64) };
const backend = (response: Response) => createSignInBackend({ baseUrl: "http://sign-in.invalid", token: "t".repeat(40), fetchImpl: (async () => response.clone()) as typeof fetch });
const refusal = async (response: Response) => {
  try { await backend(response).start(scope, id, network); } catch (e) { return e as SignInBackendError; }
  assert.fail("expected a refusal");
};

(async () => {
  const capacity = await refusal(json({ ok: false, error: "capacity", retryAfter: 240 }, 429));
  assert.equal(capacity.status, 429);
  assert.match(capacity.message, /All sign-in screens are in use/);
  assert.match(capacity.message, /about 4 minutes/);

  const limit = await refusal(json({ ok: false, error: "start_limit", retryAfter: 2400 }, 429));
  assert.match(limit.message, /several times in the last hour/);
  assert.match(limit.message, /about 40 minutes/);

  assert.match((await refusal(json({ ok: false, error: "frame_limit", retryAfter: 1 }, 429))).message, /updating/);

  // An older service (no code, no wait time) keeps the generic wording; a bad body never throws.
  assert.equal((await refusal(json({ ok: false }, 429))).message, "Sign-in is busy. Please try again shortly.");
  assert.equal((await refusal(new Response("not json", { status: 429 }))).message, "Sign-in is busy. Please try again shortly.");

  assert.equal((await refusal(json({ ok: false, error: "attempt_expired" }, 410))).status, 410);
  assert.equal((await refusal(json({ ok: false, error: "attempt_unavailable" }, 404))).message, "Your sign-in expired. Start again.");
  const down = await refusal(json({ ok: false, error: "connection_unavailable" }, 503));
  assert.equal(down.status, 503);

  assert.match(busyMessage({ error: "capacity", retryAfter: 1 }), /about 1 minute\./);
  assert.match(busyMessage({ error: "capacity", retryAfter: 999999 }), /about 60 minutes/);
  assert.match(busyMessage({ error: "capacity", retryAfter: "soon" }), /shortly/);
  assert.match(busyMessage(null), /busy/);
  console.log("PASS sign-in busy messages: capacity, start limit, frame limit, unknown, expired, unavailable.");
})();
