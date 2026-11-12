/**
 * Characterization (W1 lane 4 CH4, also pins F3; REVIEW.md invariant 7 "Isolation"). lib/onlyfans/agency-scope.ts:69-75
 * `chatBackendPath` is the only backend path a chat-only agency transport may POST to: conversation controls, request actions
 * and versioned fan corrections. It decodes once (so the encoded-colon conversation id the controls backend sends is accepted,
 * F3) but refuses any encoded separator (%2F/%2f/%5C), a malformed escape, a non-POST, an extra segment and Plan C.
 * The %2F cases are built so that, decoded, they WOULD match the request pattern: only the :72 guard refuses them.
 * Mutation-proven: removing the `%(?:2f|5c)` guard at :72 turns this red (tests/rules/mutations/W1-lib-onlyfans-core/5-*).
 * Overlap: tests/contracts/engine-operator.test.ts:36-43 pins the plain/encoded request path and one %2F case; mutation 5 also
 * reddens that contract test (run in the mutation worktree, recorded in 5-*.failing.txt). This file adds the conversation and
 * fan-correction paths, lowercase and %5C escapes, malformed escapes, GET and Plan C.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { chatBackendPath } from "../../lib/onlyfans/agency-scope";

const C = "/onlyfans/control/v1/accounts/acc-a/conversations";
const REQ = "12345678-1234-4234-8234-123456789abc";

test("CH4: conversation, request (plain and encoded colon) and fan-correction POSTs are admitted", () => {
  for (const path of [`${C}/acc-a%3A101`, `${C}/acc-a:101`, `${C}/acc-a%3A101/requests/${REQ}`, `${C}/acc-a:101/requests/${REQ}`,
    "/onlyfans/configuration/v1/accounts/acc-a/history-memory/fans/101/corrections"])
    assert.equal(chatBackendPath(path, "POST"), true, path);
});

test("CH4: encoded separators, malformed escapes, GET, extra segments and Plan C are refused", () => {
  const refused: Array<[string, string]> = [
    [`${C}/acc-a%3A101%2Frequests%2F${REQ}`, "POST"],
    [`${C}/acc-a%3A101%2frequests%2f${REQ}`, "POST"],
    [`${C}/acc-a:101%2Frequests/${REQ}`, "POST"],
    [`${C}/acc-a%5C101`, "POST"],
    [`${C}/acc-a%5c101/requests/${REQ}`, "POST"],
    [`${C}/acc-a%E0%A4%A`, "POST"],
    [`${C}/acc-a%3A101`, "GET"],
    [`${C}/acc-a%3A101/requests/${REQ}`, "GET"],
    ["/onlyfans/configuration/v1/accounts/acc-a/history-memory/fans/101/corrections", "GET"],
    [`${C}/acc-a%3A101/requests/${REQ}/extra`, "POST"],
    [`${C}/acc-a%3A101/extra`, "POST"],
    ["/onlyfans/configuration/v1/accounts/acc-a/history-memory/fans/101/corrections/extra", "POST"],
    ["/onlyfans/control/v1/accounts/acc-a/plan-c/conversations/acc-a%3A1/stop", "POST"],
  ];
  for (const [path, method] of refused) assert.equal(chatBackendPath(path, method), false, `${method} ${path}`);
});
