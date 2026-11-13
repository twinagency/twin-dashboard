// Regression guard (G25): was KNOWN RED tests/known-red/W4-lib-onlyfans-preview-2-plus2-sign-in-errors.test.ts (origin/jaka/fix-sweep-20261112), fixed in this PR (lib/onlyfans-sign-in/backend.ts). Promoted: F1 (capture, status, transport). Left red at the source (not in this file): F16, F17. Original header below.
/**
 * KNOWN RED (W4 lib-onlyfans-preview-2-plus2 F1, F16, F17; REVIEW inv 6 "session data never reaches errors or the
 * browser", inv 7 + known failure mode "OF session expiry handled by a retry storm instead of a re-auth signal").
 * Driven through the real createSignInBackend over a fake fetch at the wire (base URL https://signin.invalid).
 *   F1  lib/onlyfans-sign-in/backend.ts:36,45 call `response.json()` raw and :28 lets a transport rejection escape, so a
 *       2xx body that is not JSON rejects with a SyntaxError that quotes ~10 chars of the body (the capture body is the
 *       OF session), and `fetch failed ...` rejects as a raw TypeError. The creator route forwards any Error.message
 *       (app/creator-auth/platforms/onlyfans/sign-in/route.ts:24,86; route half is W5 app-creator-auth).
 *       Fixed looks like: every failure is a SignInBackendError with fixed copy that quotes nothing from the wire.
 *   F16 backend.ts:30 maps 404 to 410 "Your sign-in expired. Start again." for every call, including start() which has
 *       no attempt yet: a wrong base path tells the user to start again forever.
 *       Fixed looks like: 404 on start reads as unavailable/misconfigured, never "expired".
 *   F17 backend.ts:32 maps upstream 401/403 (service credential refused) to the same retryable 503 "try again" as a
 *       transient 500, so HostedConnect polls forever. Fixed looks like: a distinct, non-retryable error whose STATUS
 *       differs from the 500 case (copy alone does not stop the poll) and is still not 401/403 (the browser reads those
 *       as its own session lost). Measured at the status the ROUTE sends: `error instanceof SignInBackendError ?
 *       error.status : 503` (app/creator-auth/platforms/onlyfans/sign-in/route.ts:24,86), so a fix that throws a plain
 *       Error stays red. The UI half (HostedConnect treating that status as terminal) is lane ui-clone-5-plus3's (W8).
 * `server-only` is not installed; it is stubbed by a resolution hook only for the dynamic import of backend.ts.
 * Team's Claude owns the fix. Not wired into npm scripts or init.sh.
 * Run: nice -n 10 node --import tsx --test --test-name-pattern='^control' <this file>   (green)
 *      nice -n 10 node --import tsx --test --test-skip-pattern='^control' <this file>   (red, ERR_ASSERTION)
 */
import assert from "node:assert/strict";
import { Module } from "node:module";
import test from "node:test";

type Resolver = { _resolveFilename: (request: string, ...rest: unknown[]) => string; _cache: Record<string, unknown> };
async function loadBackend() {
  const resolver = Module as unknown as Resolver;
  const original = resolver._resolveFilename;
  resolver._resolveFilename = function (this: unknown, request: string, ...rest: unknown[]) {
    return request === "server-only" ? "server-only-stub" : original.call(this, request, ...rest);
  };
  resolver._cache["server-only-stub"] = { id: "server-only-stub", filename: "server-only-stub", loaded: true, exports: {} };
  try {
    return await import("../../lib/onlyfans-sign-in/backend");
  } finally {
    resolver._resolveFilename = original;
  }
}

const SCOPE = { creatorId: "creator-synthetic", actor: "actor-synthetic" };
const ATTEMPT_ID = "0a1b2c3d-1111-4222-8333-444455556661";
const NETWORK = { accountId: null, ownerId: null, proxyUrl: null, fingerprint: "a".repeat(64) };
const MARKER = "ZQ7XK9synthetic-marker-WV3PL8";

function answering(status: number, body: string, contentType = "application/json") {
  return (async () => new Response(body, { status, headers: { "Content-Type": contentType } })) as typeof fetch;
}
async function backendWith(fetchImpl: typeof fetch) {
  const { createSignInBackend } = await loadBackend();
  return createSignInBackend({ baseUrl: "https://signin.invalid", token: "synthetic-signin-token-marker", fetchImpl });
}
async function rejection(run: () => Promise<unknown>): Promise<unknown> {
  try { await run(); } catch (error) { return error; }
  assert.fail("expected the call to reject");
}
/** Every 6-char window of the marker; a hit means the message quotes the wire. */
function quotes(message: string, secret: string): string | null {
  for (let i = 0; i + 6 <= secret.length; i++) if (message.includes(secret.slice(i, i + 6))) return secret.slice(i, i + 6);
  return null;
}
async function assertFixedCopy(error: unknown, secret: string) {
  const { SignInBackendError } = await loadBackend();
  assert.ok(error instanceof SignInBackendError, `expected a SignInBackendError, got ${(error as Error)?.name}`);
  assert.equal(quotes((error as Error).message, secret), null, "the error message must not quote the upstream body or transport error");
}

test("control: a valid attempt body parses through status()", async () => {
  const attempt = { id: ATTEMPT_ID, phase: "waiting", handle: null, expiresAt: new Date(Date.now() + 600_000).toISOString(),
    enrollmentId: null, width: 432, height: 720 };
  const backend = await backendWith(answering(200, JSON.stringify({ ok: true, attempt })));
  const value = await backend.status(SCOPE, ATTEMPT_ID);
  assert.equal(value.id, ATTEMPT_ID);
  assert.equal(value.phase, "waiting");
});

test("control: an upstream 429 is a SignInBackendError 429", async () => {
  const { SignInBackendError } = await loadBackend();
  const backend = await backendWith(answering(429, JSON.stringify({ error: "capacity", retryAfter: 30 })));
  const error = await rejection(() => backend.status(SCOPE, ATTEMPT_ID));
  assert.ok(error instanceof SignInBackendError);
  assert.equal((error as InstanceType<typeof SignInBackendError>).status, 429);
});

test("control: a 404 on status(scope, attemptId) reads as expired (410)", async () => {
  const { SignInBackendError } = await loadBackend();
  const backend = await backendWith(answering(404, JSON.stringify({ error: "not_found" })));
  const error = await rejection(() => backend.status(SCOPE, ATTEMPT_ID));
  assert.ok(error instanceof SignInBackendError);
  assert.equal((error as InstanceType<typeof SignInBackendError>).status, 410);
});

test("F1: a 2xx capture body that is not JSON rejects with fixed copy, never quoting the body", async () => {
  const backend = await backendWith(answering(200, `{"ok":true,"capture":{"session":${MARKER}}}`));
  await assertFixedCopy(await rejection(() => backend.capture(SCOPE, ATTEMPT_ID)), MARKER);
});

test("F1: a 2xx status body that is not JSON rejects with fixed copy, never quoting the body", async () => {
  const backend = await backendWith(answering(200, MARKER));
  await assertFixedCopy(await rejection(() => backend.status(SCOPE, ATTEMPT_ID)), MARKER);
});

test("F1: a transport rejection rejects with fixed copy, never echoing the transport error", async () => {
  const failing = (async () => { throw new TypeError(`fetch failed ${MARKER}`); }) as typeof fetch;
  const backend = await backendWith(failing);
  await assertFixedCopy(await rejection(() => backend.status(SCOPE, ATTEMPT_ID)), MARKER);
});
