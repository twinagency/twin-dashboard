// Trust-boundary checks: counters may cross the read API; secrets, another
// account's status and unsupported contracts must never reach the page.
import assert from "node:assert/strict";
import { parseOperations, formatModelUsd } from "../lib/onlyfans/operations";
import { createHttpOnlyFansBackend, ONLYFANS_SCHEMA_VERSION_HEADER } from "../lib/onlyfans/backend";

const snapshot = {
  schemaVersion: "of-operations.v3", accountId: "acc-a", asOf: "2026-10-18T00:00:00Z",
  modelCosts: {day: "2026-10-18", unit: "usd_millicents", spentMillicents: 7, capPerProviderMillicents: 10000, calls: 1, unresolvedCalls: 1, providers: 1},
  providerConnectionVerified: false, reasons: ["delivery_unresolved"],
  intake: { pending: 3, quarantined: 0 },
  planning: { generating: 0, ready: 1, unknown: 0, refused: 0, stale: 0 },
  work: { waiting: 2, claimed: 1, blocked: 0, oldestWaitingAgeSeconds: 8 },
  delivery: { queued: 1, dispatching: 0, unknown: 1, acceptedAwaitingProjection: 0, retainedUnresolvedReceipts: 1 },
  runtime: { registered: true, enabled: true, recoveryRequired: false, lastCompleteSyncAt: null },
  policy: { revision: 2, enabled: true, usedUnits: 2, limitUnits: 5, nextDispatchAt: null },
};
let checks = 0;
function rejected(name: string, change: (value: any) => void) {
  const value = structuredClone(snapshot);
  change(value);
  assert.equal(parseOperations(value, "acc-a"), null, name);
  checks++;
}
assert.deepEqual(parseOperations(snapshot, "acc-a"), snapshot); checks++;
assert.ok(parseOperations({...snapshot, reasons: ["commerce_evidence_conflict"]}, "acc-a")); checks++;
assert.equal(parseOperations(snapshot, "acc-b"), null); checks++;
rejected("future contract", v => { v.schemaVersion = "of-operations.v4"; });
rejected("old contract", v => { v.schemaVersion = "of-operations.v1"; });
rejected("wrong money unit", v => { v.modelCosts.unit = "usd_cents"; });
rejected("negative model cost", v => { v.modelCosts.spentMillicents = -1; });
rejected("secret cost field", v => { v.modelCosts.prompt = "private"; });
rejected("invalid cost day", v => { v.modelCosts.day = "2026-02-30"; });
assert.equal(formatModelUsd(1), "USD 0.0001"); checks++;
assert.equal(formatModelUsd(10000), "USD 1.0000"); checks++;
assert.equal(formatModelUsd(Number.MAX_SAFE_INTEGER), "USD 900719925474.0991"); checks++;
assert.equal(parseOperations({ ...snapshot, providerConnectionVerified: true }, "acc-a")?.providerConnectionVerified, true); checks++;
rejected("provider verification is explicit boolean evidence", v => { v.providerConnectionVerified = "yes"; });
rejected("secret field in snapshot", v => { v.sessionToken = "must-not-forward"; });
rejected("secret field in nested counter", v => { v.policy.providerKey = "must-not-forward"; });
rejected("negative allowance", v => { v.policy.limitUnits = -1; });
rejected("boolean counter", v => { v.work.waiting = true; });
rejected("fractional counter", v => { v.intake.pending = 1.5; });
rejected("unsafe integer", v => { v.delivery.unknown = Number.MAX_SAFE_INTEGER + 1; });
rejected("unknown hold text", v => { v.reasons = ["private body here"]; });
rejected("duplicate holds", v => { v.reasons.push("delivery_unresolved"); });
rejected("missing generation visibility", v => { delete v.planning; });
rejected("invalid timestamp", v => { v.asOf = "not a date"; });
rejected("timestamp without timezone", v => { v.runtime.lastCompleteSyncAt = "2026-10-18T00:00:00"; });
const notConfigured = { ...snapshot, policy: null };
assert.deepEqual(parseOperations(notConfigured, "acc-a"), notConfigured); checks++;

async function main() {
  const calls: { url: string; init?: RequestInit }[] = [];
  let answer: unknown = snapshot;
  const backend = createHttpOnlyFansBackend({ baseUrl: "https://synthetic.invalid", token: "synthetic-only",
    fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return Response.json({ schemaVersion: "of-preview.v2", operations: answer });
    }) as typeof fetch,
  });
  const result = await backend.getOperations!("acc-a");
  assert.ok(result.ok); checks++;
  assert.equal(calls[0].url, "https://synthetic.invalid/onlyfans/api/v1/accounts/acc-a/operations"); checks++;
  assert.equal(calls[0].init?.method, "GET"); checks++;
  assert.equal(calls[0].init?.credentials, "omit"); checks++;
  assert.equal(calls[0].init?.cache, "no-store"); checks++;
  const headers = new Headers(calls[0].init?.headers);
  assert.equal(headers.get("authorization"), "Bearer synthetic-only"); checks++;
  assert.equal(headers.get(ONLYFANS_SCHEMA_VERSION_HEADER), "of-preview.v2"); checks++;
  answer = { ...snapshot, accountId: "acc-b" };
  assert.equal((await backend.getOperations!("acc-a")).ok, false); checks++;
  answer = { ...snapshot, sessionToken: "must-not-forward" };
  assert.equal((await backend.getOperations!("acc-a")).ok, false); checks++;
  const before = calls.length;
  assert.equal((await backend.getOperations!("../acc-b")).ok, false); checks++;
  assert.equal(calls.length, before); checks++;
  console.log(`${checks} operations trust-boundary checks passed`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
