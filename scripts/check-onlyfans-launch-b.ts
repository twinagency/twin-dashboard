/** Launch B (sections D memory, E automation): contract parsers, action rules, client reply handling. Synthetic only. */
import assert from "node:assert/strict";
import { B_CAPABILITIES, bFetch } from "../lib/onlyfans/launch/b-common";
import { actionRules, parseAccounts, parseConversations, parseRuntime } from "../lib/onlyfans/launch/automation/b-automation";
import { parseFollowUps, fixtureFollowUps } from "../lib/onlyfans/launch/automation/b-follow-ups";
import { cancelFollowUp, readAccounts, readConversations, sendControl } from "../lib/onlyfans/launch/automation/b-automation-client";
import { coveragePercent, fixtureAccountCoverage, fixtureFanMemory, parseAccountCoverage, parseCoverage, parseFanMemory, validateCorrection } from "../lib/onlyfans/launch/memory/b-memory";
import { CONTROL_SCHEMA } from "../lib/onlyfans/controls";

let passed = 0;
const test = async (name: string, fn: () => void | Promise<void>) => { try { await fn(); passed++; } catch (e) { console.error("FAIL", name); throw e; } };
const realFetch = globalThis.fetch;
const stub = (impl: (url: string, init?: RequestInit) => Response | Promise<Response>) => { globalThis.fetch = (async (u: string, i?: RequestInit) => impl(String(u), i)) as typeof fetch; };
const json = (body: unknown, status = 200) => Response.json(body, { status });
const conv = (id: string, extra = {}) => ({ conversationId: id, accountId: "acc-a", revision: 3, fan: { fanId: "1", displayName: "Fan", shortRef: "f1" }, automationMode: "automated", takeoverState: "none", lastActivityAt: "2026-10-22T00:00:00Z", requiresAttention: false, ...extra });

