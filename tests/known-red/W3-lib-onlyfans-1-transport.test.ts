// KNOWN RED (CORRECTNESS-REVIEW claim 2 + REVIEW.md inv 6/7; W3-lib-onlyfans-1 findings F6/F7/F8/F9). Shared transport + read port:
//  - backend.ts:329-345 configuredOnlyFansBackend re-parses env and skips configuredBackendPurpose's shared-token and URL checks
//    (backend-transport.ts:17-21), so the read port runs on a token another purpose also holds.
//  - backend.ts:153-168 read() builds its own fetch without redirect:"error" (every write path refuses redirects).
//  - campaigns-backend.ts:13 relays an upstream 401/403 (the service credential) as the browser's own status; CampaignManager.tsx:79
//    then runs sessionLost() and wipes the draft, audience and kept retry.
//  - backend-transport.ts:5-7 AbortSignal.timeout covers the body too: a streamed body (message-media video route) is cut at the
//    timeout even though headers arrived in time. The message-media route calls createBackendTransport() with defaults today;
//    if the fix moves that route to a separate stream variant, repoint the streaming red at it (TEST-CHANGE).
// Each red has a control that passes today. Team's Claude owns the fix. Not wired into npm scripts or init.sh (its list is hard-coded); run with node --import tsx --test.
import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { configuredBackendPurpose, createBackendTransport } from "../../lib/onlyfans/backend-transport";
import { configuredOnlyFansBackend, createHttpOnlyFansBackend } from "../../lib/onlyfans/backend";
import { createCampaignBackend } from "../../lib/onlyfans/campaigns-backend";

const ENV = ["ONLYFANS_API_BASE_URL", "ONLYFANS_API_TOKEN", "ONLYFANS_CONTROL_TOKEN"] as const;
function withEnv<T>(values: Partial<Record<typeof ENV[number], string>>, run: () => T): T {
  const saved = ENV.map(k => [k, process.env[k]] as const);
  for (const k of ENV) { if (values[k] === undefined) delete process.env[k]; else process.env[k] = values[k]; }
  try { return run(); } finally { for (const [k, v] of saved) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
}
const SHARED = { ONLYFANS_API_BASE_URL: "https://backend.invalid", ONLYFANS_API_TOKEN: "s".repeat(40), ONLYFANS_CONTROL_TOKEN: "s".repeat(40) };

test("control: the purpose resolver refuses an API token shared with CONTROL", () => {
  assert.equal(withEnv(SHARED, () => configuredBackendPurpose("API")), null);
});
test("claim 2: the read port refuses an API token shared with CONTROL", () => {
  assert.equal(withEnv(SHARED, () => configuredOnlyFansBackend()), null);
});
test("claim 2: the read port refuses a base URL with a query string, like the purpose resolver", () => {
  assert.equal(withEnv({ ONLYFANS_API_BASE_URL: "https://backend.invalid/?x=1", ONLYFANS_API_TOKEN: "a".repeat(40) }, () => configuredOnlyFansBackend()), null);
});

const spy = () => { const seen: RequestInit[] = []; const fetchImpl = (async (_u: RequestInfo | URL, init?: RequestInit) => { seen.push(init ?? {}); return new Response("{}", { status: 500 }); }) as typeof fetch; return { seen, fetchImpl }; };
test("control: a campaign read through the shared transport refuses redirects", async () => {
  const { seen, fetchImpl } = spy();
  await createCampaignBackend({ baseUrl: "https://backend.invalid", token: "t", fetchImpl }).list("of-a");
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.redirect, "error");
});
test("inv 6: the read port refuses redirects instead of following them with the bearer token", async () => {
  const { seen, fetchImpl } = spy();
  await createHttpOnlyFansBackend({ baseUrl: "https://backend.invalid", token: "t", fetchImpl }).listAccounts({ creatorId: null });
  assert.equal(seen.length, 1, "the read reached fetch");
  assert.equal(seen[0]?.redirect, "error");
});

const answering = (status: number) => (async () => new Response("{}", { status })) as typeof fetch;
test("control: an upstream 500 on a campaign read is relayed as 503", async () => {
  const result = await createCampaignBackend({ baseUrl: "https://backend.invalid", token: "t", fetchImpl: answering(500) }).list("of-a");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 503);
});
for (const status of [401, 403]) test(`session: an upstream ${status} (service credential) is not relayed as the browser's own ${status}`, async () => {
  const result = await createCampaignBackend({ baseUrl: "https://backend.invalid", token: "t", fetchImpl: answering(status) }).list("of-a");
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(![401, 403].includes(result.status), `got ${result.status}`);
});

async function streamed(totalMs: number, chunks: number, timeoutMs: number) {
  const server = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/octet-stream" });
    res.flushHeaders();
    let sent = 0;
    const timer = setInterval(() => { res.write("x"); if (++sent === chunks) { clearInterval(timer); res.end(); } }, totalMs / chunks);
    res.on("close", () => clearInterval(timer));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    const response = await createBackendTransport()(`http://127.0.0.1:${port}/file`, { method: "GET", timeoutMs });
    try { return (await response.text()).length; } catch { return -1; }
  } finally { server.closeAllConnections(); server.close(); }
}
test("control: a stream that finishes inside the timeout arrives whole", async () => {
  assert.equal(await streamed(200, 4, 2_000), 4);
});
test("streaming: headers inside the timeout, body longer than it, still arrives whole", async () => {
  assert.equal(await streamed(1_200, 4, 600), 4);
});
