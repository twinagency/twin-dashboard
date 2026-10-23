import assert from "node:assert/strict";
import { agencyOnlyFansRequest as allows } from "../lib/onlyfans/agency-scope";

const A = "/api/onlyfans-launch";
const pages = ["/onlyfans/launch", "/onlyfans/launch/memory", "/onlyfans/launch/automation"];
const reads = ["/api/onlyfans/accounts", ...["access", "readiness", "ledger"].map(x => `${A}/abc/accounts/acc-a/${x}`),
  `${A}/memory/accounts/acc-a/fans`, `${A}/memory/accounts/acc-a/fans/7`, `${A}/automation/accounts/acc-a/follow-ups`,
  `${A}/personality/accounts/acc-a`, `${A}/personality/accounts/acc-a/history`, `${A}/personality/accounts/acc-a/revisions/12`];
for (const path of [...pages, ...reads]) {
  for (const method of ["GET", "HEAD"]) assert(allows(path, method, false, false), `${method} ${path}`);
  for (const method of ["POST", "PATCH", "DELETE", "PUT"]) assert(!allows(path, method, false, false), `${method} read-only ${path}`);
  assert(!allows(path, "POST", true, true), `server action ${path}`);
}
const writes = [
  ["POST", `${A}/abc/accounts/acc-a/command`],
  ["POST", `${A}/automation/accounts/acc-a/follow-ups`],
  ["POST", `${A}/automation/accounts/acc-a/emergency-stop`],
  ["POST", `${A}/memory/accounts/acc-a/backfill`],
  ["POST", `${A}/personality/accounts/acc-a/import`],
  ["POST", `${A}/personality/accounts/acc-a/review`],
  ["POST", `${A}/personality/accounts/acc-a/approve`],
  ["PATCH", `${A}/memory/accounts/acc-a/fans/7`],
];
for (const [method, path] of writes) {
  assert(allows(path, method, false, true), `manager ${method} ${path}`);
  assert(!allows(path, method, false, false), `read-only ${method} ${path}`);
  assert(!allows(path, method, true, true), `server action ${method} ${path}`);
  for (const other of ["DELETE", "PUT", method === "POST" ? "PATCH" : "POST"]) assert(!allows(path, other, false, true), `wrong method ${other} ${path}`);
  if (!reads.includes(path)) assert(!allows(path, "GET", false, true), `${path} is not a read`);
}
// Read-only staff may read a personality but never import, review or approve it.
for (const a of ["import", "review", "approve"]) assert(!allows(`${A}/personality/accounts/acc-a/${a}`, "POST", false, false), a);
assert(!allows(`${A}/personality/accounts/acc-a/import`, "GET", false, true), "import is not a read");
for (const path of ["/onlyfans/launch/unknown", `${A}/accounts/acc-a/command`, `${A}/abc/accounts/acc-a/unknown`, `${A}/abc/accounts/acc-a/purchases`, `${A}/memory/accounts/acc-a/fans/7/extra`,
  `${A}/abc/accounts/acc-a%2fother/command`, `${A}/abc/accounts/acc-a%5cother/command`, `${A}/personality/accounts/acc-a/revisions/0`, `${A}/personality/accounts/acc-a/revisions/x`,
  `${A}/personality/accounts/acc-a/delete`, `${A}/personality/accounts/acc-a%2f..%2fb/import`, `${A}/personality/accounts/acc-a/history/extra`, `${A}/memory/accounts/acc-a/backfill/x`,
  `${A}/personality/${"x".repeat(80)}`, `${A}/memory/accounts/${"a".repeat(65)}/backfill`])
  for (const method of ["GET", "POST", "PATCH"]) assert(!allows(path, method, false, true), `${method} ${path}`);
console.log("Launch agency access: page/read access, manager-only writes (personality, memory, automation, ledger), invalid routes and methods passed");
