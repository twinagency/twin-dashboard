import assert from "node:assert/strict";
import { agencyOnlyFansRequest as allows } from "../lib/onlyfans/agency-scope";

const pages = ["/onlyfans/launch", "/onlyfans/launch/memory", "/onlyfans/launch/automation"];
const reads = ["/api/onlyfans/accounts", ...["access", "readiness", "purchases", "personality"].map(x => `/api/onlyfans-launch/abc/accounts/acc-a/${x}`),
  "/api/onlyfans-launch/memory/accounts/acc-a/fans", "/api/onlyfans-launch/memory/accounts/acc-a/fans/7",
  "/api/onlyfans-launch/automation/accounts/acc-a/follow-ups"];
for (const path of [...pages, ...reads]) {
  for (const method of ["GET", "HEAD"]) assert(allows(path, method, false, false), `${method} ${path}`);
  for (const method of ["POST", "PATCH", "DELETE"]) assert(!allows(path, method, false, false), `${method} read-only ${path}`);
  assert(!allows(path, "POST", true, true), `server action ${path}`);
}
const writes = [
  ["POST", "/api/onlyfans-launch/abc/accounts/acc-a/command"],
  ["POST", "/api/onlyfans-launch/automation/accounts/acc-a/follow-ups"],
  ["POST", "/api/onlyfans-launch/automation/accounts/acc-a/emergency-stop"],
  ["PATCH", "/api/onlyfans-launch/memory/accounts/acc-a/fans/7"],
];
for (const [method, path] of writes) {
  assert(allows(path, method, false, true), `manager ${method} ${path}`);
  assert(!allows(path, method, false, false), `read-only ${method} ${path}`);
  for (const other of ["DELETE", "PUT", method === "POST" ? "PATCH" : "POST"])
    assert(!allows(path, other, false, true), `wrong method ${other} ${path}`);
}
for (const path of ["/onlyfans/launch/unknown", "/api/onlyfans-launch/accounts/acc-a/command",
  "/api/onlyfans-launch/abc/accounts/acc-a/unknown", "/api/onlyfans-launch/memory/accounts/acc-a/fans/7/extra",
  "/api/onlyfans-launch/abc/accounts/acc-a%2fother/command", "/api/onlyfans-launch/abc/accounts/acc-a%5cother/command"])
  for (const method of ["GET", "POST", "PATCH"]) assert(!allows(path, method, false, true), `${method} ${path}`);
console.log("Launch agency access: page/read access, manager-only writes, invalid routes and methods passed");
