// KNOWN RED (W2 team-351 F2, F12; docs/review/W2/team-351-curl-capture.md). Pure lib test of createConnectionBackend().captureFromCurl.
// F2 trace: lib/onlyfans-connections/backend.ts:12 post() passes `timeoutMs: 15_000` to lib/onlyfans/backend-transport.ts:7
//   `AbortSignal.timeout(timeoutMs)`; upstream build_connection_capture (twin-onlyfans-backend session_bootstrap.py:526,552) makes two
//   sequential outbound fetches with urlopen(timeout=20), which is per socket operation, not a total, so upstream has no finite budget.
//   A conversion upstream completes in 16 s is aborted here and reported as 502 "unconfirmed" (backend.ts:16-17); the result is discarded.
// F12 trace: backend.ts:54-57 returns 502 `outcome:"unconfirmed"` when upstream answers 200 with a capture that fails connectionCapture
//   (contract.ts:46 empty cookies, :53 duplicate names). That is a deterministic contract reject, not an unknown outcome.
// Fixed looks like: F2, the dashboard-side budget fix (S6): captureFromCurl calls the transport itself with its own budget above an
//   explicit upstream deadline (post() unchanged), so a 16 s conversion returns ok. F12, a 200 that fails the contract is a refusal:
//   ok:false, outcome "refused", a 4xx-class status (not 502).
// F3 is tested in the editor file (the status collapse is ConnectionEditor.tsx:104-107, not the lib).
// Fakes: fetchImpl only (https://backend.invalid, never reached). Token and cookie values are synthetic, generated per run
//   (tests/helpers/W2-team-351-curl-capture-fixtures.ts).
// F2 runs on the wall clock (~16 s): node:test mock timers do NOT control AbortSignal.timeout (measured on node v23.6.1: after
//   mock.timers.tick(2000) an AbortSignal.timeout(1000) was still not aborted), and a wall-clock wait stays valid whatever timer
//   mechanism the fix uses. The fake honours init.signal, so an abort rejects exactly like real fetch.
// Team's Claude owns the fix. Not wired into npm scripts.
// Run:  nice -n 10 node --import tsx --test --test-name-pattern='^control' tests/known-red/W2-team-351-curl-capture-backend.test.ts  (green)
//       nice -n 10 node --import tsx --test --test-skip-pattern='^control' tests/known-red/W2-team-351-curl-capture-backend.test.ts  (red)
import assert from "node:assert/strict";
import test from "node:test";
import { createConnectionBackend } from "../../lib/onlyfans-connections/backend";
import { CONNECTION_SCHEMA, connectionCapture } from "../../lib/onlyfans-connections/contract";
import { capture, synthetic } from "../helpers/W2-team-351-curl-capture-fixtures";

const BASE = "https://backend.invalid";
const ENDPOINT = `${BASE}/onlyfans/connection/v1/accounts/of-a/capture-from-curl`;
const OWNER = 123;
// Upstream always prepends schemaVersion (connection_api.py:25-26 response()), so the fake does too.
const reply = () => ({ schemaVersion: CONNECTION_SCHEMA, ok: true, capture: capture(OWNER), xHash: synthetic(), ownerId: OWNER });
const CURL = `curl 'https://onlyfans.com/api2/v2/users/me' -H 'user-id: ${OWNER}' -b 'sess=${synthetic()}'`;

type Seen = { url: string; method: string | undefined; body: unknown };
function backendWith(answer: (init: RequestInit) => Promise<Response>) {
  const seen: Seen[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    seen.push({ url: String(input), method: init.method, body: typeof init.body === "string" ? JSON.parse(init.body) : init.body });
    return answer(init);
  }) as typeof fetch;
  return { seen, backend: createConnectionBackend({ baseUrl: BASE, token: synthetic(), fetchImpl }) };
}
/** Answers after `ms` unless init.signal aborts first; an abort rejects with the signal's reason, as real fetch does. */
const after = (ms: number, response: () => Response) => (init: RequestInit) => new Promise<Response>((resolve, reject) => {
  const signal = init.signal;
  if (signal?.aborted) { reject(signal.reason); return; }
  const timer = setTimeout(() => resolve(response()), ms);
  signal?.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
});
const now = (response: () => Response) => after(0, response);

test("control: a valid conversion reply returns ok with that data after exactly one POST {curl}", async () => {
  const body = reply();
  assert.ok(connectionCapture(body.capture, OWNER), "fixture capture must pass connectionCapture");
  const { seen, backend } = backendWith(now(() => Response.json(body)));
  const result = await backend.captureFromCurl("of-a", CURL);
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.data, { capture: body.capture, xHash: body.xHash, ownerId: OWNER });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, ENDPOINT);
  assert.equal(seen[0].method, "POST");
  assert.deepEqual(seen[0].body, { curl: CURL });
});

test("control: upstream 400, 404 and a network failure each return ok:false after exactly one fetch", async () => {
  const cases: Array<[string, (init: RequestInit) => Promise<Response>]> = [
    ["400", now(() => Response.json({ ok: false, code: "invalid_request", error: "Could not read that curl." }, { status: 400 }))],
    ["404", now(() => Response.json({ ok: false, error: "Not Found" }, { status: 404 }))],
    ["network", async () => { throw new TypeError("fetch failed"); }],
  ];
  for (const [label, answer] of cases) {
    const { seen, backend } = backendWith(answer);
    const result = await backend.captureFromCurl("of-a", CURL);
    assert.equal(result.ok, false, `${label}: ok:false`);
    assert.equal(seen.length, 1, `${label}: one fetch, no automatic retry`);
  }
});

test("F12: a 200 whose capture fails the contract (no cookies, duplicate cookie names) is a refusal, not unconfirmed", async () => {
  const empty = reply(); empty.capture.cookies = [];
  const duplicate = reply(); duplicate.capture.cookies = [{ name: "sess", value: synthetic() }, { name: "sess", value: synthetic() }];
  for (const [label, body] of [["cookies: []", empty], ["duplicate cookie names", duplicate]] as const) {
    assert.equal(connectionCapture(body.capture, OWNER), false, `${label}: fixture must fail the contract`);
    const { seen, backend } = backendWith(now(() => Response.json(body)));
    const result = await backend.captureFromCurl("of-a", CURL);
    assert.equal(seen.length, 1, `${label}: one fetch`);
    assert.equal(result.ok, false, `${label}: never accepted`);
    assert.ok(!result.ok);
    assert.equal(result.outcome, "refused", `${label}: a deterministic contract reject is refused, got ${JSON.stringify(result)}`);
    assert.notEqual(result.status, 502, `${label}: not reported as an unconfirmed upstream failure`);
  }
});

test("F2 (dashboard-side budget fix, S6): a conversion upstream completes in 16 s is returned, not aborted as unconfirmed", { timeout: 60_000 }, async () => {
  const body = reply();
  const { seen, backend } = backendWith(after(16_000, () => Response.json(body)));
  const started = Date.now();
  const result = await backend.captureFromCurl("of-a", CURL);
  const elapsed = Date.now() - started;
  assert.equal(seen.length, 1, "one attempt, no automatic retry");
  assert.equal(result.ok, true, `conversion finished upstream at 16 s but the dashboard gave up after ${elapsed} ms: ${JSON.stringify(result)}`);
});
