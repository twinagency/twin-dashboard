import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { AGENCY_LIVE_CRM_ROUTES, agencyManagementRequestAllowed } from "../lib/agency-management-policy";
import { agencyDashboardPath } from "../lib/agency-policy";

const canonicalRoutes = [
  "/crm",
  "/crm/inbox",
  "/crm/fans",
  "/crm/mass-messages",
  "/crm/automations",
  "/crm/vault",
  "/crm/publishing",
  "/crm/analytics",
  "/crm/team",
  "/crm/settings",
];

for (const route of canonicalRoutes) {
  assert.ok(Object.hasOwn(AGENCY_LIVE_CRM_ROUTES, route), `${route} has an exact manager allowlist entry`);
  assert.equal(agencyDashboardPath(route, "LYNQ", true), true, `${route} is available to a verified manager`);
  assert.equal(agencyDashboardPath(route, "LYNQ", false), false, `${route} is denied to a lookalike/read-only identity`);
  assert.equal(agencyDashboardPath(route, "Moxy", false), false, `${route} remains denied to Moxy`);
}
assert.equal(agencyDashboardPath("/crm/not-a-real-route", "LYNQ", true), false, "CRM authorization is not a wildcard");
assert.equal(agencyDashboardPath("/settings", "LYNQ", true), false, "CRM Settings never exposes global service credentials");

for (const path of ["/crm/inbox", "/crm/automations", "/crm/vault"]) {
  assert.equal(agencyManagementRequestAllowed(path, "POST", true), true, `${path} can host its existing guarded server actions`);
}
for (const path of ["/crm", "/crm/fans", "/crm/mass-messages", "/crm/publishing", "/crm/team", "/crm/settings"]) {
  assert.equal(agencyManagementRequestAllowed(path, "POST", true), false, `${path} does not gain a write surface`);
}

assert.equal(existsSync("components/crm/CrmPreview.tsx"), false, "The fabricated shared CRM preview is removed");
const routeSource = (path: string) => readFileSync(path, "utf8");
assert.match(routeSource("app/crm/page.tsx"), /CrmDashboardOverview/);
assert.match(routeSource("app/crm/fans/page.tsx"), /CrmFansDirectory/);
assert.match(routeSource("app/crm/inbox/page.tsx"), /basePath="\/crm\/inbox"/);
assert.match(routeSource("app/crm/automations/page.tsx"), /@\/app\/flows\/page/);
assert.match(routeSource("app/crm/vault/page.tsx"), /@\/app\/media\/page/);
assert.match(routeSource("app/crm/analytics/page.tsx"), /@\/app\/revenue\/page/);
const massMessages = routeSource("app/crm/mass-messages/page.tsx");
assert.match(massMessages, /Delivery not enabled/);
assert.match(massMessages, /getCloneScope\(\)/, "Mass-message audience counts use the selected creator scope");
assert.match(routeSource("app/crm/publishing/page.tsx"), /Publishing is not connected/);
const dashboard = routeSource("components/crm/CrmDashboardOverview.tsx");
assert.match(dashboard, /Account identity and operating state/);
assert.doesNotMatch(dashboard, /Connection and operating state|Connected accounts/);
assert.match(dashboard, /lifetimeNetStars == null/);
assert.match(dashboard, />Unavailable</, "A failed revenue read is not displayed as zero");
assert.doesNotMatch(routeSource("components/crm/CrmFansDirectory.tsx"), />Flagged</);

const sidebar = routeSource("components/Sidebar.tsx");
for (const label of ["Dashboard", "Operate", "Inbox", "Fans", "Mass messages", "Automations", "Content", "Vault", "Publishing", "Measure", "Analytics", "Manage", "Creators", "Team", "Settings"]) {
  assert.match(sidebar, new RegExp(`label: "${label}"|>\\{group\\.label\\}<`), `Sidebar includes ${label}`);
}
assert.match(sidebar, /link\.kind === "tab" && link\.tab === "ppvs"/, "Existing PPV controls remain reachable through System tools");
for (const alias of ["/users", "/messages", "/flows", "/drip", "/media", "/storage", "/revenue", "/analytics", "/business"]) {
  assert.match(sidebar, new RegExp(`"${alias}"`), `CRM navigation preserves active state on ${alias}`);
}

console.log("CRM framework: live routes, honest capability gaps, exact manager access, read-only isolation and navigation passed");
