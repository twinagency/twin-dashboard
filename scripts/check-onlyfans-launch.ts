/** Launch A/B/C: readiness checklist, ledger status and durable retry, personality import/review/approval/history. Synthetic backend only. */
import assert from "node:assert/strict";
import { dispatchLaunch } from "../lib/onlyfans/launch/a-route";
import { parseReadiness, parseAccess, SCREENS } from "../lib/onlyfans/launch/a-types";
import { composeReadiness } from "../lib/onlyfans/launch/live/readiness";
import { ledgerRead, ledgerRetry, parseLedger, retryAdvice } from "../lib/onlyfans/launch/live/ledger";
import { personalityCommand, personalityRead, parsePersonality, validReview } from "../lib/onlyfans/launch/live/personality";
import type { Env } from "../lib/onlyfans/launch/live/upstream";
import { AGENCY_ACCESS_HEADER, AGENCY_ACCESS_VERSION, AGENCY_SCOPE_HEADER, agencyScopedFetch, type AgencyGrant } from "../lib/onlyfans/agency-scope";
import { BASE, TOKENS } from "./support/onlyfans-launch-fake";
import { FP, fakeBackend, json, ledgerBody, personalityBody, recoveryBody, setEnv, POLICY } from "./support/onlyfans-launch-fake";

setEnv();
let passed = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { try { await fn(); passed++; } catch (e) { console.error("FAIL", name); throw e; } };
const ACTOR = "op-session:" + "1".repeat(64);
const env = (f: typeof fetch, over: Partial<Env> = {}): Env => ({ fetch: f, accountId: "acc-a", actor: ACTOR, canManage: true, agency: false, ...over });
const body = (a: { body: Record<string, unknown> }) => a.body as { ok: boolean; data?: any; code?: string; outcome?: string; error?: string };
const settings = async () => ({ providerConnectionVerified: true, historyRecoveryRequired: false, runtimeEnabled: true, deliveryPolicy: { enabled: true } });

