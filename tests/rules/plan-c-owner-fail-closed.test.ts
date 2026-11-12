/**
 * Characterization (W1 lane 1, "rules that hold" PC1; REVIEW.md invariant 6 + 7 "Isolation"): the Plan C named-owner identity
 * (lib/onlyfans/plan-c-owner-core.ts:4-18) fails closed. Only cases NOT already in tests/contracts/plan-c-owner.test.ts:
 * env unset or malformed token -> null without calling fetch; non-OK answer, uppercase/malformed UUID, timeout -> null; the raw
 * session token never leaves (the RPC gets its sha256) and the call carries a timeout signal. Fake fetch only. Mutation-proven
 * (tests/rules/mutations/W1-lib-onlyfans-plan-c/pc1-*).
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { planCOwnerActor } from "../../lib/onlyfans/plan-c-owner-core";

const TOKEN = `owner_${"1".repeat(64)}`, NAMED = "abcdef01-2345-4abc-8def-0123456789ab";
const ENV = { SUPABASE_URL: "https://supabase.fixture.invalid", SUPABASE_SERVICE_KEY: "fixture-service-key" };
function withEnv<T>(env: Partial<typeof ENV>, run: () => Promise<T>): Promise<T> {
  const saved = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY };
  for (const key of Object.keys(ENV) as Array<keyof typeof ENV>) { if (env[key] === undefined) delete process.env[key]; else process.env[key] = env[key]; }
  return run().finally(() => { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
}
function recorder(answer: () => Response | Promise<Response>) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => { calls.push({ url: String(input), init }); return answer(); }) as typeof fetch;
  return { calls, fetcher };
}

test("PC1: no RPC is made when the service env is missing or the session token is malformed", async () => {
  const { calls, fetcher } = recorder(() => Response.json(NAMED));
  for (const env of [{}, { SUPABASE_URL: ENV.SUPABASE_URL }, { SUPABASE_SERVICE_KEY: ENV.SUPABASE_SERVICE_KEY }])
    assert.equal(await withEnv(env, () => planCOwnerActor(TOKEN, fetcher)), null, `env ${JSON.stringify(Object.keys(env))}`);
  for (const token of [undefined, "", `owner_${"A".repeat(64)}`, `owner_${"1".repeat(63)}`, `owner_${"1".repeat(65)}`, `${TOKEN}\n`, `xowner_${"1".repeat(64)}`, "1".repeat(64)])
    assert.equal(await withEnv(ENV, () => planCOwnerActor(token, fetcher)), null, `token ${JSON.stringify(token)?.slice(0, 20)}`);
  assert.equal(calls.length, 0, "fetch was called without a configured service or with a malformed token");
});

test("PC1: a non-OK answer, an uppercase or malformed UUID, or a timeout yields null", async () => {
  const cases: Array<[string, () => Response | Promise<Response>]> = [
    ["500 with a valid id", () => Response.json(NAMED, { status: 500 })],
    ["404 with a valid id", () => Response.json(NAMED, { status: 404 })],
    ["uppercase uuid", () => Response.json(NAMED.toUpperCase())],
    ["uuid with braces", () => Response.json(`{${NAMED}}`)],
    ["uuid in an object", () => Response.json({ id: NAMED })],
    ["unreadable body", () => new Response("<html>", { status: 200 })],
    ["timeout", () => Promise.reject(new DOMException("The operation was aborted due to timeout", "TimeoutError"))],
  ];
  for (const [name, answer] of cases) assert.equal(await withEnv(ENV, () => planCOwnerActor(TOKEN, recorder(answer).fetcher)), null, name);
  assert.match(await withEnv(ENV, () => planCOwnerActor(TOKEN, recorder(() => Response.json(NAMED)).fetcher)) ?? "", /^op-session:[0-9a-f]{64}$/, "control: a valid id resolves");
});

test("PC1: the raw session token never leaves the server; the RPC gets its sha256 and a timeout signal", async () => {
  const { calls, fetcher } = recorder(() => Response.json(NAMED));
  await withEnv(ENV, () => planCOwnerActor(TOKEN, fetcher));
  assert.equal(calls.length, 1);
  const sent = JSON.stringify(calls[0]);
  assert.ok(!sent.includes(TOKEN.slice(6)), "the token value was sent");
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { p_session_hash: createHash("sha256").update(TOKEN).digest("hex") });
  assert.ok(calls[0].init?.signal instanceof AbortSignal, "no timeout signal on the identity RPC");
});
