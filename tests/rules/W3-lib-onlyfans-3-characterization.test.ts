// CHARACTERIZATION (green, must stay green). W3 lib-onlyfans-3 C1: lib/onlyfans/read-recovery.ts is the one place a dashboard read
// is retried, and REVIEW inv 7 ("no send, no auto-retry") depends on its two limits: a GET is retried at most once (one recovery
// after 502/503/504 or a network error), and a non-GET is never sent at all (it throws before any fetch).
// Mutation-proven: tests/rules/mutations/W3-lib-onlyfans-3/C1.md. Moved from tests/known-red/ at W3 close (every test here is a
// control and must pass), so the init.sh rules-tests glob runs it.
// Offline: fetchImpl fake returning Response; URL https://backend.invalid.
import assert from "node:assert/strict";
import test from "node:test";
import { readWithRecovery } from "../../lib/onlyfans/read-recovery";

const URL_ = "https://backend.invalid/onlyfans/api/v1/accounts";
function counting(reply: () => Response | Promise<Response>) {
  const calls: { method: string | undefined }[] = [];
  const fetchImpl = (async (_url: string, init?: RequestInit) => { calls.push({ method: init?.method }); return reply(); }) as typeof fetch;
  return { fetchImpl, calls };
}

test("control: C1 a GET answered 503 twice is fetched exactly twice and returns the second 503", async () => {
  const { fetchImpl, calls } = counting(() => new Response(null, { status: 503 }));
  const response = await readWithRecovery(URL_, { method: "GET" }, fetchImpl);
  assert.equal(calls.length, 2, `a read is recovered at most once; actual fetch calls ${calls.length}`);
  assert.equal(response.status, 503);
  assert.ok(calls.every(c => c.method === "GET"));
});

test("control: C1 a GET whose fetch throws twice is attempted exactly twice", async () => {
  let n = 0;
  const { fetchImpl, calls } = counting(() => { n++; throw new TypeError("network"); });
  await assert.rejects(readWithRecovery(URL_, {}, fetchImpl), TypeError);
  assert.equal(calls.length, 2, `a read is recovered at most once; actual fetch calls ${calls.length}`);
  assert.equal(n, 2);
});

test("control: C1 a GET answered 200 is fetched once", async () => {
  const { fetchImpl, calls } = counting(() => new Response("{}", { status: 200 }));
  assert.equal((await readWithRecovery(URL_, {}, fetchImpl)).status, 200);
  assert.equal(calls.length, 1);
});

for (const method of ["POST", "PATCH", "PUT", "DELETE"]) test(`control: C1 a ${method} is never sent or retried`, async () => {
  const { fetchImpl, calls } = counting(() => new Response(null, { status: 503 }));
  await assert.rejects(readWithRecovery(URL_, { method, body: "{}" }, fetchImpl), /GET only/);
  assert.equal(calls.length, 0, `a write never goes through read recovery; actual fetch calls ${calls.length}`);
});
