// KNOWN RED (W3 api-onlyfans-plus7 findings C-C1 security, C-C2 data-risk, C-C5 = C-S6 D7, F18 bug; REVIEW.md inv 7 "Unconfirmed is not
// refused", "Isolation"). Drives the real POST app/api/onlyfans-connections/creators/[creatorId]/sign-in/route.ts as the internal operator
// (tests/helpers/W3-api-onlyfans-plus7-harness.ts: route.ts, next/headers, server-only, supabase-service mocked). Real here:
// connection-creators.ts (connectionSignInCommand, resolveConnectionCreator over the fake db below), normalizeProxyInput, the real
// sign-in backend (https://signin.invalid/v1/attempts) and the real connection backend (https://backend.invalid/onlyfans/connection/v1)
// over the fake wire, and the real managed-proxy broker client (lib/onlyfans-managed-proxy, ONLYFANS_MANAGED_PROXY_BASE_URL pointed at
// https://backend.invalid/managed-proxy, which assigns a fixed synthetic proxy on a public documentation address, 203.0.113.10). Only bypass
// besides the harness: the creator row comes from an in-memory serviceClient (one `clones` row whose intake names the expected handle).
// C-C1: sign-in/route.ts:91-95 accepts a raw `connection.proxyUrl` (normalizeProxyInput, proxy.ts:16,:48, only checks shape) and hands it
//       to backend.start as the sign-in browser's egress (and :108 as the account's initialProxyUrl). Loopback, RFC1918 and link-local
//       (cloud metadata) hosts pass. Either endorsed fix turns these reds green: (a) delete the raw-proxy branch so a new connection always
//       goes through the managed broker (any raw proxyUrl start then refused 400 before a start), or (b) keep it but refuse loopback/
//       private/link-local/metadata hosts with a 400 before any start. The controls use the managed-broker path for first logins, so they
//       stay green under both fixes (a public raw host is deliberately NOT pinned as accepted).
// C-C2: on reconnect (connection.accountId set) the handle check at :105 runs only when accountId === null, and the owner check at :107 only
//       when the saved ownerId is not null (backend.ts:25 accepts null). A capture of a different OnlyFans account is then enrolled under this
//       creator. Fixed looks like a 409 and no enrollment when the signed-in handle differs from creator.expectedHandle, whatever the accountId,
//       and no owner-less reconnect skipping the owner check.
// C-C5: :110 `connectionRefusal(result.status, result.error)` hardcodes outcome "refused" (lib/onlyfans-connections/route.ts:10), so the
//       connection backend's own `outcome: "unconfirmed"` (backend.ts:17, an enroll answered 5xx/lost) reaches the browser as refused. Fixed
//       looks like the backend's outcome forwarded (502 stays "unconfirmed"; 400 stays "refused").
// F18:  lib/onlyfans-connections/backend.ts:13 keeps an upstream 401/403 (the connection service rejected the dashboard's CONNECTION
//       credential) as the result status, and the routes relay it with connectionRefusal: sign-in :86 (captureContext), :110 (enroll) and
//       accounts/[accountId]/capture-from-curl/route.ts:21 (also driven here, same harness, real route). The browser reads 401/403 as its
//       own session ending: the sign-in POSTs go through components/creator-platforms/HostedConnect.tsx:30-31 ([401,403] -> setSessionLost
//       + sessionMessage, passed by AdminOnlyFansSignIn.tsx:81 as "Sign in to your dashboard again."), and the curl POST through
//       ConnectionEditor.tsx:99-101 "Sign in again.". (AdminOnlyFansSignIn.tsx:31 is the ?enrollments=1 GET, whose backend maps every
//       failure to 503 at backend.ts:40, so it never sees this. sign-in/route.ts:36, the ?proxy=1 GET, also relays the 401/403, but its
//       caller ProxyDetails.tsx:21 has no 401/403 case: relayed, not misread; not asserted here.)
//       Fixed looks like upstream 401/403 answered as any status other than 401/403 (e.g. 503), because the browser reserves 401/403 for
//       the dashboard session. Control: an upstream 404 on captureContext stays the 404 refusal (not a session status).
// Team's Claude owns the fixes. Not wired into npm scripts or init.sh. Runs with plain commands:
//   node --import tsx --test --test-name-pattern='^control' tests/known-red/W3-api-onlyfans-plus7-sign-in.test.ts   (green)
//   node --import tsx --test --test-skip-pattern='^control' tests/known-red/W3-api-onlyfans-plus7-sign-in.test.ts   (red, ERR_ASSERTION)
// Synthetic values only. x_bc and the managed-proxy token are generated per run (randomUUID), so nothing session-header or token
// shaped is committed; the browser session's auth_id cookie must equal the public owner id (browser-connection.ts:25), not a secret.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test, { beforeEach } from "node:test";
import { BACKEND, SIGNIN, call, calls, ensureModuleMocks, reset, state, upstream, type Call } from "../helpers/W3-api-onlyfans-plus7-harness";

