/**
 * Known red (W5 app-actions-plus5 F3, half-wired money control; extends W5 lib-openrouter-plus6 F1, not a re-file):
 * the agency "Creator earnings split" Save is a server action (AgencyCreatorCutRowForm.tsx:5,22 -> actions.ts:11)
 * posted to /agency/creator-split. middleware.ts:238-239 runs agencyRequestAllowed for every /agency/* path BEFORE
 * the dev auth skip (:279), and agencyRequestAllowed short-circuits every server action to false
 * (lib/agency-policy.ts:7 `|| serverAction) return false`). So the Save is 403 "Read-only agency portal" for every
 * caller, independently of F1's lib refusal: fixing F1 alone does not revive it.
 * The red test follows the form: while it calls a server action, the server-action path must be allowed; if the fix
 * moves the save to a form POST (`action="/agency/..."`), that route must be on the POST allowlist. Tests the policy
 * function middleware.ts:239 calls, not middleware itself.
 * Control: the page GET and an allowlisted form POST pass, a non-allowlisted form POST is refused (holds).
 * If the owner deletes the page/action instead, delete this test with a TEST-CHANGE line.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { agencyRequestAllowed } from "../../lib/agency-policy";

const form = readFileSync(new URL("../../app/agency/creator-split/AgencyCreatorCutRowForm.tsx", import.meta.url), "utf8");

test("control: page GET and allowlisted form POST pass; a non-allowlisted form POST is refused", () => {
  assert.equal(agencyRequestAllowed("/agency/creator-split", "GET", false), true);
  assert.equal(agencyRequestAllowed("/agency/creator-invites/manage", "POST", false), true);
  assert.equal(agencyRequestAllowed("/agency/creator-split", "POST", false), false);
});

test("the creator-split Save reaches its handler through middleware", () => {
  const usesServerAction = /from\s+["']\.\/actions["']/.test(form);
  const postTarget = form.match(/action=\{?["'`](\/agency\/[^"'`]+)["'`]/)?.[1];
  if (usesServerAction) {
    assert.equal(agencyRequestAllowed("/agency/creator-split", "POST", true), true,
      "server action on /agency/creator-split: middleware.ts:239 answers 403 Read-only agency portal");
  } else {
    assert.ok(postTarget, "save form posts nowhere");
    assert.equal(agencyRequestAllowed(postTarget, "POST", false), true, `${postTarget} is not on the agency POST allowlist`);
  }
});
