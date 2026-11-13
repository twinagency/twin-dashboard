// G19 (was KNOWN RED W4 api-business-connection-plus17 F1): GET /api/compile?id= runs compileClone(id) for an internal admin
// (access null) with no origin check (app/api/compile/route.ts:8-14). compileClone reads the clones row and UPDATEs
// persona + the four live prompts (lib/compiler.ts:367-424), which the bot reads. The admin cookie is SameSite=Lax, so a
// cross-site top-level GET carries it: any page the operator visits can recompile a live clone. POST already refuses an
// untrusted Origin (:16). Fixed looks like: GET deleted (405) or origin-checked (403), with zero upstream calls; or the
// whole route deleted (S13: CompileButton calls the server action), which this file counts as fixed only once
// components/CompileButton.tsx (today :15 POSTs to it) no longer references /api/compile.
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
  if (!route) {
    // Deleting the route is only a fix if its one client stopped calling it; otherwise compiling breaks instead.
    const button = fileURLToPath(new URL("../../components/CompileButton.tsx", import.meta.url));
    const source = existsSync(button) ? readFileSync(button, "utf8") : "";
    assert.ok(!source.includes("/api/compile"), "app/api/compile/route is gone but components/CompileButton.tsx still calls /api/compile");
    return;
  }
  if (!route.GET) return;
  const GET = route.GET;
  await withWire(clonesRead, async stub => {
    const req = new NextRequest(`http://localhost/api/compile?id=${CLONE_A}`, { method: "GET", headers: CROSS_SITE });
    const res = await as(null, () => GET(req));
    assert.equal(stub.calls.length, 0,
      `cross-site GET reached compileClone: ${stub.calls.map(c => `${c.method} ${c.url.pathname}?${c.url.searchParams}`).join(", ")}`);
    assert.ok([403, 405].includes(res.status), `cross-site GET answered ${res.status}, expected 405 or 403`);
  });
});