async function main() {
  await test("capability list never marks pending contracts as real", () => {
    const real = B_CAPABILITIES.filter(c => c.source === "real").map(c => c.id).sort();
    assert.deepEqual(real, ["automation.accounts", "automation.controls", "automation.conversations", "automation.runtime"]);
    for (const id of ["memory.facts", "memory.corrections", "memory.coverage", "automation.follow-ups", "automation.emergency-stop", "automation.account-mode-write"])
      assert.equal(B_CAPABILITIES.find(c => c.id === id)?.source, "fixture");
  });
  await test("parseAccounts strict", () => {
    const ok = { accounts: [{ accountId: "acc-a", health: "connected", automationMode: "paused", binding: { handle: "@a" } }] };
    assert.equal(parseAccounts(ok)?.[0].handle, "@a");
    assert.equal(parseAccounts({ accounts: [{ ...ok.accounts[0], automationMode: "turbo" }] }), null);
    assert.equal(parseAccounts({ accounts: [ok.accounts[0], ok.accounts[0]] }), null);
    assert.equal(parseAccounts({ accounts: [{ ...ok.accounts[0], accountId: "../x y" }] }), null);
    assert.equal(parseAccounts(null), null);
  });
  await test("parseConversations rejects another account's rows and duplicates", () => {
    const body = (items: unknown[]) => ({ accountId: "acc-a", page: { items, nextCursor: null } });
    assert.equal(parseConversations(body([conv("acc-a:1")]), "acc-a")?.items.length, 1);
    assert.equal(parseConversations(body([conv("acc-a:1", { accountId: "acc-b" })]), "acc-a"), null);
    assert.equal(parseConversations(body([conv("acc-a:1"), conv("acc-a:1")]), "acc-a"), null);
    assert.equal(parseConversations({ ...body([]), accountId: "acc-b" }, "acc-a"), null);
    assert.equal(parseConversations(body([conv("acc-a:1", { revision: -1 })]), "acc-a"), null);
    assert.equal(parseConversations({ accountId: "acc-a", page: { items: [], nextCursor: "x" } }, "acc-a")?.more, true);
  });
  await test("parseRuntime", () => {
    const base = { accountId: "acc-a", section: "settings", runtimeEnabled: false, historyRecoveryRequired: true, providerConnectionVerified: true, deliveryPolicy: null };
    assert.equal(parseRuntime(base, "acc-a")?.deliveryEnabled, null);
    assert.equal(parseRuntime(base, "acc-b"), null);
    assert.equal(parseRuntime({ ...base, runtimeEnabled: "yes" }, "acc-a"), null);
  });
  await test("action rules: read-only, no-contact, state gating", () => {
    const names = (c: Parameters<typeof actionRules>[0], m: boolean) => actionRules(c, m).filter(r => r.enabled).map(r => r.action);
    assert.deepEqual(names({ automationMode: "automated", takeoverState: "none" }, false), []);
    assert.deepEqual(names({ automationMode: "automated", takeoverState: "none" }, true), ["pause_automation", "request_takeover", "mark_no_contact"]);
    assert.deepEqual(names({ automationMode: "paused", takeoverState: "none" }, true), ["resume_automation", "request_takeover", "mark_no_contact"]);
    assert.deepEqual(names({ automationMode: "human_controlled", takeoverState: "effective" }, true), ["release_takeover", "mark_no_contact"]);
    assert.deepEqual(names({ automationMode: "no_contact", takeoverState: "none" }, true), []);
    assert.equal(actionRules({ automationMode: "automated", takeoverState: "none" }, true).find(r => r.action === "mark_no_contact")?.confirm, true);
    assert(actionRules({ automationMode: "automated", takeoverState: "none" }, false).every(r => r.reason === "Your team access is read-only."));
  });
  await test("bFetch maps statuses", async () => {
    stub(() => json({ ok: false, code: "contract_pending", contract: "GET /x" }, 501)); assert.deepEqual(await bFetch("/a"), { kind: "contract_pending", contract: "GET /x" });
    stub(() => json({ ok: false }, 401)); assert.equal((await bFetch("/a")).kind, "denied");
    stub(() => json({ ok: false, code: "agency_read_only", error: "Your team access is read-only." }, 403)); assert.equal((await bFetch("/a", { method: "POST", body: {} })).kind, "readonly");
    stub(() => json({ ok: false }, 500)); assert.equal((await bFetch("/a")).kind, "unavailable");
    stub(() => json({ ok: false }, 500)); assert.equal((await bFetch("/a", { method: "POST", body: {} })).kind, "unconfirmed");
    stub(() => { throw new Error("net"); }); assert.equal((await bFetch("/a", { method: "POST", body: {} })).kind, "unconfirmed");
    stub(() => json({ error: "no" }, 409)); assert.deepEqual(await bFetch("/a", { method: "POST", body: {} }), { kind: "refused", status: 409, error: "no" });
  });
  await test("aborted request is stale, even if the network then fails", async () => {
    const c = new AbortController();
    stub(async () => { c.abort(); throw new Error("aborted"); });
    assert.equal((await bFetch("/a", { signal: c.signal })).kind, "stale");
    const c2 = new AbortController();
    stub(async () => { c2.abort(); return json({ accounts: [] }); });
    assert.equal((await bFetch("/a", { signal: c2.signal })).kind, "stale");
  });
  await test("sendControl validates the acknowledgement and URL", async () => {
    let seen: { url: string; body: unknown } | null = null;
    const ack = (over = {}) => ({ schemaVersion: CONTROL_SCHEMA, ok: true, applied: true, commandKey: "a".repeat(64), accountId: "acc-a", conversationId: "acc-a:7", action: "pause_automation", recordedRevision: 4, ...over });
    stub((url, init) => { seen = { url, body: JSON.parse(String(init?.body)) }; return json(ack()); });
    const r = await sendControl("acc-a", "acc-a:7", "pause_automation", 3);
    assert.deepEqual(r, { kind: "ok", data: { recordedRevision: 4 } });
    assert.equal(seen!.url, "/api/onlyfans-controls/accounts/acc-a/conversations/acc-a%3A7");
    assert.deepEqual(seen!.body, { action: "pause_automation", expectedRevision: 3 });
    for (const bad of [{ recordedRevision: 9 }, { accountId: "acc-b" }, { action: "resume_automation" }, { applied: false }]) {
      stub(() => json(ack(bad))); assert.equal((await sendControl("acc-a", "acc-a:7", "pause_automation", 3)).kind, "unconfirmed");
    }
    stub(() => json({ ok: false, error: "changed" }, 409)); assert.equal((await sendControl("acc-a", "acc-a:7", "pause_automation", 3)).kind, "refused");
  });
  await test("client reads shape-check and report pending contracts", async () => {
    stub(() => json({ accounts: [{ accountId: "acc-a", health: "connected", automationMode: "automated" }] })); const a = await readAccounts();
    assert(a.kind === "ok" && a.data[0].accountId === "acc-a");
    stub(() => json({ accounts: "nope" })); assert.equal((await readAccounts()).kind, "unavailable");
    stub(() => json({ accountId: "acc-b", page: { items: [], nextCursor: null } })); assert.equal((await readConversations("acc-a")).kind, "unavailable");
    stub(() => json({ ok: false, code: "contract_pending", contract: "POST /c" }, 501)); assert.equal((await cancelFollowUp("acc-a", "f1")).kind, "contract_pending");
  });
  await test("follow-up parser and fixtures", () => {
    const fx = fixtureFollowUps("acc-a");
    assert(fx.every(f => f.fanName.startsWith("FIXTURE")));
    const wire = { accountId: "acc-a", followUps: fx };
    assert.equal(parseFollowUps(wire, "acc-a")?.length, 4);
    assert.equal(parseFollowUps(wire, "acc-b"), null);
    assert.equal(parseFollowUps({ ...wire, followUps: [{ ...fx[0], status: "weird" }] }, "acc-a"), null);
    assert.equal(parseFollowUps({ ...wire, followUps: [{ ...fx[3], cancellable: true }] }, "acc-a")?.[0].cancellable, false, "sent follow-up is never cancellable");
    assert.equal(parseFollowUps({ ...wire, followUps: [fx[0], fx[0]] }, "acc-a"), null);
  });
  await test("memory parsers", () => {
    const cov = fixtureAccountCoverage("acc-a");
    assert.deepEqual(parseAccountCoverage({ accountId: "acc-a", ...cov }, "acc-a")?.fans.length, 3);
    assert.equal(parseAccountCoverage({ accountId: "acc-b", ...cov }, "acc-a"), null);
    assert.equal(parseCoverage({ ...cov.coverage, messagesImported: 10, messagesKnownTotal: 5 }), null, "imported cannot exceed total");
    assert.equal(parseCoverage({ ...cov.coverage, state: "great" }), null);
    const fan = fixtureFanMemory("acc-a", "9001")!;
    assert(parseFanMemory({ accountId: "acc-a", ...fan }, "acc-a", "9001"));
    assert.equal(parseFanMemory({ accountId: "acc-a", ...fan }, "acc-a", "9002"), null);
    assert.equal(parseFanMemory({ accountId: "acc-a", ...fan, facts: [fan.facts[0], fan.facts[0]] }, "acc-a", "9001"), null);
    assert.equal(parseFanMemory({ accountId: "acc-a", ...fan, summary: { text: "x", updatedAt: null, source: "magic" } }, "acc-a", "9001"), null);
    assert.equal(fixtureFanMemory("acc-a", "nope"), null);
    assert.equal(coveragePercent({ ...cov.coverage, messagesImported: 1, messagesKnownTotal: 3 }), 33);
    assert.equal(coveragePercent({ ...cov.coverage, messagesKnownTotal: null }), null);
    assert.equal(coveragePercent({ ...cov.coverage, messagesImported: 0, messagesKnownTotal: 0 }), null);
  });
  await test("validateCorrection", () => {
    assert.equal(validateCorrection("Alex"), null);
    assert(validateCorrection("   "));
    assert(validateCorrection("x".repeat(501)));
    assert(validateCorrection("bad\u0007bell"));
    assert.equal(validateCorrection("line one\nline two"), null);
  });
  globalThis.fetch = realFetch;
  console.log(`check-onlyfans-launch-b: ${passed} passed, 0 failed, 0 skipped`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