const ROUTE = "onlyfans-connections/creators/[creatorId]/sign-in";
const CREATOR = "creator-a", EXPECTED = "expected_handle", ATTEMPT = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", START_KEY = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const fingerprint = (proxy: string | null) => createHash("sha256").update("twin-capture-network.v1\0" + (proxy ?? "")).digest("hex");
const SAVED_PROXY = "http://proxy.example:8080", XBC = `b-${randomUUID()}`;
const BROKER = "/managed-proxy", MANAGED = "http://synthetic:synthetic@203.0.113.10:8080/";
const managed = { accountId: null, proxyUrl: null, managedProxy: { countryCode: "US", handle: EXPECTED } };

/** A browser session that passes lib/creator-platforms/browser-connection.ts validBrowserSession for `ownerId`. */
function browserSession(ownerId: number) {
  const now = Date.now();
  return { ownerId, expiresAt: new Date(now + 3_600_000).toISOString(), browser: { schemaVersion: "of-browser.v1",
    headers: { user_id: String(ownerId), user_agent: "synthetic-agent", x_bc: XBC, x_of_rev: "synthetic-rev", x_hash: null },
    cookies: [{ name: "auth_id", value: String(ownerId), domain: ".onlyfans.com", path: "/" }], staticParam: "synthetic",
    samples: [{ url: "https://onlyfans.com/api2/v2/users/me", sign: `p:${"a".repeat(40)}:1:s`, time: String(now) },
      { url: "https://onlyfans.com/api2/v2/users/me", sign: `p:${"b".repeat(40)}:2:s`, time: String(now) }] } };
}
const attempt = (phase = "ready", enrollmentId: string | null = null) =>
  ({ id: ATTEMPT, phase, handle: null, expiresAt: new Date(Date.now() + 900_000).toISOString(), enrollmentId, width: 432, height: 720 });

type Wire = { context: { accountId: string | null; ownerId: number | null; proxyUrl: string | null }; contextStatus: number;
  capture: { handle: string; ownerId: number; proxy: string | null }; enroll: number; curl: number };
