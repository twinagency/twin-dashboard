// KNOWN RED (REVIEW.md inv 7 D7 + inv 6/security; W3 lib-onlyfans-4-plus2 F3, F4, F5, F6).
// Lib layer only: lib/onlyfans-connections/{backend,contract,proxy}.ts over a synthetic wire (https://backend.invalid). No network.
// F3  backend.ts:13 lists upstream 503 as "refused" for every connection write (command = save/session/activate/verify/pause, provision,
//     enroll). ConnectionEditor.tsx:132,138 then drops the exact retry: an applied activate answered 503 reads "Command refused".
// F4  backend.ts:31: an enroll whose 200 body fails parseEnrollment returns {status:502} with NO outcome; sign-in route :110 stamps it
//     "refused" via connectionRefusal. An upstream 200 means the enrollment probably exists: unconfirmed.
// F5  (handoff W3 api-onlyfans-plus7 F2, lib half) proxy.ts:16,48 normalizeProxyInput and contract.ts:71-77 validConnectionRequest accept
//     loopback, RFC1918, link-local, IPv6 loopback, localhost and numeric-encoded loopback as an account proxy (the account "save" command,
//     a path separate from lane 1's sign-in route test C-C1). Literal-address refusal is the dashboard half; the worker must still
//     refuse at connect time (DNS).
// F6  (handoff W2 F1, lib half) backend.ts:49-58 captureFromCurl accepts a conversion whose ownerId is not this account's owner
//     (accounts are `of-<ownerId>`, contract.ts:125); only self-consistency (capture user_id === ownerId) is checked. If the fix lands in
//     the route instead (compare against the recorded Connection.ownerId), move this red to the route.
// Already elsewhere, not duplicated: W2 F12 (contract-reject 200 → unconfirmed) is W2-team-351-curl-capture-backend.test.ts;
// lane 1 C-C5 (enroll 5xx through the sign-in route).
// Team's Claude owns the fix. Not wired into npm scripts or init.sh. Run:
//   node --import tsx --test --test-name-pattern='^control' tests/known-red/W3-lib-onlyfans-4-plus2-connections.test.ts   (green)
//   node --import tsx --test --test-skip-pattern='^control' tests/known-red/W3-lib-onlyfans-4-plus2-connections.test.ts   (red, ERR_ASSERTION)
// Synthetic values only (no cookie or token shaped values).
import assert from "node:assert/strict";
import test from "node:test";
import { createConnectionBackend } from "../../lib/onlyfans-connections/backend";
import { validConnectionRequest } from "../../lib/onlyfans-connections/contract";
import { normalizeProxyInput } from "../../lib/onlyfans-connections/proxy";

const BASE = "https://backend.invalid";
const ID = { actor: "op-session:" + "a".repeat(64), commandKey: "b".repeat(64) };
const capture = (owner: number) => ({
  headers: { user_id: String(owner), user_agent: "synthetic-agent", x_bc: "synthetic-bc", x_of_rev: "synthetic-rev" },
  signing: { rules: { static_param: "synthetic", start: "1", end: "2", checksum_indexes: Array.from({ length: 32 }, (_, i) => i % 40), checksum_constant: 7 } },
  cookies: [{ name: "synthetic_name", value: "synthetic_value" }],
});
const session = { ownerId: 1001, capture: capture(1001), xHash: "synthetic-hash", expiresAt: "2026-12-01T00:00:00Z" };

function wire(answer: () => Response) {
  const calls: Array<{ url: string; method: string }> = [];
  const fetchImpl = (async (url: string | URL, init: RequestInit = {}) => { calls.push({ url: String(url), method: init.method ?? "GET" }); return answer(); }) as typeof fetch;
  return { calls, backend: createConnectionBackend({ baseUrl: BASE, token: "synthetic-token", fetchImpl }) };
}
const empty = (code: number) => () => new Response("{}", { status: code });

