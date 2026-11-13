// Regression guard (G25, Fable on #406): since F13 a stop ack may carry recordedRevision > expectedRevision. That number proves a
// recorded event, not current state, so no of-controls.v1 consumer may feed it back as the next expectedRevision: every next
// command must take its revision from a fresh read. Consumers of parseControlAck: the preview transport (OnlyFansWorkspace) and
// the launch sendControl (BAutomationPanel). Plan C (PlanCConsole) keeps its own recordedRevision from PLAN_C_SCHEMA acks, a
// separate parser this PR does not touch.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { createFetchOnlyFansTransport } from "../../lib/onlyfans-preview/server-data-source";
import type { CommandRequest } from "../../lib/onlyfans-preview/types";

const ROOT = join(__dirname, "../..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
function files(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const path = join(dir, name);
    return statSync(join(ROOT, path)).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

test("a stop recorded above the expected revision leaves the request's expectedRevision as sent", async () => {
  const fetchImpl = (async () => new Response(JSON.stringify({ schemaVersion: "of-controls.v1", ok: true, applied: true,
    commandKey: "c".repeat(64), accountId: "of-a", conversationId: "42", action: "pause_automation", recordedRevision: 9 }),
  { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch;
  const command: CommandRequest = { commandId: "cmd-synthetic", idempotencyKey: "idem-synthetic", command: "pause_automation",
    accountId: "of-a", conversationId: "42", expectedRevision: 5, payload: { kind: "none" } };
  const result = await createFetchOnlyFansTransport(fetchImpl, "https://dashboard.invalid/api/onlyfans").submitControl!(command);
  assert.equal(result.outcome, "recorded");
  assert.equal(result.request.expectedRevision, 5, "the ack revision must not be written into the request a retry reuses");
  assert.equal(command.expectedRevision, 5);
});

test("no UI outside Plan C reads an ack's recordedRevision", () => {
  const readers = [...files("components"), ...files("app")].filter((path) => read(path).includes("recordedRevision"));
  assert.deepEqual(readers.map((path) => relative(".", path)), ["components/onlyfans-preview/PlanCConsole.tsx"]);
});

test("the inbox takes each command's revision from the detail read and re-reads after the command", () => {
  const src = read("components/onlyfans-preview/OnlyFansWorkspace.tsx");
  assert.match(src, /createCommandRequest\(\{[^}]*expectedRevision: detail\.summary\.revision,/);
  assert.equal(src.match(/expectedRevision:/g)?.length, 1, "a second revision source in the workspace needs review");
  const after = src.slice(src.indexOf("result = await source.submitCommand(request)"));
  assert.match(after, /source\.listAccounts\([\s\S]*requested\.current\.details\.delete\([\s\S]*requested\.current\.conversations\.delete\([\s\S]*source\.getConversation\(/);
});

test("the launch panel sends the listed revision, ignores the ack revision and re-reads after every control", () => {
  const src = read("components/onlyfans-launch/automation/BAutomationPanel.tsx");
  const act = src.slice(src.indexOf("async function act("), src.indexOf("const account = "));
  assert.match(act, /sendControl\(forAccount, c\.conversationId, action, c\.revision\)/);
  assert.doesNotMatch(act, /r\.data|recordedRevision/);
  assert.match(act, /void loadAccountData\(forAccount, "convs"\);\s*\}\s*$/);
});