let wire: Wire;
function answer(c: Call): Response {
  const p = c.path;
  if (c.url.startsWith(SIGNIN)) {
    if (c.method === "POST" && p === "/v1/attempts") return Response.json({ ok: true, attempt: attempt() });
    if (c.method === "GET" && p === `/v1/attempts/${ATTEMPT}`) return Response.json({ ok: true, attempt: attempt() });
    if (c.method === "GET" && p === `/v1/attempts/${ATTEMPT}/capture`) return Response.json({ ok: true, capture: { profileId: CREATOR, handle: wire.capture.handle,
      session: { ...browserSession(wire.capture.ownerId), networkFingerprint: fingerprint(wire.capture.proxy) } } });
    if (c.method === "POST" && p === `/v1/attempts/${ATTEMPT}/acknowledge`) return Response.json({ ok: true, attempt: attempt("submitted", "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee") });
  }
  if (c.method === "POST" && p === `${BROKER}/v1/assign`) return Response.json({ ok: true, proxyUrl: MANAGED });
  if (c.method === "POST" && p === "/onlyfans/connection/v1/capture-context") {
    if (wire.contextStatus !== 200) return Response.json({ ok: false }, { status: wire.contextStatus });
    const ctx = wire.context;
    return Response.json({ ok: true, context: { ...ctx, accountId: (c.body as { accountId: string | null }).accountId, fingerprint: fingerprint(ctx.proxyUrl) } });
  }
  if (c.method === "POST" && p === "/onlyfans/connection/v1/accounts/of-123/capture-from-curl") return Response.json({ ok: false }, { status: wire.curl });
  if (c.method === "POST" && p === "/onlyfans/connection/v1/enrollments") return wire.enroll === 200
    ? Response.json({ ok: true, enrollment: { id: "enr-1", status: "pending", accountId: null, error: null, expiresAt: new Date(Date.now() + 900_000).toISOString() } })
    : Response.json({ ok: false }, { status: wire.enroll });
  return Response.json({ ok: false }, { status: 404 });
}
const fakeDb = { from: (table: string) => {
  assert.equal(table, "clones");
  const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { id: CREATOR, name: "Synthetic Creator", intake: { onlyfans_connection: { handle: EXPECTED } } }, error: null }) };
  return q;
} };

const post = (body: unknown) => call(ROUTE, { creatorId: CREATOR }, { body });
const startWith = (connection: unknown) => post({ action: "start", profileId: CREATOR, accountId: null, startKey: START_KEY, connection });
const start = (proxyUrl: string) => startWith({ accountId: null, proxyUrl });
const confirm = (connection: { accountId: string | null; proxyUrl: string | null }) => post({ action: "confirm", profileId: CREATOR, attempt: ATTEMPT, connection });
const starts = () => calls.filter(c => c.url.startsWith(SIGNIN) && c.method === "POST" && c.path === "/v1/attempts").length;
const enrolls = () => calls.filter(c => c.path === "/onlyfans/connection/v1/enrollments").length;
const contexts = () => calls.filter(c => c.path === "/onlyfans/connection/v1/capture-context").length;
const curls = () => calls.filter(c => c.path === "/onlyfans/connection/v1/accounts/of-123/capture-from-curl").length;
const paste = () => call("onlyfans-connections/accounts/[accountId]/capture-from-curl", { accountId: "of-123" },
  { body: { curl: "curl 'https://example.invalid/api2/v2/users/me' -H 'synthetic: 1'" } });
const SESSION = [401, 403];
const firstLogin = managed;
const reconnect = { accountId: "of-123", proxyUrl: null };

