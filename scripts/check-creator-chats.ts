// Guards /creator/chats: only listed creator accounts, each tied to its own scoped live clone.
import assert from "node:assert/strict";
import { CREATOR_CHATS_ACCOUNTS, creatorChatsClone } from "../lib/creator-chats-policy";
import { isCreatorDashboardPath } from "../lib/creator-dashboard-policy";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const live = require("../deployment/flirt-live-twin.cjs");

assert.equal(isCreatorDashboardPath("/creator/chats"), true);
assert.deepEqual(Object.keys(CREATOR_CHATS_ACCOUNTS), ["c9c6d09d-71e4-424d-9150-07147c9bd5d2"], "chats are Mrs Callace only");
for (const [accountId, entry] of Object.entries(CREATOR_CHATS_ACCOUNTS)) {
  const scoped = live.scopedCreator(accountId);
  assert.ok(scoped, `${accountId} must be a scoped live creator`);
  assert.equal(scoped.cloneId, entry.cloneId, `${accountId} chats clone must match its scoped clone`);
  assert.match(entry.slug, /^[a-z0-9-]+$/);
}
for (const other of ["eb46dd1c-2d5b-4a6e-a848-3154b5c7fc0a", "22952fd9-0a82-4da2-a172-f1a0d1aa2c6d", "", "constructor", "__proto__"]) assert.equal(creatorChatsClone(other), null, `no chats for ${other || "empty"}`);
console.log("CREATOR CHATS PASSED: Mrs Callace only, tied to her scoped clone, other creators get no chats.");
