// Rule (W1 lane 2 finding 4, REVIEW inv 7 "No false success"): submitEngineOperatorCommand reads success only from a 2xx
// whose body says recorded. A non-2xx reply is never success, whatever its body claims. Offline: fetchImpl fake.
import assert from "node:assert/strict";
import test from "node:test";
import { submitEngineOperatorCommand } from "../../lib/onlyfans/engine-operator-client";

const submit = (reply: () => Response) => submitEngineOperatorCommand({ accountId: "of-a", conversationId: "of-a:42",
  requestId: "0a1b2c3d-1111-4222-8333-444455556661", action: "complete", expectedRevision: 4, note: "checked", environment: "live",
  fetchImpl: (async () => reply()) as typeof fetch });
const RECORDED = { schemaVersion: "of-engine-operator.v1", ok: true, outcome: "recorded" };

test("control: 200 with a recorded body is ok; 502 with a non-JSON body is unconfirmed", async () => {
  assert.deepEqual(await submit(() => Response.json(RECORDED, { status: 200 })), { ok: true });
  const result = await submit(() => new Response("<html>Bad gateway</html>", { status: 502, headers: { "Content-Type": "text/html" } }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.outcome, "unconfirmed");
});

test("finding 4: a 503 whose body claims recorded is not success", async () => {
  const result = await submit(() => Response.json(RECORDED, { status: 503 }));
  assert.equal(result.ok, false, "HTTP 503 must never be reported as recorded");
});
