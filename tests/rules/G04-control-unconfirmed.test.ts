// RULE G04 (#390 final review, MAJOR): lib/onlyfans-preview/server-data-source.ts submitControl. A bare or non-JSON 503 (a proxy)
// can follow a manual message the route already forwarded. Calling it "refused" hides Retry, and a manual re-send mints a new UUID
// (OnlyFansWorkspace.tsx), so the fan could get the message twice. Only a body the route labelled `outcome:"refused"` is a refusal;
// anything else is "unconfirmed", and Retry resubmits the same command, so the same requestKey.
// Offline: the real createFetchOnlyFansTransport with a stub fetch.
import assert from "node:assert/strict";
import test from "node:test";
import { createCommandRequest } from "../../lib/onlyfans-preview/actions";
import { createFetchOnlyFansTransport } from "../../lib/onlyfans-preview/server-data-source";

const manual = () => {
  const command = createCommandRequest({ command: "send_manual_message", accountId: "of-a", conversationId: "c-1", expectedRevision: 3,
    payload: { kind: "manual_message", body: "hello" } });
  command.idempotencyKey = crypto.randomUUID(); // as the workspace does for a manual send
  return command;
};
const refused = (status: number) => Response.json({ schemaVersion: 1, ok: false, outcome: "refused", error: "x" }, { status });

async function drive(first: () => Response, command = manual()) {
  const bodies: Record<string, unknown>[] = [];
  const replies = [first, () => Response.json({ ok: true }, { status: 200 })];
  const transport = createFetchOnlyFansTransport(async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return replies[bodies.length - 1](); });
  const result = await transport.submitControl!(command);
  await transport.submitControl!(result.request); // the workspace's Retry resubmits the held request
  return { result, bodies };
}

test("a bare or non-JSON 503 on a manual message is unconfirmed, and the retry reuses the first requestKey", async () => {
  for (const [label, reply] of [["bare 503", () => new Response(null, { status: 503 })],
    ["non-JSON 503", () => new Response("<html>Service Unavailable</html>", { status: 503, headers: { "Content-Type": "text/html" } })],
    ["JSON 503 without a refused label", () => Response.json({ error: "upstream" }, { status: 503 })]] as const) {
    const { result, bodies } = await drive(reply);
    assert.equal(result.outcome, "unconfirmed", `${label}: a write that may have been forwarded was reported refused`);
    assert.equal(bodies.length, 2);
    assert.match(String(bodies[0].requestKey), /^[a-f0-9-]{36}$/);
    assert.equal(bodies[1].requestKey, bodies[0].requestKey, `${label}: the retry sent a new requestKey`);
  }
});

test("a 4xx labelled unconfirmed is unconfirmed", async () => {
  const { result } = await drive(() => Response.json({ outcome: "unconfirmed", error: "x" }, { status: 409 }));
  assert.equal(result.outcome, "unconfirmed");
});

test("control: the route's own refusals stay refused (503 labelled refused, 401/403, and the 4xx)", async () => {
  for (const status of [503, 400, 404, 409, 413]) assert.equal((await drive(() => refused(status))).result.outcome, "refused", String(status));
  for (const status of [401, 403]) assert.equal((await drive(() => new Response(null, { status }))).result.outcome, "refused", String(status));
  assert.equal((await drive(() => new Response(null, { status: 409 }))).result.outcome, "refused", "bare 409");
});
