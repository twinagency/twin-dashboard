import assert from "node:assert/strict";
import { agencyOnlyFansRequest as allows } from "../lib/onlyfans/agency-scope";

let checks=0;
const check=(condition:unknown,message:string)=>{assert(condition,message);checks++;};
const pages = ["/onlyfans/launch", "/onlyfans/launch/memory", "/onlyfans/launch/automation"];
const reads = ["/api/onlyfans/accounts", ...["access", "readiness", "purchases", "personality"].map(x => `/api/onlyfans-launch/abc/accounts/acc-a/${x}`),
  "/api/onlyfans-launch/abc/accounts/acc-a/purchases/evidence",
  "/api/onlyfans-launch/memory/accounts/acc-a/fans", "/api/onlyfans-launch/memory/accounts/acc-a/fans/7",
  "/api/onlyfans-launch/automation/accounts/acc-a/follow-ups", "/api/onlyfans-launch/activation/accounts/acc-a",
  "/api/onlyfans-launch/automation/accounts/acc-a/settings", "/api/onlyfans-launch/automation/accounts/acc-a/emergency-stop",
  "/api/onlyfans-launch/automation/accounts/acc-a/follow-ups/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  "/api/onlyfans-launch/abc/accounts/acc-a/personality/history", "/api/onlyfans-launch/abc/accounts/acc-a/personality/revisions/7"];
for (const path of [...pages, ...reads]) {
  for (const method of ["GET", "HEAD"]) check(allows(path, method, false, false), `${method} ${path}`);
  for (const method of ["POST", "PATCH", "DELETE"]) check(!allows(path, method, false, false), `${method} read-only ${path}`);
  check(!allows(path, "POST", true, true), `server action ${path}`);
}
const writes = [
  ...["activate", "enable-existing", "future-conversations", "operating-limits", "model-credential", "model-check"].map(x => ["POST", `/api/onlyfans-launch/activation/accounts/acc-a/${x}`]),
  ["POST", "/api/onlyfans-launch/abc/accounts/acc-a/command"],
  ["POST", "/api/onlyfans-launch/automation/accounts/acc-a/follow-ups"],
  ["POST", "/api/onlyfans-launch/automation/accounts/acc-a/emergency-stop"],
  ["PATCH", "/api/onlyfans-launch/memory/accounts/acc-a/fans/7"],
  ["POST", "/api/onlyfans-launch/memory/accounts/acc-a/backfill"],
  ["POST", "/api/onlyfans-launch/memory/accounts/acc-a/fans/7/backfill"],
  ["POST", "/api/onlyfans-launch/automation/accounts/acc-a/settings"],
];
for (const [method, path] of writes) {
  check(allows(path, method, false, true), `manager ${method} ${path}`);
  check(!allows(path, method, false, false), `read-only ${method} ${path}`);
  for (const other of ["DELETE", "PUT", method === "POST" ? "PATCH" : "POST"])
    check(!allows(path, other, false, true), `wrong method ${other} ${path}`);
}
for (const path of ["/onlyfans/launch/unknown", "/api/onlyfans-launch/accounts/acc-a/command",
  "/api/onlyfans-launch/abc/accounts/acc-a/unknown", "/api/onlyfans-launch/memory/accounts/acc-a/fans/7/extra",
  "/api/onlyfans-launch/abc/accounts/acc-a%2fother/command", "/api/onlyfans-launch/abc/accounts/acc-a%5cother/command"])
  for (const method of ["GET", "POST", "PATCH"]) check(!allows(path, method, false, true), `${method} ${path}`);
console.log(`Launch agency access: ${checks} assertions passed,0 failed`);
