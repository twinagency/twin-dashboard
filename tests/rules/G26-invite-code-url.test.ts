/**
 * G26: promoted from tests/known-red/W5-app-actions-plus5-invite-code-url.test.ts (rwl/W5-app-actions-plus5) as a
 * regression guard; harness is the shared tests/rules/G27-harness.ts (a superset of the W5 one). Original header below.
 * Known red (W5 app-actions-plus5 F1, security): POST /agency/creator-invites/manage puts the plaintext one-time
 * invite code in the 303 Location (`created=<code>`, app/agency/creator-invites/manage/route.ts:71), so it lands in
 * browser history and access logs, and the page shows ANY pattern-shaped `?created=` as a freshly minted code
 * (page.tsx:35), letting a crafted link pass off another agency's code. The page copy says "shown once and cannot be
 * recovered" (:66,70). Same shape: app/agency-admin/creator-codes/manage/route.ts:78, app/agency/team/manage/route.ts:21.
 * Control: the code IS stored only as a hash (holds); the page renders with no `created` and no copy box. Turns green when the code leaves the URL (flash cookie or
 * direct render).
 * G26 adds: the flash cookie the route sets is httpOnly, scoped to the invites page and short lived, and the page
 * shows that cookie's code (so the fix cannot pass by never showing the code at all).
 */
import { startFakePostgrest, formPost, inRequest } from "./G27-harness";
import assert from "node:assert/strict";
import test from "node:test";
import { withDashboardAccess } from "../../lib/dashboard-access";
import { POST } from "../../app/agency/creator-invites/manage/route";
import { hashInviteCode, INVITE_CODE_PATTERN } from "../../lib/creator-invite-codes";
import AgencyCreatorInvites from "../../app/agency/creator-invites/page";
import { renderToStaticMarkup } from "react-dom/server";

const AGENCY = "aaaaaaaa-1111-4111-8111-111111111111";
const access = { id: AGENCY, name: "Test Agency", cloneIds: [], canManage: true, creatorScope: "all" as const };

let pg!: Awaited<ReturnType<typeof startFakePostgrest>>;
test.before(async () => { pg = await startFakePostgrest(); });
test.after(() => pg.close());

async function generate() {
  pg.reset();
  pg.respond((c) => (c.method === "POST" && c.path.endsWith("/creator_agency_codes") ? { status: 201, body: [{ id: "f0000000-0000-4000-8000-000000000001" }] } : undefined));
  const res = await withDashboardAccess(access, () => POST(formPost("/agency/creator-invites/manage", { action: "generate" }) as any));
  const insert = pg.calls.find((c) => c.method === "POST" && c.path.endsWith("/creator_agency_codes"));
  return { res, insert, location: new URL(res.headers.get("location") ?? "", "http://x") };
}

test("control: generate stores only the hash, scoped to the session agency, and redirects 303", async () => {
  const { res, insert } = await generate();
  assert.equal(res.status, 303);
  const row = Array.isArray(insert?.body) ? insert.body[0] : insert?.body;
  assert.equal(row?.agency_id, AGENCY);
  assert.match(String(row?.code_hash), /^[0-9a-f]{64}$/);
  assert.equal(Object.values(row ?? {}).some((v) => INVITE_CODE_PATTERN.test(String(v))), false, "plaintext code must not be in the insert");
});

test("the plaintext invite code is not placed in the redirect URL", async () => {
  const { insert, location } = await generate();
  const row = Array.isArray(insert?.body) ? insert.body[0] : insert?.body;
  const leaked = [...location.searchParams.values()].filter((v) => hashInviteCode(v) === row?.code_hash);
  assert.deepEqual(leaked, [], `one-time code found in Location ${location.pathname}?${[...location.searchParams.keys()].join("&")}`);
});

async function renderPage(query: Record<string, string>, cookie = "") {
  pg.reset();
  const el = await withDashboardAccess(access, () =>
    inRequest({ host: "dashboard.test", ...(cookie ? { cookie } : {}) }, () => AgencyCreatorInvites({ searchParams: Promise.resolve(query) })));
  return renderToStaticMarkup(el);
}

test("control: the invites page renders without a copy box when nothing was created", async () => {
  const html = await renderPage({});
  assert.match(html, /creator/i);
  assert.doesNotMatch(html, /Copy this now/);
});

test("a hand-crafted ?created= link is not presented as a freshly minted code", async () => {
  const forged = "ABCDEFGHJK"; // pattern-shaped, never minted, no row anywhere
  assert.ok(INVITE_CODE_PATTERN.test(forged));
  const html = await renderPage({ created: forged });
  assert.doesNotMatch(html, /Copy this now/, "page shows an unsolicited ?created= value as a new invite code");
});

test("G26: the minted code travels in an httpOnly, page-scoped, short-lived cookie and the page shows it once landed", async () => {
  const { res, insert, location } = await generate();
  const row = Array.isArray(insert?.body) ? insert.body[0] : insert?.body;
  const setCookie = res.headers.get("set-cookie") ?? "";
  const [pair, ...attrs] = setCookie.split(/;\s*/);
  const [name, value] = pair.split("=");
  assert.equal(hashInviteCode(decodeURIComponent(value ?? "")), row?.code_hash, `no flash cookie carrying the minted code: ${name}`);
  const lower = attrs.map((a) => a.toLowerCase());
  assert.ok(lower.includes("httponly"), "flash cookie must be httpOnly");
  assert.ok(lower.includes("path=/agency/creator-invites"), "flash cookie must be scoped to the invites page");
  assert.ok(lower.includes("samesite=strict"), "flash cookie must be SameSite=Strict");
  const maxAge = Number(lower.find((a) => a.startsWith("max-age="))?.slice(8));
  assert.ok(maxAge > 0 && maxAge <= 300, `flash cookie must be short lived, got max-age=${maxAge}`);
  const code = decodeURIComponent(value);
  const landed = await renderPage(Object.fromEntries(location.searchParams), `${name}=${value}`);
  assert.match(landed, /Copy this now/);
  assert.ok(landed.includes(code), "landed page does not show the freshly minted code");
});
