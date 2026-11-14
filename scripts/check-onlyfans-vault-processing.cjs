/** Real sync + processing route handlers, validators, backend client and parsers (transpiled from source, no Next server); only authentication and the backend fetch are fixtures. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const ts = require("typescript");
const { NextRequest, NextResponse } = require("next/server");
const root = path.resolve(__dirname, "..");
const savedEnv = { ...process.env };
const cache = new Map();
let auth = null; // what requireOnlyFansRead resolves to for the current call
const authCalls = [];
function resolveFile(from, name) {
  const base = name.startsWith("@/") ? path.join(root, name.slice(2)) : path.resolve(path.dirname(from), name);
  for (const candidate of [base + ".ts", base + ".tsx", path.join(base, "index.ts"), base]) if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  throw new Error("cannot resolve " + name + " from " + from);
}
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} }; cache.set(file, module);
  const require_ = name => {
    if (name.startsWith(".") || name.startsWith("@/")) {
      const target = resolveFile(file, name);
      if (target === path.join(root, "lib/onlyfans/route.ts")) return routeMock;
      return load(target);
    }
    return require(name);
  };
  new Function("module", "exports", "require", output)(module, module.exports, require_);
  return module.exports;
}
const routeMock = {
  PRIVATE_HEADERS: { "Cache-Control": "private, no-store", "X-Data-Mode": "live" },
  requestId: value => { const t = (value ?? "").trim(); return /^[A-Za-z0-9._:-]{1,64}$/.test(t) ? t : null; },
  requireOnlyFansRead: async options => { authCalls.push(options); return auth; },
};
const ACCOUNT = "acc-a", SESSION = "op-session:" + "c".repeat(64), REQ = "fd2e6b88-4edb-43db-a654-e2025d57eece", REQ2 = "0e2d6a42-1d4b-4a5f-9f6e-2f3f2a1b4c5d";
const ORIGIN = "https://dashboard.tgaiclone.xyz";
const urlRoute = suffix => `${ORIGIN}/api/onlyfans-content/accounts/${ACCOUNT}/vault/${suffix}`;
const params = (accountId = ACCOUNT) => ({ params: Promise.resolve({ accountId }) });
const get = suffix => new NextRequest(urlRoute(suffix), { method: "GET", headers: { host: "dashboard.tgaiclone.xyz" } });
const post = (suffix, body, headers = {}) => new NextRequest(urlRoute(suffix), { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body),
  headers: { host: "dashboard.tgaiclone.xyz", origin: ORIGIN, "sec-fetch-site": "same-origin", "content-type": "application/json", ...headers } });
const digest = value => createHash("sha256").update(value).digest("hex");
const counts = (patch = {}) => ({ eligible: 10, queued: 2, processing: 1, completed: 6, unresolved: 1, skippedOperator: 0, ...patch });
const processing = (patch = {}) => ({ account: ACCOUNT, paused: false, pauseReason: null,
  import: { scope: "full", state: "in_progress", reason: null, established_by: null, providerTotal: { photo: null, video: null }, seen: { photo: 48, video: 24 }, uniqueImported: { photo: 48, video: 24 } },
  analysis: { ...counts(), byKind: { photo: counts(), video: counts({ eligible: 0, queued: 0, processing: 0, completed: 0, unresolved: 0 }) }, unresolvedReasons: { timeout: 1 } },
  credential: { state: "ok" }, updatedAt: "2026-11-15T01:02:03Z", ...patch });
async function main() {
  process.env.NODE_ENV = "production";
  delete process.env.DASHBOARD_PUBLIC_ORIGIN; delete process.env.DASHBOARD_EXTRA_ORIGINS;
  process.env.ONLYFANS_API_BASE_URL = "http://127.0.0.1:1"; process.env.ONLYFANS_CONTENT_TOKEN = "synthetic-content-only";
  for (const key of ["API", "CONTROL", "CONFIGURATION", "CAMPAIGN", "CONNECTION"]) delete process.env[`ONLYFANS_${key}_TOKEN`];
  const processingRoute = load(path.join(root, "app/api/onlyfans-content/accounts/[accountId]/vault/processing/route.ts"));
  const syncRoute = load(path.join(root, "app/api/onlyfans-content/accounts/[accountId]/vault/sync/route.ts"));
  const { canonicalContent } = load(path.join(root, "lib/onlyfans/content.ts"));

  const upstream = []; let reply = () => Response.json({ ok: true });
  const fetchFixture = async (url, init) => {
    assert.equal(init?.credentials, "omit"); assert.equal(init?.redirect, "error"); assert.equal(init?.cache, "no-store");
    const headers = new Headers(init?.headers); assert.equal(headers.get("authorization"), "Bearer synthetic-content-only"); assert.equal(headers.get("cookie"), null);
    upstream.push({ url: String(url), method: init.method, body: init.body === undefined ? undefined : JSON.parse(init.body) });
    return reply(String(url), init);
  };
  const session = (extra = {}) => ({ actor: SESSION, fetch: fetchFixture, ...extra });
  const reset = () => { upstream.length = 0; authCalls.length = 0; };

  // ---- GET status
  reset(); auth = NextResponse.json({ error: "Sign in again." }, { status: 401 });
  let response = await processingRoute.GET(get("processing"), params());
  assert.equal(response.status, 401); assert.equal(upstream.length, 0, "unauthenticated reads never reach the backend");
  assert.deepEqual(authCalls[0], { agency: true }, "same agency read gate as the vault read route");
  auth = session(); reply = () => Response.json({ ok: true, processing: processing() });
  response = await processingRoute.GET(get("processing"), params());
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store");
  let body = await response.json();
  assert.deepEqual(upstream, [{ url: "http://127.0.0.1:1/onlyfans/content/v1/accounts/acc-a/vault/processing", method: "GET", body: undefined }]);
  assert.equal(body.ok, true); assert.equal(body.accountId, ACCOUNT); assert.equal(body.schemaVersion, "of-content.v1");
  assert.deepEqual(body.processing.analysis.unresolvedReasons, { timeout: 1 }); assert.equal(body.processing.analysis.queued, 2); assert.equal(body.processing.import.scope, "full"); assert.equal(body.processing.paused, false);
  reset(); response = await processingRoute.GET(new NextRequest(urlRoute("processing") + "?accountId=acc-b"), params()); assert.equal(response.status, 400); assert.equal(upstream.length, 0);
  for (const bad of ["", "a/b", "x".repeat(65), "../acc", "acc b"]) { reset(); response = await processingRoute.GET(get("processing"), params(bad)); assert.equal(response.status, 400, bad); assert.equal(upstream.length, 0); }
  // other account: a backend answer about a different account is refused, never shown
  reply = () => Response.json({ ok: true, processing: processing({ account: "acc-b" }) });
  response = await processingRoute.GET(get("processing"), params()); assert.equal(response.status, 503); assert.equal((await response.json()).ok, false);
  reply = () => Response.json({ ok: true, accountId: "acc-b", processing: processing() }); assert.equal((await processingRoute.GET(get("processing"), params())).status, 503);
  reply = () => Response.json({ ok: false }, { status: 404 }); assert.equal((await processingRoute.GET(get("processing"), params())).status, 404);
  reply = () => Response.json({ detail: "boom https://leak.invalid/x" }, { status: 500 }); response = await processingRoute.GET(get("processing"), params());
  assert.equal(response.status, 503); assert.doesNotMatch(JSON.stringify(await response.json()), /leak\.invalid/);
  reply = () => { throw new Error("socket https://leak.invalid"); }; assert.equal((await processingRoute.GET(get("processing"), params())).status, 503);
  // no URLs leak even when the backend sends them
  reply = () => Response.json({ ok: true, processing: { ...processing(), signedUrl: "https://cdn.invalid/s", import: { ...processing().import, files: { full: { url: "https://cdn.invalid/f" } } }, analysis: { ...processing().analysis, previewUrl: "https://cdn.invalid/p", unresolvedReasons: { "https://cdn.invalid/r": 2, timeout: 1 } }, pauseReason: "https://cdn.invalid/why" } });
  response = await processingRoute.GET(get("processing"), params()); const leaked = await response.text();
  assert.equal(response.status, 200); assert.doesNotMatch(leaked, /https?:|cdn\.invalid|signedUrl|previewUrl/); assert.match(leaked, /unreadable_reason/);
  delete process.env.ONLYFANS_CONTENT_TOKEN; reset();
  assert.equal((await processingRoute.GET(get("processing"), params())).status, 503); assert.equal(upstream.length, 0, "unconfigured backend is refused before any call");
  process.env.ONLYFANS_CONTENT_TOKEN = "synthetic-content-only";

  // ---- POST processing
  const valid = { requestId: REQ, action: "retry", mediaIds: ["11", "9007199254740993"] };
  reply = () => Response.json({ ok: true, applied: true, accountId: ACCOUNT, commandKey: lastKey(), processing: processing({ paused: true, pauseReason: "operator_pause" }) });
  const lastKey = () => upstream.at(-1)?.body?.commandKey;
  reset(); auth = NextResponse.json({ error: "Sign in again." }, { status: 401 });
  assert.equal((await processingRoute.POST(post("processing", valid), params())).status, 401);
  auth = NextResponse.json({ error: "Read-only team access" }, { status: 403 });
  assert.equal((await processingRoute.POST(post("processing", valid), params())).status, 403);
  auth = { actor: null, fetch: fetchFixture }; assert.equal((await processingRoute.POST(post("processing", valid), params())).status, 401);
  auth = session();
  assert.deepEqual(authCalls.at(-1), { agency: true, write: true }, "POST needs the agency write gate");
  for (const headers of [{ origin: "https://attacker.invalid" }, { "sec-fetch-site": "cross-site" }, { "content-type": "text/plain" }]) {
    assert.equal((await processingRoute.POST(post("processing", valid, headers), params())).status, 403, JSON.stringify(headers));
  }
  assert.equal(upstream.length, 0, "session and origin failures never reach the backend");
  const two00 = Array.from({ length: 200 }, (_, i) => String(i + 1));
  const invalid = [
    "not json", "{", `{"requestId":"${REQ}","action":"pause","action":"resume"}`, JSON.stringify([valid]), "null",
    { ...valid, requestId: "nonce" }, { ...valid, action: "delete" }, { ...valid, action: "Retry" }, { requestId: REQ },
    { ...valid, actor: "spoofed" }, { ...valid, commandKey: "a".repeat(64) }, { ...valid, url: "https://x.invalid" },
    { requestId: REQ, action: "pause", mediaIds: ["11"] }, { requestId: REQ, action: "resume", mediaIds: ["11"] },
    { requestId: REQ, action: "redescribe" }, { ...valid, action: "redescribe", mediaIds: [] },
    { ...valid, mediaIds: [...two00, "201"] }, { ...valid, mediaIds: ["11", "11"] }, { ...valid, mediaIds: [11] }, { ...valid, mediaIds: ["0"] },
    { ...valid, mediaIds: ["-5"] }, { ...valid, mediaIds: ["1.5"] }, { ...valid, mediaIds: ["abc"] }, { ...valid, mediaIds: ["9223372036854775808"] }, { ...valid, mediaIds: "11" }, { ...valid, mediaIds: null }, { ...valid, mediaIds: ["https://x.invalid/1"] },
  ];
  for (const bad of invalid) { response = await processingRoute.POST(post("processing", bad), params()); assert.equal(response.status, 400, JSON.stringify(bad)); }
  assert.equal((await processingRoute.POST(post("processing", { requestId: REQ, action: "pause" }), params("../x"))).status, 400);
  assert.equal(upstream.length, 0, "invalid requests never reach the backend");
  // exact pass-through of the validated command with the session identity
  response = await processingRoute.POST(post("processing", valid), params());
  assert.equal(response.status, 200); body = await response.json();
  assert.equal(upstream.length, 1); assert.equal(upstream[0].url, "http://127.0.0.1:1/onlyfans/content/v1/accounts/acc-a/vault/processing"); assert.equal(upstream[0].method, "POST");
  const expectedKey = digest(canonicalContent([SESSION, ACCOUNT, "processing", valid]));
  assert.deepEqual(upstream[0].body, { action: "retry", mediaIds: ["11", "9007199254740993"], actor: SESSION, commandKey: expectedKey });
  assert.equal(body.ok, true); assert.equal(body.applied, true); assert.equal(body.accountId, ACCOUNT); assert.equal(body.commandKey, expectedKey); assert.equal(body.processing.paused, true);
  assert.equal("requestId" in upstream[0].body, false, "the browser nonce only feeds the command key");
  for (const [action, expected] of [["pause", { action: "pause" }], ["resume", { action: "resume" }], ["retry", { action: "retry" }], ["redescribe", { action: "redescribe", mediaIds: ["7"] }]]) {
    reset(); response = await processingRoute.POST(post("processing", { requestId: REQ, action, ...(action === "redescribe" ? { mediaIds: ["7"] } : {}) }), params());
    assert.equal(response.status, 200, action); assert.deepEqual({ ...upstream[0].body, actor: undefined, commandKey: undefined }, { ...expected, actor: undefined, commandKey: undefined }); assert.equal(upstream[0].body.actor, SESSION);
  }
  // idempotency: same request replays the same key; a new nonce is a new command
  reset(); await processingRoute.POST(post("processing", { requestId: REQ, action: "pause" }), params()); await processingRoute.POST(post("processing", { requestId: REQ, action: "pause" }), params()); await processingRoute.POST(post("processing", { requestId: REQ2, action: "pause" }), params());
  assert.equal(upstream[0].body.commandKey, upstream[1].body.commandKey); assert.notEqual(upstream[0].body.commandKey, upstream[2].body.commandKey);
  auth = session({ actor: "op-session:" + "d".repeat(64) }); reset(); await processingRoute.POST(post("processing", { requestId: REQ, action: "pause" }), params());
  assert.notEqual(upstream[0].body.commandKey, expectedKey); assert.equal(upstream[0].body.actor, "op-session:" + "d".repeat(64)); auth = session();
  // another account's path is just another account scope; nothing from the first leaks into the call
  reset(); await processingRoute.POST(post("processing", { requestId: REQ, action: "pause" }), params("acc-b")); assert.match(upstream[0].url, /accounts\/acc-b\/vault\/processing$/);
  // outcomes
  for (const status of [400, 401, 403, 404, 409, 413, 503]) {
    reply = () => Response.json({ detail: "private https://leak.invalid/detail" }, { status }); reset();
    response = await processingRoute.POST(post("processing", valid), params()); const refused = await response.json();
    assert.equal(response.status, status); assert.equal(refused.ok, false); assert.equal(refused.outcome, "refused"); assert.doesNotMatch(JSON.stringify(refused), /leak\.invalid/); assert.equal(upstream.length, 1, "no automatic retry of a write");
  }
  reply = () => { throw new Error("Synthetic lost reply"); }; reset(); response = await processingRoute.POST(post("processing", valid), params());
  assert.equal(response.status, 502); assert.equal((await response.json()).outcome, "unconfirmed"); assert.equal(upstream.length, 1);
  reply = () => Response.json({ detail: "x" }, { status: 500 }); assert.equal((await processingRoute.POST(post("processing", valid), params())).status, 502);
  reply = () => Response.json({ ok: true, applied: true, accountId: "acc-b", commandKey: lastKey(), processing: processing() }); assert.equal((await processingRoute.POST(post("processing", valid), params())).status, 502, "an ack for another account is unconfirmed");
  reply = () => Response.json({ ok: true, applied: true, accountId: ACCOUNT, commandKey: "b".repeat(64), processing: processing() }); assert.equal((await processingRoute.POST(post("processing", valid), params())).status, 502, "an ack for another command is unconfirmed");
  reply = () => Response.json({ ok: true, processing: processing({ account: "acc-b" }) }); assert.equal((await processingRoute.POST(post("processing", valid), params())).status, 502);
  reply = () => Response.json({ ok: true }); response = await processingRoute.POST(post("processing", valid), params()); body = await response.json();
  assert.equal(response.status, 200); assert.equal(body.processing, null, "confirmed but no readable status: the client re-reads");
  reply = () => Response.json({ ok: true, processing: { ...processing(), signedUrl: "https://cdn.invalid/s", pauseReason: "https://cdn.invalid/x" } }); assert.doesNotMatch(await (await processingRoute.POST(post("processing", valid), params())).text(), /https?:|cdn\.invalid/);

  // ---- sync route: explicit selectionVersion 4 (and 3), strict otherwise
  const job = (extra = {}) => ({ jobId: "af6b5c1e-79d0-4510-a5e2-535661d46a9f", commandKey: lastKey(), status: "pending", pagesRead: 0, itemsSeen: 0, lastError: null, requestedAt: "2026-11-15T00:00:00Z", updatedAt: "2026-11-15T00:00:00Z", completedAt: null,
    retryAt: null, pageOffset: 0, refreshMode: "full", scope: { selection: "full_vault", version: 4, scope: "full", order: "created_at_desc_id_desc" }, kindOffsets: { photo: 0, video: 0 }, pageBudget: 2500,
    coverage: { scope: "full", state: "in_progress", reason: null, established_by: null, providerTotal: { photo: null, video: null }, seen: { photo: 0, video: 0 }, uniqueImported: { photo: 0, video: 0 } }, ...extra });
  reply = () => Response.json({ schemaVersion: "of-content.v1", ok: true, applied: true, accountId: ACCOUNT, commandKey: lastKey(), sync: job() });
  const base = { requestId: REQ, expectedConnectionRevision: 3 };
  reset(); response = await syncRoute.POST(post("sync", { ...base, selectionVersion: 4 }), params()); body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body)); assert.equal(upstream[0].url, "http://127.0.0.1:1/onlyfans/content/v1/accounts/acc-a/vault/sync?progress=1");
  assert.deepEqual({ ...upstream[0].body, commandKey: "k" }, { expectedConnectionRevision: 3, selectionVersion: 4, actor: SESSION, commandKey: "k" });
  assert.equal(body.sync.scope.version, 4); assert.equal(body.sync.coverage.scope, "full"); assert.equal(body.sync.coverage.state, "in_progress");
  const withVersion = upstream[0].body.commandKey;
  reset(); await syncRoute.POST(post("sync", { ...base, selectionVersion: 3 }), params()); assert.equal(upstream[0].body.selectionVersion, 3);
  reset(); reply = () => Response.json({ schemaVersion: "of-content.v1", ok: true, applied: true, accountId: ACCOUNT, commandKey: lastKey(), sync: job({ scope: { selection: "newest_per_type", version: 3, photos: 1000, videos: 1000, order: "created_at_desc_id_desc" }, refreshMode: "window", pageBudget: undefined, kindOffsets: { photo: 0, video: 0 } }) });
  response = await syncRoute.POST(post("sync", base), params()); assert.equal(response.status, 200, await response.clone().text());
  assert.equal("selectionVersion" in upstream[0].body, false, "an absent version stays absent so the backend default is unchanged"); assert.notEqual(upstream[0].body.commandKey, withVersion, "v3 default and v4 are different commands");
  for (const selectionVersion of [1, 2, 5, "4", null, 4.5, [4], true, 0, -4]) { reset(); response = await syncRoute.POST(post("sync", { ...base, selectionVersion }), params()); assert.equal(response.status, 400, String(selectionVersion)); assert.equal(upstream.length, 0); }
  for (const extra of [{ actor: "spoof" }, { commandKey: "a".repeat(64) }, { selectionVersion: 4, scope: "full" }]) { reset(); assert.equal((await syncRoute.POST(post("sync", { ...base, ...extra }), params())).status, 400); assert.equal(upstream.length, 0); }
  reply = () => Response.json({ detail: "explicit selection version requires FansAPI" }, { status: 409 });
  response = await syncRoute.POST(post("sync", { ...base, selectionVersion: 4 }), params()); assert.equal(response.status, 409); assert.equal((await response.json()).outcome, "refused");
  console.log("PASS vault processing: agency-gated status read, session-identity commands, strict action/mediaIds validation, exact backend pass-through, other-account and URL refusal, unconfirmed outcomes, sync selectionVersion 3|4|absent");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  for (const key of Object.keys(process.env)) if (!Object.hasOwn(savedEnv, key)) delete process.env[key];
  Object.assign(process.env, savedEnv);
});