if (ensureModuleMocks(import.meta.url, { controls: 4, rest: 11 }, () => {
  // Owned by the harness's env save/restore (ONLYFANS_*). Generated per run; the token only needs the broker client's 32-char minimum.
  process.env.ONLYFANS_MANAGED_PROXY_BASE_URL = BACKEND + BROKER;
  process.env.ONLYFANS_MANAGED_PROXY_TOKEN = `t-${randomUUID()}`;
})) {
  beforeEach(() => {
    reset(); state.db = fakeDb;
    wire = { context: { accountId: null, ownerId: null, proxyUrl: null }, contextStatus: 200, capture: { handle: EXPECTED, ownerId: 123, proxy: MANAGED },
      enroll: 200, curl: 200 };
    upstream(answer);
  });

  test("control: a managed-proxy start reaches the sign-in service once, through the broker-assigned proxy, and answers 200", async () => {
    const response = await startWith(managed);
    assert.equal(response.status, 200);
    assert.equal(starts(), 1, "one sign-in start");
    const sent = calls.find(c => c.url.startsWith(SIGNIN) && c.path === "/v1/attempts")!.body as { network: { proxyUrl: string } };
    assert.equal(sent.network.proxyUrl, MANAGED);
  });

  test("control: a first-login enrollment refused 400 upstream answers outcome refused", async () => {
    wire.enroll = 400;
    const response = await confirm(firstLogin);
    assert.equal(enrolls(), 1, "the enrollment reached the connection backend once");
    assert.equal(response.status, 400);
    assert.equal((await response.json() as { outcome?: unknown }).outcome, "refused");
  });

  test("control: a reconnect whose saved owner differs from the signed-in owner is refused 409 with no enrollment", async () => {
    wire.context = { accountId: "of-123", ownerId: 123, proxyUrl: SAVED_PROXY };
    wire.capture = { handle: EXPECTED, ownerId: 999, proxy: SAVED_PROXY };
    const response = await confirm(reconnect);
    assert.equal(response.status, 409);
    assert.equal(enrolls(), 0);
  });

  test("control: an upstream 404 on captureContext answers the 404 refusal (not a session status), before any sign-in start", async () => {
    wire.contextStatus = 404;
    const response = await startWith(managed);
    assert.equal(contexts(), 1, "captureContext reached the connection backend once");
    assert.equal(starts(), 0);
    assert.equal(response.status, 404);
  });

  for (const host of ["127.0.0.1", "10.0.0.5", "169.254.169.254"]) {
    test(`C-C1: a raw proxyUrl on ${host} is refused 400 before any sign-in start`, async () => {
      const response = await start(`http://${host}:8080`);
      assert.equal(starts(), 0, `the sign-in browser was started with egress through ${host}`);
      assert.equal(response.status, 400);
    });
  }

  test("C-C2: a reconnect with no saved owner refuses a capture whose handle is not the creator's (409, no enrollment)", async () => {
    wire.context = { accountId: "of-123", ownerId: null, proxyUrl: SAVED_PROXY };
    wire.capture = { handle: "someone_else", ownerId: 999, proxy: SAVED_PROXY };
    const response = await confirm(reconnect);
    assert.equal(enrolls(), 0, "a different OnlyFans account was enrolled under this creator");
    assert.equal(response.status, 409);
  });

  test("C-C5: an enrollment whose outcome the backend could not confirm (5xx) answers outcome unconfirmed, not refused", async () => {
    wire.enroll = 500;
    const response = await confirm(firstLogin);
    assert.equal(enrolls(), 1, "the enrollment reached the connection backend once");
    assert.equal(response.status, 502);
    assert.equal((await response.json() as { outcome?: unknown }).outcome, "unconfirmed", "an unconfirmed enrollment was reported as refused");
  });

  for (const upstreamStatus of SESSION) {
    test(`F18: captureContext answered ${upstreamStatus} upstream is not relayed as the browser's own session status`, async () => {
      wire.contextStatus = upstreamStatus;
      const response = await startWith(managed);
      assert.equal(contexts(), 1, "captureContext reached the connection backend once");
      assert.equal(SESSION.includes(response.status), false, `the connection service's ${upstreamStatus} was answered ${response.status}, which the browser reads as "sign in to your dashboard again"`);
    });

    test(`F18: an enrollment answered ${upstreamStatus} upstream is not relayed as the browser's own session status`, async () => {
      wire.enroll = upstreamStatus;
      const response = await confirm(firstLogin);
      assert.equal(enrolls(), 1, "the enrollment reached the connection backend once");
      assert.equal(SESSION.includes(response.status), false, `the connection service's ${upstreamStatus} was answered ${response.status}, which the browser reads as "sign in to your dashboard again"`);
    });

    test(`F18: capture-from-curl answered ${upstreamStatus} upstream is not relayed as the browser's own session status`, async () => {
      wire.curl = upstreamStatus;
      const response = await paste();
      assert.equal(curls(), 1, "the conversion reached the connection backend once");
      assert.equal(SESSION.includes(response.status), false, `the connection service's ${upstreamStatus} was answered ${response.status}, which the browser reads as "sign in again"`);
    });
  }
}
