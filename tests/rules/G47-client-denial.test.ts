// Rule (W1 lane 2 finding 10, REVIEW inv 7 "A refusal the dashboard raises before calling upstream is refused"): the engine
// request route tags the denials requireOnlyFansRead raises before any upstream call (403 agency_read_only, 503
// agency_unavailable) with its own operator schema, so submitEngineOperatorCommand reads them refused by contract. Nothing
// else reads refused by body shape: a post-upstream failure in the read-denial shape (lib/onlyfans/reads.ts mapFailure, 503)
// proves nothing was or was not applied and reads unconfirmed. Driven through tests/helpers/W2c-delta-route-harness.ts (its
// declared mocks only); fetchImpl hands the real route's Response to the client. Offline: nothing leaves the process.
// Run: nice -n 10 node --import tsx --test tests/rules/G47-client-denial.test.ts (re-runs itself under --experimental-test-module-mocks)
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { call, calls, ensureModuleMocks, reset, state } from "../helpers/W2c-delta-route-harness";
import { submitEngineOperatorCommand } from "../../lib/onlyfans/engine-operator-client";
import { denialBody } from "../../lib/onlyfans/reads";

const ROUTE = "onlyfans-controls/accounts/[accountId]/conversations/[conversationId]/requests/[requestId]";
const PARAMS = { accountId: "of-a", conversationId: "of-a:42", requestId: "0a1b2c3d-1111-4222-8333-444455556661" };
const BODY = { action: "complete", expectedRevision: 4, note: "checked", environment: "live" };
const GRANT = { creatorIds: ["11111111-1111-4111-8111-111111111111"], actor: "agency-user:a:b", canManage: false };
const submit = (reply: () => Response | Promise<Response>) => submitEngineOperatorCommand({ ...PARAMS, action: "complete", expectedRevision: 4,
  note: "checked", environment: "live", fetchImpl: (async () => reply()) as typeof fetch });
const outcome = async (reply: () => Response | Promise<Response>) => { const r = await submit(reply); return r.ok ? "ok" : r.outcome; };

if (ensureModuleMocks(import.meta.url, { controls: 1, rest: 2 })) {
  beforeEach(reset);

  test("control: the engine route's own refusal (schemaVersion, outcome refused) reads refused", async () => {
    assert.equal(await outcome(() => Response.json({ schemaVersion: "of-engine-operator.v1", ok: false, outcome: "refused", error: "Your team access is read-only." }, { status: 403 })), "refused");
  });

  test("a post-upstream failure in the read-denial shape (reads.ts mapFailure 503) reads unconfirmed, never refused", async () => {
    const failure = { ok: false, status: 503, state: "unavailable", code: "backend_unavailable", error: "The backend is unavailable." } as const;
    assert.equal(await outcome(() => Response.json(denialBody(failure), { status: 503 })), "unconfirmed");
  });

  test("finding 10: each denial the route raises before any upstream call reads refused, and nothing went upstream", async () => {
    const misread: string[] = [];
    const cases: Array<[string, () => void, number]> = [
      ["agency_read_only", () => { state.identity = { grant: { ...GRANT, canChat: false } } as never; }, 403],
      ["agency_unavailable", () => { state.identity = { grant: { ...GRANT, canChat: true } } as never; delete process.env.ONLYFANS_API_TOKEN; }, 503],
    ];
    for (const [name, arrange, status] of cases) {
      const token = process.env.ONLYFANS_API_TOKEN;
      arrange();
      const response = await call(ROUTE, PARAMS, { body: BODY });
      process.env.ONLYFANS_API_TOKEN = token;
      const read = await outcome(() => response);
      if (response.status !== status || read !== "refused" || calls.length) misread.push(`${name}: ${response.status} ${read}, ${calls.length} upstream calls`);
    }
    assert.deepEqual(misread, [], "a denial raised before any upstream call proves nothing was applied");
  });
}
