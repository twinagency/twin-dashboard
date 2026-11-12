// KNOWN RED (W3 L6, .scratch/rwl-W3/findings/ui-onlyfans-launch.md L6 handoff; docs/RISKS.md D7; REVIEW.md inv 7):
// an upstream 503 after a write does not prove the write was not applied (only 400/401/403/404/405/409/410/413/422 do),
// so a native launch write answered 503 must read "unconfirmed" (hold kept, refresh first), never "unavailable"/"refused"
// (both drop the UI's unconfirmed hold and invite a second action on something that may already have happened).
// Roots:
//   lib/onlyfans/launch/native-backend.ts:68-74   configuration POST: upstream 503 -> outcome "unavailable"
//   lib/onlyfans/launch/native-backend.ts:184-192 control / ledger/retry / ledger/resolve: 503 -> outcome "unavailable"
// The fix belongs in native-backend (every upstream POST 503, including agency-scope.ts:33-34's synthetic post-send 503,
// maps to unconfirmed). bFetch (b-common.ts:53-56) then only sees a write 503 from a pre-call bRefuse, which is refused
// per D7; the bFetch controls below pin that. A client-side red was removed (wrong layer, C3 structure F12).
// No existing test pins native-backend's 503 -> "unavailable" (grep tests/ for native-backend/bFetch: none) [m].
// Team's Claude owns the fix; not wired into npm scripts; init.sh's known-red loop does not list it yet (orchestrator decides).
import assert from "node:assert/strict";
import test from "node:test";
import {
  createNativeConfigurationBackend,
  createNativeControlBackend,
} from "../../lib/onlyfans/launch/native-backend";
import { bFetch } from "../../lib/onlyfans/launch/b-common";

const BASE = "https://backend.invalid";
const TOKEN = "synthetic-token";

function answering(status: number) {
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ ok: false, error: "synthetic upstream answer" }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const configurationWrite = (status: number) => {
  const fake = answering(status);
  const write = createNativeConfigurationBackend({ baseUrl: BASE, token: TOKEN, fetchImpl: fake.fetchImpl });
  return {
    fake,
    run: () =>
      write("of-a", "engagement/settings", "POST", {
        expectedRevision: 3,
        settings: { enabled: true },
        actor: "operator:synthetic",
        commandKey: "a".repeat(64),
      }),
  };
};

const CONTROL_PATHS = ["control", "ledger/retry", "ledger/resolve"] as const;
const controlWrite = (status: number, path: (typeof CONTROL_PATHS)[number]) => {
  const fake = answering(status);
  const write = createNativeControlBackend({ baseUrl: BASE, token: TOKEN, fetchImpl: fake.fetchImpl });
  const body =
    path === "control"
      ? { action: "pause", expectedFingerprint: "b".repeat(64), reason: "synthetic check", actor: "operator:synthetic", commandKey: "c".repeat(64) }
      : { entryId: "1", actor: "operator:synthetic", commandKey: "d".repeat(64) };
  return { fake, run: () => write("of-a", path, body) };
};

test("control: a configuration write answered 409 is refused", async () => {
  const { fake, run } = configurationWrite(409);
  const result = await run();
  assert.equal(fake.calls.length, 1, "the fake backend was reached once");
  assert.ok(fake.calls[0].startsWith(`${BASE}/onlyfans/configuration/v1/accounts/of-a/engagement/settings`));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.outcome, "refused");
});

test("control: a configuration write answered 502 is unconfirmed", async () => {
  const { fake, run } = configurationWrite(502);
  const result = await run();
  assert.equal(fake.calls.length, 1);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.outcome, "unconfirmed");
});

test("control: a control write answered 409 is refused", async () => {
  for (const path of CONTROL_PATHS) {
    const { fake, run } = controlWrite(409, path);
    const result = await run();
    assert.equal(fake.calls.length, 1, `${path}: the fake backend was reached once`);
    assert.equal(fake.calls[0], `${BASE}/onlyfans/control/v1/accounts/of-a/${path}`);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.outcome, "refused", path);
  }
});

test("control: a control write answered 502 is unconfirmed", async () => {
  for (const path of CONTROL_PATHS) {
    const { fake, run } = controlWrite(502, path);
    const result = await run();
    assert.equal(fake.calls.length, 1, path);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.outcome, "unconfirmed", path);
  }
});

test("L6: a configuration write answered 503 is unconfirmed", async () => {
  const { fake, run } = configurationWrite(503);
  const result = await run();
  assert.equal(fake.calls.length, 1);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.outcome, "unconfirmed", "native-backend.ts:68-74 maps an upstream write 503 to unavailable");
});

test("L6: a control/ledger write answered 503 is unconfirmed", async () => {
  for (const path of CONTROL_PATHS) {
    const { fake, run } = controlWrite(503, path);
    const result = await run();
    assert.equal(fake.calls.length, 1, path);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.outcome, "unconfirmed", `${path}: native-backend.ts:184-192 maps an upstream write 503 to unavailable`);
  }
});

// Client side: bFetch reads the global fetch; stub it per test and restore.
async function withGlobalFetch<T>(status: number, body: Record<string, unknown>, run: () => Promise<T>) {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    return { value: await run(), calls: () => calls };
  } finally {
    globalThis.fetch = original;
  }
}

const POST_URL = "/api/onlyfans-launch/accounts/of-a/engagement/settings";

test("control: bFetch POST answered 409 is refused", async () => {
  const { value, calls } = await withGlobalFetch(409, { ok: false, outcome: "refused", error: "Changed." }, () =>
    bFetch(POST_URL, { method: "POST", body: { expectedRevision: 3 } }));
  assert.equal(calls(), 1);
  assert.equal(value.kind, "refused");
});

test("control: bFetch POST answered a pre-call 503 bRefuse body (code, no outcome) is refused", async () => {
  const { value, calls } = await withGlobalFetch(503, { ok: false, code: "refused", error: "The account control authority is unavailable.", schemaVersion: "of-launch-b.v1" }, () =>
    bFetch(POST_URL, { method: "POST", body: { expectedRevision: 3 } }));
  assert.equal(calls(), 1);
  assert.equal(value.kind, "refused");
});