const writes: Array<[string, (b: ReturnType<typeof createConnectionBackend>) => Promise<{ ok: boolean; status?: number; outcome?: string }>]> = [
  ["activate", b => b.command("of-1001", { action: "activate", payload: { limitUnits: 10, throttleSeconds: 30, mediaEnabled: false }, expectedRevision: 3, ...ID }) as never],
  ["pause", b => b.command("of-1001", { action: "pause", payload: {}, expectedRevision: 3, ...ID }) as never],
  ["provision", b => b.provision({ creatorId: "creator-a", ownerId: 1001, handle: "synthetic", creatorName: "Synthetic", ...ID }) as never],
  ["enroll", b => b.enroll({ creatorId: "creator-a", creatorName: "Synthetic", handle: "synthetic", session, ...ID }) as never],
];
for (const [name, run] of writes) {
  test(`control: connection ${name} answered 409 is refused after one POST`, async () => {
    const w = wire(empty(409)); const r = await run(w.backend);
    assert.equal(w.calls.length, 1); assert.equal(w.calls[0].method, "POST");
    assert.equal(r.ok, false); assert.equal(r.status, 409); assert.equal(r.outcome, "refused");
  });
  test(`control: connection ${name} answered 502 is unconfirmed`, async () => {
    const w = wire(empty(502)); const r = await run(w.backend);
    assert.equal(r.ok, false); assert.equal(r.outcome, "unconfirmed");
  });
  test(`F3: connection ${name} answered 503 is unconfirmed (not refused, not relayed as 503)`, async () => {
    const w = wire(empty(503)); const r = await run(w.backend);
    assert.equal(w.calls.length, 1, "attempted once"); assert.equal(r.ok, false);
    assert.deepEqual({ outcome: r.outcome, not503: r.status !== 503 }, { outcome: "unconfirmed", not503: true });
  });
}
test("F4: an enroll answered 200 with an unreadable enrollment is unconfirmed (carries outcome)", async () => {
  const w = wire(() => Response.json({ ok: true, enrollment: { id: "x" } }));
  const r = await w.backend.enroll({ creatorId: "creator-a", creatorName: "Synthetic", handle: "synthetic", session, ...ID }) as { ok: boolean; outcome?: string };
  assert.equal(r.ok, false); assert.equal(r.outcome, "unconfirmed");
});

const PUBLIC = "8.8.4.4:3128";
const PRIVATE = ["127.0.0.1:8080", "10.0.0.1:3128", "192.168.1.10:8080", "169.254.169.254:80", "[::1]:1080", "localhost:8080", "2130706433:80",
  "172.16.0.9:3128", "0.0.0.0:80", "[fd00::1]:1080"];
const saveWith = (proxyUrl: string) => ({ action: "save", expectedRevision: 3,
  payload: { ownerId: 1001, capture: capture(1001), xHash: "synthetic-hash", proxyUrl, expiresAt: "2026-12-01T00:00:00Z", model: null } });
test("control: a public proxy normalizes and passes the save contract", () => {
  const n = normalizeProxyInput(PUBLIC); assert.equal(n.ok, true);
  assert.equal(validConnectionRequest(saveWith(n.ok ? n.url! : "")), true);
});
for (const host of PRIVATE) {
  test(`F5: proxy ${host} (private network) is refused by normalizeProxyInput`, () => {
    assert.equal(normalizeProxyInput(host).ok, false);
  });
  test(`F5: save contract refuses proxyUrl http://${host}`, () => {
    assert.equal(validConnectionRequest(saveWith(`http://${host}`)), false);
  });
}

const conversion = (owner: number) => () => Response.json({ ok: true, capture: capture(owner), xHash: "synthetic-hash", ownerId: owner });
test("control: a curl conversion for this account's owner is ok", async () => {
  const w = wire(conversion(1001)); const r = await w.backend.captureFromCurl("of-1001", "curl synthetic");
  assert.equal(r.ok, true);
});
test("F6: a curl conversion naming another owner than the account's is not accepted", async () => {
  const w = wire(conversion(2002)); const r = await w.backend.captureFromCurl("of-1001", "curl synthetic");
  assert.equal(r.ok, false, "of-1001 is owner 1001; a capture for 2002 must not fill this account");
});
