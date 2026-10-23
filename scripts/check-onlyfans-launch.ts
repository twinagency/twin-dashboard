import assert from "node:assert/strict";
import { FIXTURES } from "../lib/onlyfans/launch/a-fixtures";
import { createLaunchBackend, type LaunchBackend } from "../lib/onlyfans/launch/a-backend";
import { dispatchLaunch, type LaunchCall } from "../lib/onlyfans/launch/a-route";
import { LAUNCH_SCHEMA, PARSERS, SCREENS, WIRING, validCommand } from "../lib/onlyfans/launch/a-types";

let passed = 0;
const t = (name: string, fn: () => void | Promise<void>) => Promise.resolve(fn()).then(() => { passed++; }, e => { console.error("FAIL", name); throw e; });
const jr = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

async function main() {
  await t("fixtures satisfy the same parsers as live data", () => { for (const s of SCREENS) assert(PARSERS[s](FIXTURES[s]), s); });
  await t("parsers reject malformed answers", () => {
    assert.equal(PARSERS.readiness({ asOf: null, blockers: [{ id: "x" }] }), null);
    assert.equal(PARSERS.readiness({ asOf: null, blockers: [{ ...FIXTURES.readiness.blockers[0], action: { label: "x", kind: "link", href: "https://evil" } }] }), null);
    assert.equal(PARSERS.purchases({ ...FIXTURES.purchases, scan: { ...FIXTURES.purchases.scan, state: "fine" } }), null);
    assert.equal(PARSERS.personality(null), null);
  });
  await t("no screen is ever marked fully connected without a backend contract", () => { for (const s of SCREENS) assert.notEqual(WIRING[s].wiring, "connected"); });
  await t("purchase resolution never invents evidence", () => {
    const base = { path: "purchases/resolve", id: "p-1", body: { expectedRevision: 1, resolution: "confirmed_owned", reason: "ok", evidenceId: null } };
    assert.equal(validCommand(base), false, "confirmed_owned needs evidence");
    assert.equal(validCommand({ ...base, body: { ...base.body, evidenceId: "e-1" } }), true);
    assert.equal(validCommand({ ...base, body: { ...base.body, resolution: "not_owned" } }), true);
    assert.equal(validCommand({ ...base, body: { ...base.body, resolution: "not_owned", reason: "  " } }), false);
    assert.equal(validCommand({ ...base, body: { ...base.body, resolution: "owned" } }), false);
    assert.equal(validCommand({ ...base, body: { ...base.body, evidenceId: "e-1", actor: "me" } }), false, "no actor from the browser");
    assert.equal(validCommand({ ...base, body: { ...base.body, evidenceId: "e-1", commandKey: "k" } }), false);
  });
  await t("commands reject unknown paths, bad ids, D/E paths and extra keys", () => {
    for (const path of ["memory/fact", "automation/mode", "automation/emergency-stop", "x"]) assert.equal(validCommand({ path, id: null, body: { expectedRevision: 1 } }), false, path);
    assert.equal(validCommand({ path: "purchases/retry", id: "../x", body: { expectedRevision: 1 } }), false);
    assert.equal(validCommand({ path: "purchases/retry", id: "p-1", body: { expectedRevision: -1 } }), false);
    assert.equal(validCommand({ path: "purchases/retry", id: "p-1", body: { expectedRevision: 1, price: 5 } }), false);
    assert.equal(validCommand({ path: "personality/settings", id: null, body: { expectedRevision: 1, model: "m", dailyBudgetCents: 1.5, maxRepliesPerHour: 1, allowSales: true } }), false);
    assert.equal(validCommand({ path: "personality/settings", id: null, body: { expectedRevision: 1, model: "m", dailyBudgetCents: 100, maxRepliesPerHour: 1, allowSales: true } }), true);
    assert.equal(validCommand({ path: "personality/draft", id: "d-1", body: { expectedRevision: 1, edited: "" } }), false);
  });

  const sent: { path: string; body: unknown }[] = [];
  const fake: LaunchBackend = {
    read: async (_a, path) => ({ ok: true, data: path === "readiness" ? FIXTURES.readiness : null }),
    command: async (_a, path, body) => { sent.push({ path, body }); return { ok: true, data: null }; },
  };
  const call = (over: Partial<LaunchCall>): LaunchCall => ({ method: "GET", accountId: "acc-a", path: ["readiness"], query: new URLSearchParams(), actor: "op:1", canManage: true, ...over });
  const cmd = { path: "purchases/retry", id: "p-1", body: { expectedRevision: 3 } };

  await t("access reports permission without a backend", async () => {
    const a = await dispatchLaunch(call({ path: ["access"], canManage: false }), null);
    assert.equal(a.status, 200); assert.deepEqual((a.body as { data: unknown }).data, { canManage: false });
  });
  await t("unconfigured backend is an explicit 503, never fixtures", async () => {
    const a = await dispatchLaunch(call({}), null); assert.equal(a.status, 503); assert.equal((a.body as { outcome: string }).outcome, "unavailable");
  });
  await t("reads whitelist screens and validate filters", async () => {
    assert.equal((await dispatchLaunch(call({}), fake)).status, 200);
    assert.equal((await dispatchLaunch(call({ path: ["memory"] }), fake)).status, 404);
    assert.equal((await dispatchLaunch(call({ path: ["readiness", "x"] }), fake)).status, 404);
    assert.equal((await dispatchLaunch(call({ query: new URLSearchParams("after=../x") }), fake)).status, 400);
  });
  await t("read-only team members cannot change anything", async () => {
    const a = await dispatchLaunch(call({ method: "POST", path: ["command"], body: cmd, canManage: false }), fake); assert.equal(a.status, 403);
    assert.equal((await dispatchLaunch(call({ method: "POST", path: ["command"], body: cmd, actor: null }), fake)).status, 403);
    assert.equal(sent.length, 0);
  });
  await t("writes derive actor and a stable command key server-side", async () => {
    const one = await dispatchLaunch(call({ method: "POST", path: ["command"], body: cmd }), fake);
    await dispatchLaunch(call({ method: "POST", path: ["command"], body: structuredClone(cmd) }), fake);
    await dispatchLaunch(call({ method: "POST", path: ["command"], body: { ...cmd, body: { expectedRevision: 4 } } }), fake);
    assert.equal(one.status, 200);
    const [a, b, c] = sent.map(s => s.body as { actor: string; commandKey: string });
    assert.equal(sent[0].path, "purchases/retry/p-1"); assert.equal(a.actor, "op:1");
    assert.equal(a.commandKey, b.commandKey, "retry of the same request resolves to the same command");
    assert.notEqual(a.commandKey, c.commandKey);
    assert.match(a.commandKey, /^[a-f0-9]{64}$/);
  });
  await t("invalid write bodies and paths are refused before the backend", async () => {
    const n = sent.length;
    assert.equal((await dispatchLaunch(call({ method: "POST", path: ["command"], body: { ...cmd, path: "memory/fact" } }), fake)).status, 400);
    assert.equal((await dispatchLaunch(call({ method: "POST", path: ["purchases"], body: cmd }), fake)).status, 400);
    assert.equal(sent.length, n);
  });

  const mk = (fetchImpl: typeof fetch) => createLaunchBackend({ baseUrl: "https://b.example/", token: "t".repeat(20), fetchImpl });
  await t("transport sends the version header and binds the account", async () => {
    let seen: { url: string; headers: Record<string, string> } | null = null;
    const b = mk((async (url: string, init: RequestInit) => { seen = { url, headers: init.headers as Record<string, string> }; return jr({ schemaVersion: LAUNCH_SCHEMA, ok: true, accountId: "acc-a", data: { x: 1 } }); }) as never);
    const r = await b.read("acc-a", "readiness", {}); assert.equal(r.ok, true);
    assert.equal(seen!.url, "https://b.example/onlyfans/launch/v1/accounts/acc-a/readiness"); assert.equal(seen!.headers["X-OnlyFans-Launch-Version"], LAUNCH_SCHEMA);
    const wrong = mk((async () => jr({ schemaVersion: LAUNCH_SCHEMA, ok: true, accountId: "acc-b", data: {} })) as never);
    assert.equal((await wrong.read("acc-a", "readiness", {})).ok, false, "another account's answer is refused");
  });
  await t("missing contract maps to unavailable; lost write reply is unconfirmed", async () => {
    const r = await mk((async () => jr({}, 404)) as never).read("acc-a", "purchases", {});
    assert.deepEqual([r.ok, !r.ok && r.outcome], [false, "unavailable"]);
    const w = await mk((async () => { throw new Error("socket"); }) as never).command("acc-a", "purchases/retry/p-1", {});
    assert.deepEqual([w.ok, !w.ok && w.outcome], [false, "unconfirmed"]);
    const c = await mk((async () => jr({}, 409)) as never).command("acc-a", "x", {});
    assert.equal(!c.ok && c.status, 409);
    const bad = await mk((async () => jr({ schemaVersion: LAUNCH_SCHEMA, ok: true, accountId: "acc-a" })) as never).command("acc-a", "x", {});
    assert.equal(!bad.ok && bad.outcome, "unconfirmed", "a 200 without applied:true is not success");
  });
  console.log(`check-onlyfans-launch: ${passed} passed, 0 failed`);
}
main().catch(e => { console.error(e); process.exit(1); });