async function main() {
  await t("screens are readiness, ledger and personality", () => assert.deepEqual(SCREENS, ["readiness", "ledger", "personality"]));
  await t("access answers locally and distinguishes operator from team", async () => {
    const b = fakeBackend();
    const op = body(await dispatchLaunch({ method: "GET", env: env(b.fetch), path: ["access"] }));
    assert.deepEqual(op.data, { canManage: true, accountPause: true });
    assert.deepEqual(body(await dispatchLaunch({ method: "GET", env: env(b.fetch, { agency: true }), path: ["access"] })).data, { canManage: true, accountPause: false });
    assert.deepEqual(body(await dispatchLaunch({ method: "GET", env: env(b.fetch, { canManage: false, agency: true }), path: ["access"] })).data, { canManage: false, accountPause: false });
    assert.equal(b.calls.length, 0, "access needs no backend");
    assert.deepEqual(parseAccess(op.data), { canManage: true, accountPause: true });
  });

  // ---------- ledger ----------
  await t("ledger read: uses the read purpose, validates the account and shape", async () => {
    const b = fakeBackend(); const r = body(await ledgerRead(env(b.fetch)));
    assert.equal(r.ok, true); assert.equal(r.data.status, "held"); assert.equal(b.last().path, "/onlyfans/api/v1/accounts/acc-a/ledger");
    assert.equal(b.last().headers.authorization, "Bearer api-token-aaaaaaaaaaaa");
    for (const bad of [ledgerBody("acc-b"), ledgerBody("acc-a", { status: "weird" }), ledgerBody("acc-a", { scanFingerprint: "nothex" }), ledgerBody("acc-a", { status: "not_started" }), ledgerBody("acc-a", { conflictCount: -1 }), { ...ledgerBody(), schemaVersion: "of-ledger.v2" }]) {
      const x = fakeBackend({ ledger: () => json(bad) }); const a = await ledgerRead(env(x.fetch)); assert.notEqual(a.status, 200, JSON.stringify(bad).slice(0, 80));
    }
    assert.equal((await ledgerRead(env(fakeBackend({ ledger: () => json({}, 404) }).fetch))).status, 404);
    assert.equal((await ledgerRead(env(fakeBackend({ ledger: () => { throw new Error("net"); } }).fetch))).status, 503);
    assert.equal(parseLedger(ledgerBody("acc-a", { status: "not_started", scanFingerprint: null, windowStart: null, windowEnd: null, pageOffset: null, nextPollAt: null, lastError: null, connectionRevision: null }), "acc-a")?.status, "not_started");
  });
  await t("ledger retry: server derives actor and a stable key; success is 'queued', never reconciled", async () => {
    const b = fakeBackend(); const input = { expectedConnectionRevision: 7, expectedScanFingerprint: FP };
    const one = await ledgerRetry(env(b.fetch), input), two = await ledgerRetry(env(b.fetch), { ...input });
    assert.equal(one.status, 200); assert.equal(body(one).outcome, "queued"); assert.equal(body(one).data.outcome, "queued");
    assert.doesNotMatch(JSON.stringify(one.body), /reconcil/i);
    const [c1, c2] = b.calls.map(c => c.body as { commandKey: string }); assert.match(c1.commandKey, /^[a-f0-9]{64}$/); assert.equal(c1.commandKey, c2.commandKey, "same click replays the same command");
    assert.equal(b.calls[0].headers["x-onlyfans-actor"], ACTOR); assert.equal(b.calls[0].path, "/onlyfans/control/v1/accounts/acc-a/ledger/retry");
    assert.equal(b.calls[0].headers.authorization, "Bearer control-token-bbbbbbbb");
    assert.deepEqual(Object.keys(b.calls[0].body as object).sort(), ["commandKey", "expectedConnectionRevision", "expectedScanFingerprint"]);
    await ledgerRetry(env(b.fetch), { ...input, expectedConnectionRevision: 8 });
    assert.notEqual((b.calls[2].body as { commandKey: string }).commandKey, c1.commandKey, "a different state is a different command");
    await ledgerRetry(env(b.fetch, { actor: "agency-user:11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222" }), input);
    assert.notEqual((b.calls[3].body as { commandKey: string }).commandKey, c1.commandKey, "the key is bound to the actor");
  });
  await t("ledger retry: read-only, invalid input and a client-supplied actor are refused before the backend", async () => {
    const b = fakeBackend(); const input = { expectedConnectionRevision: 7, expectedScanFingerprint: FP };
    assert.equal((await ledgerRetry(env(b.fetch, { canManage: false }), input)).status, 403);
    assert.equal((await ledgerRetry(env(b.fetch, { actor: null }), input)).status, 403);
    for (const bad of [{ ...input, actor: "me" }, { ...input, commandKey: "x" }, { expectedConnectionRevision: -1, expectedScanFingerprint: FP }, { expectedConnectionRevision: 7, expectedScanFingerprint: "short" }, { expectedConnectionRevision: "7", expectedScanFingerprint: FP }, null])
      assert.equal((await ledgerRetry(env(b.fetch), bad)).status, 400);
    assert.equal(b.calls.length, 0);
  });
  await t("ledger retry: conflicts keep their code; lost or garbled replies are unconfirmed, never success", async () => {
    const input = { expectedConnectionRevision: 7, expectedScanFingerprint: FP };
    const r409 = await ledgerRetry(env(fakeBackend({ "ledger.retry": () => json({ schemaVersion: "of-controls.v1", ok: false, code: "ledger_state_changed" }, 409) }).fetch), input);
    assert.equal(r409.status, 409); assert.equal(body(r409).code, "ledger_state_changed");
    for (const h of [() => { throw new Error("timeout"); }, () => json({}, 500), () => json({ schemaVersion: "of-controls.v1", ok: true, outcome: "queued" }),
      () => json({ schemaVersion: "of-controls.v1", ok: true, accepted: true, outcome: "reconciled", commandKey: "z", accountId: "acc-a", queuedAt: "x" }),
      () => new Response("not json", { status: 200 })]) {
      const a = await ledgerRetry(env(fakeBackend({ "ledger.retry": h as never }).fetch), input);
      assert.equal(a.status, 502); assert.equal(body(a).outcome, "unconfirmed");
    }
    const wrong = await ledgerRetry(env(fakeBackend({ "ledger.retry": (c: any, m: any) => json({ schemaVersion: "of-controls.v1", ok: true, accepted: true, outcome: "queued", commandKey: c.body.commandKey, accountId: "acc-b", queuedAt: "x" }) }).fetch), input);
    assert.equal(wrong.status, 502, "another account's acknowledgement is not accepted");
  });
  await t("retry advice follows state and permission", () => {
    const l = parseLedger(ledgerBody(), "acc-a")!;
    assert.equal(retryAdvice(l, true).allowed, true);
    assert.equal(retryAdvice(l, false).allowed, false);
    assert.equal(retryAdvice({ ...l, leaseActive: true }, true).allowed, false);
    assert.equal(retryAdvice({ ...l, status: "idle" }, true).allowed, false);
    assert.equal(retryAdvice({ ...l, connectionCurrent: false }, true).allowed, false);
  });
  await t("dispatch: only the ledger retry command exists; other paths and shapes are refused", async () => {
    const b = fakeBackend(); const ok = { path: "ledger/retry", id: null, body: { expectedConnectionRevision: 7, expectedScanFingerprint: FP } };
    assert.equal((await dispatchLaunch({ method: "POST", env: env(b.fetch), path: ["command"], body: ok })).status, 200);
    for (const bad of [{ ...ok, path: "purchases/retry" }, { ...ok, id: "x" }, { ...ok, extra: 1 }, { path: "personality/approve", id: null, body: {} }]) assert.equal((await dispatchLaunch({ method: "POST", env: env(b.fetch), path: ["command"], body: bad })).status, 400);
    assert.equal((await dispatchLaunch({ method: "POST", env: env(b.fetch), path: ["ledger"], body: ok })).status, 400);
    assert.equal((await dispatchLaunch({ method: "POST", env: env(b.fetch, { canManage: false }), path: ["command"], body: ok })).status, 403);
    assert.equal((await dispatchLaunch({ method: "GET", env: env(b.fetch), path: ["purchases"] })).status, 404);
    assert.equal((await dispatchLaunch({ method: "GET", env: env(b.fetch), path: ["ledger", "x"] })).status, 404);
  });

  // ---------- personality ----------
  await t("personality read: empty, draft and approved parse; wrong envelope is unreadable", async () => {
    const e = body(await personalityRead(env(fakeBackend().fetch), {})); assert.equal(e.data.state, "empty");
    for (const s of ["draft", "approved"] as const) { const x = fakeBackend({ personality: (_c: any, m: any) => json({ schemaVersion: "of-configuration.v3", ok: true, accountId: m[1], personalityVersion: "of-personality.v1", personality: personalityBody(s) }) });
      assert.equal(body(await personalityRead(env(x.fetch), {})).data.state, s); }
    assert.equal(parsePersonality(personalityBody("draft", { revision: -1 })), null);
    assert.equal(parsePersonality({ ...personalityBody("draft"), version: "of-personality.v2" }), null);
    assert.equal(parsePersonality(personalityBody("approved", { document: { ...personalityBody("approved").document, approval: undefined } })), null, "approved needs an approval record");
    const wrongAcct = fakeBackend({ personality: () => json({ schemaVersion: "of-configuration.v3", ok: true, accountId: "acc-b", personalityVersion: "of-personality.v1", personality: personalityBody("empty") }) });
    assert.equal((await personalityRead(env(wrongAcct.fetch), {})).status, 503, "another account's answer is never shown");
  });
  await t("readiness is never true without a verified credential", () => {
    const lying = personalityBody("approved", { readiness: { ...((personalityBody("approved") as any).readiness as object), ready: true, credential: { state: "usable", configured: true, metadataAvailable: false } } });
    assert.equal(parsePersonality(lying), null);
    const named = personalityBody("approved", { readiness: { ...((personalityBody("approved") as any).readiness as object), ready: true, credential: { state: "metadata_unavailable", configured: false, metadataAvailable: false } } });
    assert.equal(parsePersonality(named), null, "a saved model name is not readiness");
    assert.equal(parsePersonality(personalityBody("approved", {}, true))?.readiness?.ready, true);
    assert.equal(parsePersonality(personalityBody("approved", {}, false))?.readiness?.ready, false);
  });
  await t("history and revision reads validate their cursors", async () => {
    const b = fakeBackend(); const h = body(await personalityRead(env(b.fetch), { history: { before: "5" } }));
    assert.equal(h.data.nextBefore, 2); assert.equal(b.last().query, "?before=5");
    assert.equal((await personalityRead(env(b.fetch), { history: { before: "../x" } })).status, 400);
    assert.equal((await personalityRead(env(b.fetch), { revision: "0" })).status, 400);
    const n = b.calls.length; assert.equal((await personalityRead(env(b.fetch), { history: { before: null } })).status, 200); assert.equal(b.calls.length, n + 1);
  });
  await t("import/review/approve: server-derived actor and key, exact backend body, success only when the recorded state matches", async () => {
    const b = fakeBackend();
    const imp = await personalityCommand(env(b.fetch), "import", { expectedRevision: 0, bindingId: "bind-1" });
    assert.equal(imp.status, 200); assert.equal(body(imp).outcome, "recorded");
    let c = b.calls[0].body as Record<string, unknown>; assert.deepEqual(Object.keys(c).sort(), ["actor", "commandKey", "expectedRevision"]); assert.equal(c.actor, ACTOR); assert.equal(b.calls[0].path.endsWith("/personality/import"), true);
    const review = { persona: "Warm and brief", creatorFacts: { job: "Nurse", kids: null }, defaultModel: "m1", replyModelOverride: null };
    const rv = await personalityCommand(env(b.fetch), "review", { expectedRevision: 1, bindingId: "bind-1", review });
    assert.equal(rv.status, 200); c = b.calls[1].body as Record<string, unknown>; assert.deepEqual(c.review, review);
    const rv2 = await personalityCommand(env(b.fetch), "review", { expectedRevision: 1, bindingId: "bind-1", review: { ...review } });
    assert.equal((b.calls[2].body as { commandKey: string }).commandKey, c.commandKey, "identical retry = identical key");
    assert.equal(rv2.status, 200);
    await personalityCommand(env(b.fetch), "review", { expectedRevision: 2, bindingId: "bind-1", review });
    assert.notEqual((b.calls[3].body as { commandKey: string }).commandKey, c.commandKey, "a new revision is a new command");
    const ap = await personalityCommand(env(b.fetch), "approve", { expectedRevision: 1, bindingId: "bind-1", acknowledgements: { mixedAuthorship: true, runtimeRules: true, factsVerified: true } });
    assert.equal(ap.status, 200); assert.deepEqual((b.last().body as any).acknowledgements, { mixedAuthorship: true, runtimeRules: true, factsVerified: true });
    assert.equal(b.last().headers.authorization, "Bearer config-token-cccccccc");
  });
  await t("personality commands refuse read-only, bad input, partial acknowledgements and unrecognised replies", async () => {
    const b = fakeBackend(); const ok = { expectedRevision: 1, bindingId: "bind-1" }; const acks = { mixedAuthorship: true, runtimeRules: true, factsVerified: true };
    assert.equal((await personalityCommand(env(b.fetch, { canManage: false }), "import", ok)).status, 403);
    assert.equal((await personalityCommand(env(b.fetch, { actor: null }), "import", ok)).status, 403);
    for (const [a, x] of [["import", { ...ok, actor: "me" }], ["import", { expectedRevision: -1, bindingId: "b" }], ["import", { expectedRevision: 1 }], ["review", { ...ok, review: {} }], ["review", ok],
      ["review", { ...ok, review: { persona: "x", actor: "y" } }], ["review", { ...ok, review: { persona: "x", creatorFacts: {} } }], ["review", { ...ok, review: { persona: "x", creatorFacts: { secret: "1" } } }],
      ["review", { ...ok, review: { persona: "x".repeat(4097) } }], ["approve", { ...ok, acknowledgements: { ...acks, factsVerified: false } }], ["approve", { ...ok, acknowledgements: { mixedAuthorship: true } }], ["approve", ok]] as const)
      assert.equal((await personalityCommand(env(b.fetch), a, x)).status, 400, JSON.stringify(x).slice(0, 60));
    assert.equal(b.calls.length, 0);
    const approvedDraft = fakeBackend({ "personality.post": (c: any, m: any) => json({ schemaVersion: "of-configuration.v3", ok: true, accountId: m[1], personalityVersion: "of-personality.v1", personality: personalityBody("draft"), commandKey: c.body.commandKey }) });
    const r = await personalityCommand(env(approvedDraft.fetch), "approve", { ...ok, acknowledgements: acks });
    assert.equal(r.status, 502, "an approval answered with a draft is not an approval"); assert.equal(body(r).outcome, "unconfirmed");
    const otherKey = fakeBackend({ "personality.post": (_c: any, m: any) => json({ schemaVersion: "of-configuration.v3", ok: true, accountId: m[1], personalityVersion: "of-personality.v1", personality: personalityBody("draft"), commandKey: "0".repeat(64) }) });
    assert.equal((await personalityCommand(env(otherKey.fetch), "import", ok)).status, 502);
    for (const h of [() => { throw new Error("timeout"); }, () => json({}, 500)]) { const x = await personalityCommand(env(fakeBackend({ "personality.post": h as never }).fetch), "import", ok); assert.equal(body(x).outcome, "unconfirmed"); }
    const stale = await personalityCommand(env(fakeBackend({ "personality.post": () => json({ ok: false, code: "personality_conflict" }, 409) }).fetch), "import", ok);
    assert.equal(stale.status, 409);
    assert.equal(validReview({ persona: "x", replyModelOverride: null }), true);
    assert.equal(validReview({ persona: "   " }), false);
  });

  // ---------- readiness ----------
  const find = (a: { body: Record<string, unknown> }, id: string) => (body(a).data.blockers as { id: string; status: string; detail: string }[]).find(x => x.id === id)!;
  await t("readiness checklist: every row comes from a real read and unreadable sources are Not verified", async () => {
    const b = fakeBackend();
    const a = await composeReadiness(env(b.fetch), settings, () => new Date("2026-10-23T06:00:00Z"));
    assert.equal(a.status, 200); assert(parseReadiness(body(a).data)); assert.equal(body(a).data.asOf, "2026-10-23T06:00:00.000Z");
    assert.deepEqual(body(a).data.blockers.map((x: { id: string }) => x.id), ["connection", "history", "ledger", "personality", "delivery", "engagement"]);
    assert.equal(find(a, "connection").status, "ok"); assert.equal(find(a, "history").status, "warn");
    assert.equal(find(a, "ledger").status, "blocked", "held scan blocks"); assert.equal(find(a, "personality").status, "blocked", "no personality yet");
    assert.equal(find(a, "delivery").status, "ok"); assert.equal(find(a, "engagement").status, "ok");
    const down = fakeBackend({ ledger: () => json({}, 503), personality: () => { throw new Error("x"); }, recovery: () => json({}, 500), engagement: () => json({}, 404) });
    const u = await composeReadiness(env(down.fetch), async () => null);
    for (const id of ["connection", "history", "ledger", "personality", "delivery", "engagement"]) assert.equal(find(u, id).status, "unknown", id);
    const thrown = await composeReadiness(env(down.fetch), async () => { throw new Error("boom"); });
    assert.equal(find(thrown, "connection").status, "unknown");
  });
  await t("readiness: ok only when the backend says so", async () => {
    const good = fakeBackend({ ledger: (_c: any, m: any) => json(ledgerBody(m[1], { status: "idle", requiresInvestigation: false, commerceHeld: false, lastCompleteAt: "2026-10-23T05:00:00Z", lastError: null })),
      personality: (_c: any, m: any) => json({ schemaVersion: "of-configuration.v3", ok: true, accountId: m[1], personalityVersion: "of-personality.v1", personality: personalityBody("approved", {}, true) }),
      recovery: (_c: any, m: any) => json({ schemaVersion: "of-configuration.v3", ok: true, accountId: m[1], progress: recoveryBody(m[1], null, { status: "complete", discoveryComplete: true, conversationsComplete: 10, conversationsRetrying: 0 }) }) });
    const a = await composeReadiness(env(good.fetch), settings);
    for (const id of ["connection", "history", "ledger", "personality", "delivery", "engagement"]) assert.equal(find(a, id).status, "ok", id);
    const notReady = fakeBackend({ personality: (_c: any, m: any) => json({ schemaVersion: "of-configuration.v3", ok: true, accountId: m[1], personalityVersion: "of-personality.v1", personality: personalityBody("approved", {}, false) }) });
    assert.equal(find(await composeReadiness(env(notReady.fetch), settings), "personality").status, "blocked");
    const unverified = await composeReadiness(env(good.fetch), async () => ({ providerConnectionVerified: false, historyRecoveryRequired: true, runtimeEnabled: false, deliveryPolicy: null }));
    assert.equal(find(unverified, "connection").status, "blocked"); assert.equal(find(unverified, "delivery").status, "warn"); assert.equal(find(unverified, "history").status, "warn");
    assert.equal(parseReadiness({ asOf: null, blockers: [{ id: "x" }] }), null);
    assert.equal(parseReadiness({ asOf: null, blockers: [{ id: "a", area: "b", status: "ok", title: "t", detail: "d", evidence: null, action: { label: "l", href: "https://evil" } }] }), null);
  });
  await t("every read stays on the requested account (no cross-account bleed)", async () => {
    const b = fakeBackend();
    await composeReadiness(env(b.fetch, { accountId: "acc-b" }), settings); await ledgerRead(env(b.fetch, { accountId: "acc-b" }));
    assert(b.calls.length >= 5 && b.calls.every(c => c.path.includes("/accounts/acc-b/")), b.calls.map(c => c.path).join());
    const n = b.calls.length; assert.equal((await ledgerRead(env(b.fetch, { accountId: "../x" }))).status, 400, "an unsafe account id never reaches a route"); assert.equal(b.calls.length, n);
  });
  // ---------- agency scope end to end ----------
  const UU = "11111111-1111-4111-8111-111111111111", U2 = "22222222-2222-4222-8222-222222222222";
  const gateway = (inner: typeof fetch, innerCalls: string[]) => (async (input: string | URL, init?: RequestInit) => {
    const u = new URL(String(input)), h = new Headers(init?.headers), tag = { [AGENCY_ACCESS_HEADER]: AGENCY_ACCESS_VERSION };
    if (u.pathname === "/onlyfans/agency/v1/api/v1/status") return new Response("{}", { headers: tag });
    const scope = JSON.parse(h.get(AGENCY_SCOPE_HEADER) ?? "{}") as AgencyGrant;
    const path = u.pathname.replace("/onlyfans/agency/v1", "/onlyfans"), acct = path.match(/accounts\/(acc-[a-z]+)/)?.[1];
    if (acct !== "acc-a") return Response.json({ ok: false, code: "not_available" }, { status: 404, headers: tag });   // acc-b belongs to a creator outside the grant
    if (init?.method === "POST" && !scope.canManage) return Response.json({ ok: false, code: "agency_scope_denied" }, { status: 403, headers: tag });
    innerCalls.push(`${init?.method ?? "GET"} ${path}`);
    const r = await inner(BASE + path + u.search, init); return new Response(await r.text(), { status: r.status, headers: { ...tag, "content-type": "application/json" } });
  }) as typeof fetch;
  const grant = (canManage: boolean): AgencyGrant => ({ creatorIds: [UU], actor: `agency-user:${UU}:${U2}`, canManage });
  await t("agency: a grant reaches only its own account and never sees another creator's data", async () => {
    const innerCalls: string[] = [], b = fakeBackend();
    const f = agencyScopedFetch(grant(true), { baseUrl: BASE, token: TOKENS.ONLYFANS_API_TOKEN }, gateway(b.fetch, innerCalls));
    const e = (accountId: string): Env => ({ fetch: f, accountId, actor: grant(true).actor, canManage: true, agency: true });
    assert.equal((await ledgerRead(e("acc-a"))).status, 200);
    for (const out of [await ledgerRead(e("acc-b")), await personalityRead(e("acc-b"), {}), await personalityCommand(e("acc-b"), "import", { expectedRevision: 0, bindingId: "bind-1" }),
      await ledgerRetry(e("acc-b"), { expectedConnectionRevision: 7, expectedScanFingerprint: FP })]) { assert.equal(out.status, 404); assert.equal(JSON.stringify(out.body).includes("held"), false); }
    assert(innerCalls.every(c => c.includes("/accounts/acc-a/")), innerCalls.join());
    const imp = await personalityCommand(e("acc-a"), "import", { expectedRevision: 0, bindingId: "bind-1" });
    assert.equal(imp.status, 200); assert.equal(b.last().headers["x-onlyfans-agency-scope"], JSON.stringify(grant(true)));
    assert.equal((b.last().body as { actor: string }).actor, grant(true).actor, "the actor sent is the verified agency identity");
  });
  await t("agency: a read-only grant can read but the transport itself refuses writes", async () => {
    const innerCalls: string[] = [], b = fakeBackend();
    const f = agencyScopedFetch(grant(false), { baseUrl: BASE, token: TOKENS.ONLYFANS_API_TOKEN }, gateway(b.fetch, innerCalls));
    const readOnly: Env = { fetch: f, accountId: "acc-a", actor: grant(false).actor, canManage: false, agency: true };
    assert.equal((await ledgerRead(readOnly)).status, 200); assert.equal((await personalityRead(readOnly, {})).status, 200);
    assert.equal((await personalityCommand(readOnly, "approve", { expectedRevision: 1, bindingId: "bind-1", acknowledgements: { mixedAuthorship: true, runtimeRules: true, factsVerified: true } })).status, 403);
    // Even if a handler were wrongly told the user may manage, the scoped transport refuses the write.
    const bypass: Env = { ...readOnly, canManage: true };
    const w = await ledgerRetry(bypass, { expectedConnectionRevision: 7, expectedScanFingerprint: FP }); assert.notEqual(w.status, 200);
    const p = await personalityCommand(bypass, "import", { expectedRevision: 0, bindingId: "bind-1" }); assert.notEqual(p.status, 200);
    assert.equal(innerCalls.filter(c => c.startsWith("POST")).length, 0, "no write reached the backend");
  });
  console.log(`check-onlyfans-launch: ${passed} passed, 0 failed`);
}
main().catch(e => { console.error(e); process.exit(1); });
