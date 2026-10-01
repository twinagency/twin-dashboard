// Offline checks for T-Social admin (lib/tsocial.ts helpers, /tsocial protection, agency policy).
// The public feed/event API lives in twin-reels/server (tested there).
import { strict as assert } from "node:assert";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { agencyDashboardPath } from "@/lib/agency-policy";
import { tablesMissing } from "@/lib/tsocial";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`PASS  ${name}`);
}

(async () => {
  await check("tablesMissing recognises missing-table errors", () => {
    assert.equal(tablesMissing({ code: "PGRST205", message: "x" }), true);
    assert.equal(tablesMissing({ code: "42P01", message: "x" }), true);
    assert.equal(tablesMissing({ code: "500", message: "boom" }), false);
    assert.equal(tablesMissing(null), false);
  });

  // ---- middleware ----
  const mw = (path: string, method = "GET", headers: Record<string, string> = {}) =>
    middleware(new NextRequest(`https://dashboard.tgaiclone.xyz${path}`, { method, headers }));
  const prev = process.env.NODE_ENV;
  (process.env as Record<string, string>).NODE_ENV = "production";
  try {
    await check("middleware: former public API paths are no longer exceptions", async () => {
      for (const [p, m] of [["/api/tsocial/feed", "GET"], ["/api/tsocial/event", "POST"], ["/api/tsocial/event", "OPTIONS"]] as const) {
        const r = await mw(p, m);
        assert.ok(r.status === 307 || r.status === 308 || r.status === 401 || r.status === 403, `${m} ${p} -> ${r.status}`);
      }
    });
    await check("middleware: /tsocial still needs the admin login", async () => {
      const r = await mw("/tsocial");
      assert.ok(r.status === 307 || r.status === 308);
      assert.match(r.headers.get("location") ?? "", /\/twin\?next=%2Ftsocial/);
    });
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = prev;
  }

  await check("agencyDashboardPath('/tsocial') is false for every agency flavour", () => {
    for (const name of [undefined, "Twin Technologies", "Moxy", "Some Agency"])
      for (const manage of [false, true]) {
        assert.equal(agencyDashboardPath("/tsocial", name, manage), false);
        assert.equal(agencyDashboardPath("/api/tsocial/feed", name, manage), false);
      }
  });

  console.log(`\n${passed} checks passed`);
})().catch((e) => { console.error(e); process.exit(1); });
