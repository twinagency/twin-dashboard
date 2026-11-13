// G05 (promoted from tests/known-red/W3-api-onlyfans-plus7-message-media.test.ts, B-C5 only; B-C4 stays in the corpus).
// Was KNOWN RED (W3 api-onlyfans-plus7 findings B-C5 security(low) = B-S4, and B-C4 bug; REVIEW.md inv 7 "Isolation").
// Drives the real GET app/api/onlyfans-content/accounts/[accountId]/message-media/[fanId]/[messageId]/[mediaId]/[variant]/route.ts as the
// internal operator (tests/helpers/W3-api-onlyfans-plus7-harness.ts: route.ts, next/headers, server-only, supabase-service mocked; the
// route's own createBackendTransport runs over the fake wire at https://backend.invalid). No extra module mocks.
// B-C5: the route checks only the status and the Content-Type (:17-18) and streams the body (:19). Unlike the vault stream
//       (vault-media-backend.ts:50, X-OnlyFans-Account-Id / X-OnlyFans-Media-Id echo checks), an upstream answer that says it is ANOTHER
//       account's media is served to this account's viewer. Fixed looks like the account (and media) echo checked before any byte is
//       served and a non-2xx refusal without the image bytes otherwise (the vault stream answers 503; the exact status is not pinned).
// B-C4: createBackendTransport (backend-transport.ts:7) attaches AbortSignal.timeout(8000) to the fetch, and the route hands that response
//       body to the browser (:19), so the 8 s budget also covers the body download: any media taking longer than 8 s is cut mid-stream.
//       Deterministic here: for that one test AbortSignal.timeout is replaced by an AbortController armed with setTimeout, setTimeout is
//       mocked (node:test mock.timers), and the fake upstream body errors when its fetch signal aborts, as undici's does. The test ticks
//       9 s after the headers arrived, then delivers the rest. Fixed looks like the timeout cleared once headers arrive (vault-media-backend
//       stream() :42,:46 does exactly that), so the whole body is served.
// Team's Claude owns the fixes. Not wired into npm scripts or init.sh. Runs with plain commands:
//   node --import tsx --test --test-name-pattern='^control' tests/known-red/W3-api-onlyfans-plus7-message-media.test.ts   (green)
//   node --import tsx --test --test-skip-pattern='^control' tests/known-red/W3-api-onlyfans-plus7-message-media.test.ts   (red, ERR_ASSERTION)
// Synthetic values only.
import assert from "node:assert/strict";
import test, { beforeEach, type TestContext } from "node:test";
import { BACKEND, call, calls, ensureModuleMocks, reset, upstream, type Call } from "../helpers/W3-api-onlyfans-plus7-harness";

const ROUTE = "onlyfans-content/accounts/[accountId]/message-media/[fanId]/[messageId]/[mediaId]/[variant]";
const params = (variant: "preview" | "file") => ({ accountId: "of-a", fanId: "11", messageId: "22", mediaId: "33", variant });
const JPEG = new Uint8Array([255, 216, 255, 224, 1, 2, 3, 255, 217]);
const image = (headers: Record<string, string>) => () => new Response(JPEG, { status: 200, headers: { "content-type": "image/jpeg", ...headers } });
const echo = { "X-OnlyFans-Account-Id": "of-a", "X-OnlyFans-Media-Id": "33" };

/** A video body: `first` now, `rest` when `finish()` is called; errors like undici's body when the fetch signal aborts. */
function slowVideo(first: Uint8Array, rest: Uint8Array) {
  let finish = () => {};
  const responder = (c: Call) => {
    const body = new ReadableStream<Uint8Array>({ start(out) {
      out.enqueue(first);
      let done = false;
      c.signal?.addEventListener("abort", () => { if (!done) { done = true; out.error(c.signal!.reason ?? new Error("aborted")); } });
      finish = () => { if (!done) { done = true; out.enqueue(rest); out.close(); } };
    } });
    return new Response(body, { status: 200, headers: { "content-type": "video/mp4", "content-length": String(first.length + rest.length), ...echo } });
  };
  return { responder, finish: () => finish() };
}
/** Replace AbortSignal.timeout with a setTimeout-armed controller and mock setTimeout, for this test only. */
function controlledClock(t: TestContext) {
  const original = AbortSignal.timeout;
  t.mock.timers.enable({ apis: ["setTimeout"] });
  AbortSignal.timeout = (ms: number) => { const c = new AbortController(); setTimeout(() => c.abort(new DOMException("timed out", "TimeoutError")), ms); return c.signal; };
  t.after(() => { AbortSignal.timeout = original; });
}
const read = async (response: Response) => { try { return { bytes: new Uint8Array(await response.arrayBuffer()), error: null }; } catch (error) { return { bytes: null, error }; } };

if (ensureModuleMocks(import.meta.url, { controls: 3, rest: 1 })) {
  beforeEach(() => reset());

  test("control: a preview whose upstream echoes this account and media is served once as image/jpeg", async () => {
    upstream(image(echo));
    const response = await call(ROUTE, params("preview"));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${BACKEND}/onlyfans/content/v1/accounts/of-a/message-media/11/22/33/preview`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/jpeg");
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), JPEG);
  });

  test("control: an upstream 404 is answered 404 with no body", async () => {
    upstream(() => new Response(null, { status: 404 }));
    const response = await call(ROUTE, params("preview"));
    assert.equal(response.status, 404);
  });

  test("control: a video whose body arrives before any timeout is served whole", async (t) => {
    controlledClock(t);
    const video = slowVideo(new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6]));
    upstream(video.responder);
    const response = await call(ROUTE, params("file"));
    assert.equal(response.status, 200);
    video.finish();
    const { bytes, error } = await read(response);
    assert.equal(error, null);
    assert.deepEqual(bytes, new Uint8Array([1, 2, 3, 4, 5, 6]));
  });

  test("B-C5: a preview whose upstream says it belongs to another account is not served", async () => {
    upstream(image({ "X-OnlyFans-Account-Id": "of-b", "X-OnlyFans-Media-Id": "33" }));
    const response = await call(ROUTE, params("preview"));
    assert.equal(calls.length, 1);
    const served = new Uint8Array(await response.arrayBuffer());
    assert.ok(response.status < 200 || response.status > 299, `another account's media was answered ${response.status}`);
    assert.notDeepEqual(served, JPEG, "another account's image bytes were served");
  });
}
