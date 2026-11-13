// G19 regression guard (was KNOWN RED W4 api-business-connection-plus17 F1; fixed in #392 by removing GET). Before the fix,
// GET /api/compile?id= ran compileClone(id) for an internal admin with no origin check. compileClone UPDATEs persona and the
// live prompts the bot reads, and the SameSite=Lax admin cookie rides a cross-site top-level GET, so any page the operator
// visited could recompile a live clone. POST refuses an untrusted Origin. Fixed means: GET absent (Next.js answers 405) while
// POST stays and components/CompileButton.tsx POSTs, or GET origin-checked (403) with zero upstream calls, or the whole
// route deleted once CompileButton no longer references /api/compile.
// The route is loaded without a static import so a deleted route neither crashes this file nor breaks tsc.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { NextRequest } from "next/server";
import { as, CLONE_A, isRest, optionalModule, table, withWire, type Call } from "./G19-harness";

type Handler = (req: NextRequest) => Promise<Response>;
const route = optionalModule<{ GET?: Handler; POST?: Handler }>("app/api/compile/route");

const CROSS_SITE = { origin: "https://attacker.invalid", "sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate" };
// Answers the clones read compileClone makes first (no row, so it stops before any write). Recorded either way.
const clonesRead = (c: Call) => (isRest(c, "clones") ? table([], c) : undefined);

test("control: POST with a cross-site Origin is refused 403 with zero upstream calls", async t => {
  if (!route?.POST) return t.skip("route or POST deleted: nothing left to control");
  const POST = route.POST;
  await withWire(clonesRead, async stub => {
    const req = new NextRequest("http://localhost/api/compile", {
      method: "POST", headers: { ...CROSS_SITE, "content-type": "application/json" }, body: JSON.stringify({ id: CLONE_A }),
    });
    const res = await as(null, () => POST(req));
    assert.equal(res.status, 403);
    assert.equal(stub.calls.length, 0, `POST reached upstream: ${stub.calls.map(c => `${c.method} ${c.url.pathname}`).join(", ")}`);
  });
});

test("F1: a cross-site GET as internal admin makes no upstream call and is refused (405 or 403)", async () => {
  // A deleted route or a deleted GET export: Next.js answers 404/405 before any handler code runs.
  const button = fileURLToPath(new URL("../../components/CompileButton.tsx", import.meta.url));
  const source = existsSync(button) ? readFileSync(button, "utf8") : "";
  if (!route) {
    // Deleting the route is only a fix if its one client stopped calling it; otherwise compiling breaks instead.
    assert.ok(!source.includes("/api/compile"), "app/api/compile/route is gone but components/CompileButton.tsx still calls /api/compile");
    return;
  }
  if (!route.GET) {
    // No GET export: Next.js answers 405 itself. That is a fix only while compiling still works over POST and its one
    // client (components/CompileButton.tsx) POSTs rather than relying on the removed GET.
    assert.equal(typeof route.POST, "function", "app/api/compile/route lost GET and POST: compiling is gone");
    assert.match(source, /fetch\("\/api\/compile",\s*\{\s*method:\s*"POST"/, "components/CompileButton.tsx no longer POSTs to /api/compile");
    return;
  }
  const GET = route.GET;
  await withWire(clonesRead, async stub => {
    const req = new NextRequest(`http://localhost/api/compile?id=${CLONE_A}`, { method: "GET", headers: CROSS_SITE });
    const res = await as(null, () => GET(req));
    assert.equal(stub.calls.length, 0,
      `cross-site GET reached compileClone: ${stub.calls.map(c => `${c.method} ${c.url.pathname}?${c.url.searchParams}`).join(", ")}`);
    assert.ok([403, 405].includes(res.status), `cross-site GET answered ${res.status}, expected 405 or 403`);
  });
});
