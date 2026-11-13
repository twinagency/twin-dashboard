// RULE G24 R1 (#7, #3): the preview's payload rule (commandPayloadProblem, lib/onlyfans-preview/actions.ts) and the live adapter
// (server-data-source.ts submitControl) give the REAL controls route's verdict, and the adapter refuses with the shared reason
// instead of an inline copy. Measured before the fix: attempt id "bad id" and provider id "9999999999999999" (not a safe
// integer once Number()-ed) passed both preview validators and the route answered 400.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { commandPayloadProblem, createCommandRequest } from "../../lib/onlyfans-preview/actions";
import { createFetchOnlyFansTransport } from "../../lib/onlyfans-preview/server-data-source";
import type { CommandPayload, PreviewCommand } from "../../lib/onlyfans-preview/types";

const MEDIA = { mediaIds: ["101", "102"], previewIds: ["101"], priceCents: 500 };
const KEY = "12345678-1234-4234-8234-123456789abc";
const resolve = (attemptId: string, providerMessageId?: string): CommandPayload =>
  ({ kind: "delivery_resolution", attemptId, decision: "delivered", ...(providerMessageId === undefined ? {} : { providerMessageId }) });
/** [name, the route's verdict written down, command, payload]. */
const CASES: Array<[string, boolean, PreviewCommand, CommandPayload]> = [
  ["valid resolution", true, "resolve_delivery_evidence", resolve("of-attempt-ava-6001", "123")],
  ["resolution attempt id with a space", false, "resolve_delivery_evidence", resolve("bad id", "123")],
  ["resolution attempt id of 129 characters", false, "resolve_delivery_evidence", resolve("a".repeat(129), "123")],
  ["resolution provider id past the safe integer range", false, "resolve_delivery_evidence", resolve("of-attempt-ava-6001", "9999999999999999")],
  ["resolution without a provider id", false, "resolve_delivery_evidence", resolve("of-attempt-ava-6001")],
  ["text send", true, "send_manual_message", { kind: "manual_message", body: "hi" }],
  ["media send", true, "send_manual_message", { kind: "manual_message", body: "", media: MEDIA }],
  ["media send with catalogItemId null", false, "send_manual_message", { kind: "manual_message", body: "hi", media: MEDIA, catalogItemId: null }],
  ["blank send", false, "send_manual_message", { kind: "manual_message", body: "  " }],
  ["catalog item 0", false, "send_manual_message", { kind: "manual_message", body: "hi", catalogItemId: 0 }],
];

/** The body the route receives for a payload, written out here rather than taken from the code under test. */
function routeBody(payload: CommandPayload): Record<string, unknown> {
  if (payload.kind === "delivery_resolution") return { action: "resolve_delivery_evidence", expectedRevision: 17, attemptId: payload.attemptId,
    decision: payload.decision, providerMessageId: Number(payload.providerMessageId), requestKey: KEY };
  if (payload.kind !== "manual_message") throw new Error("no payload case here");
  return { action: "manual_message", expectedRevision: 17, body: payload.body, requestKey: KEY,
    ...(payload.catalogItemId !== undefined ? { catalogItemId: payload.catalogItemId } : {}), ...(payload.media ? { media: payload.media } : {}) };
}

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const CHILD = fileURLToPath(new URL("./G24-route-validator.child.ts", import.meta.url));
const child = spawnSync(process.execPath, ["--import", "tsx", "--experimental-test-module-mocks", "--no-warnings", CHILD,
  JSON.stringify(CASES.map(([, , , payload]) => routeBody(payload)))],
  { cwd: ROOT, encoding: "utf8", timeout: 120_000, env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", NODE_ENV: "test" } });
const statuses = JSON.parse(child.stdout.trim().split("\n").at(-1) || "null") as number[] | null;

/** The live adapter over a fetch that records and throws: the reason it refused with, or "sent" once it called fetch. */
async function adapter(command: PreviewCommand, payload: CommandPayload): Promise<string> {
  let called = false;
  const transport = createFetchOnlyFansTransport(async () => { called = true; throw new Error("no network in tests"); });
  const result = await transport.submitControl!(createCommandRequest({ command, accountId: "of-a", conversationId: "conv-1", expectedRevision: 17, payload }));
  return called ? "sent" : result.outcome === "refused" ? result.note : `other: ${result.outcome}`;
}

test("control: the route child ran, and the route accepts every valid shape past validation", () => {
  assert.ok(statuses && statuses.length === CASES.length, `child did not report: ${child.stderr.slice(0, 800)}`);
  CASES.forEach(([name, valid], index) => assert.equal(statuses[index] === 400, !valid, `route on ${name}: ${statuses[index]}`));
});

for (const [index, [name, valid, command, payload]] of CASES.entries()) {
  test(`#7/#3: preview validator, live adapter and route agree on ${name}`, async () => {
    const problem = commandPayloadProblem(command, payload);
    assert.equal(problem === null, valid, `preview validator: ${problem}`);
    assert.equal(statuses?.[index] === 400, !valid, `route status ${statuses?.[index]}`);
    assert.equal(await adapter(command, payload), valid ? "sent" : problem, "live adapter verdict or reason");
  });
}
