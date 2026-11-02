// Offline checks for T-Social admin (lib/tsocial.ts helpers, /tsocial protection, agency policy).
// The public feed/event API lives in twin-reels/server (tested there).
import { strict as assert } from "node:assert";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { agencyDashboardPath } from "@/lib/agency-policy";
import { tablesMissing, validateSetting, parseDomains, groupReports, tsocialMediaUrl } from "@/lib/tsocial";

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


  await check("validateSetting: whole numbers and ranges", () => {
    assert.deepEqual(validateSetting("price_stars", "2000"), { ok: true, value: 2000 });
    for (const bad of ["0", "-1", "1.5", "abc", "", "100001"]) assert.equal(validateSetting("price_stars", bad).ok, false, bad);
    assert.equal(validateSetting("ton_discount_pct", "101").ok, false);
    assert.equal(validateSetting("platform_cut_pct", "100").ok, true);
    assert.equal(validateSetting("monthly_post_limit", "0").ok, false);
    assert.equal(validateSetting("nope", "1").ok, false);
  });
  await check("validateSetting: ton_test_flat allows null", () => {
    assert.deepEqual(validateSetting("ton_test_flat", ""), { ok: true, value: null });
    assert.deepEqual(validateSetting("ton_test_flat", "null"), { ok: true, value: null });
    assert.deepEqual(validateSetting("ton_test_flat", "0.01"), { ok: true, value: 0.01 });
    assert.equal(validateSetting("ton_test_flat", "0").ok, false);
    assert.equal(validateSetting("ton_test_flat", "-2").ok, false);
    assert.equal(validateSetting("ton_test_flat", "1e3").ok, false);
  });
  await check("validateSetting: blocked_domains cleans and rejects junk", () => {
    assert.deepEqual(parseDomains("Spam.com, https://www.bad.io/x\nspam.com"), ["spam.com", "bad.io"]);
    assert.deepEqual(validateSetting("blocked_domains", ""), { ok: true, value: [] });
    assert.equal(validateSetting("blocked_domains", "not a domain!").ok, false);
    assert.equal(validateSetting("blocked_domains", "localhost").ok, false);
  });
  await check("groupReports: counts per item, newest first, kinds kept apart", () => {
    const g = groupReports([
      { id: 1, post_id: "a", chat_post_id: null, tg_user_id: 5, reason: "spam", created_at: "2026-10-01T01:00:00Z" },
      { id: 2, post_id: "a", chat_post_id: null, tg_user_id: 5, reason: "spam", created_at: "2026-10-01T02:00:00Z" },
      { id: 3, post_id: null, chat_post_id: "a", tg_user_id: 6, reason: "nsfw", created_at: "2026-10-01T03:00:00Z" },
      { id: 4, post_id: "b", chat_post_id: null, tg_user_id: null, reason: null, created_at: "2026-09-30T00:00:00Z" },
      { id: 5, post_id: "a", chat_post_id: null, tg_user_id: 7, reason: "scam", created_at: "2026-10-01T00:30:00Z" },
    ]);
    assert.deepEqual(g.map((x) => `${x.kind}:${x.itemId}`), ["chat:a", "clip:a", "clip:b"]);
    const clipA = g[1];
    assert.equal(clipA.count, 3);
    assert.equal(clipA.reporters, 2);
    assert.deepEqual(clipA.reasons, ["spam", "scam"]);
    assert.deepEqual(clipA.reportIds, [1, 2, 5]);
  });
  await check("tsocialMediaUrl joins the CDN origin", () => {
    assert.equal(tsocialMediaUrl("/media/x.jpg"), "https://dsygeknm080dt.cloudfront.net/media/x.jpg");
    assert.equal(tsocialMediaUrl(null), null);
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
    await check("middleware: /tsocial/earnings, /tsocial/bot-sends and /ai-models need the admin login", async () => {
      for (const p of ["/tsocial/earnings", "/tsocial/bot-sends", "/ai-models", "/ai-models/11111111-1111-4111-8111-111111111111"]) {
        const r = await mw(p);
        assert.ok(r.status === 307 || r.status === 308, `${p} -> ${r.status}`);
        assert.match(r.headers.get("location") ?? "", /\/twin\?next=/);
      }
    });
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = prev;
  }

  await check("agencyDashboardPath('/tsocial') is false for every agency flavour", () => {
    for (const name of [undefined, "Twin Technologies", "Moxy", "Some Agency"])
      for (const manage of [false, true]) {
        assert.equal(agencyDashboardPath("/tsocial", name, manage), false);
        assert.equal(agencyDashboardPath("/api/tsocial/feed", name, manage), false);
        for (const p of ["/tsocial/earnings", "/tsocial/bot-sends", "/ai-models", "/ai-models/11111111-1111-4111-8111-111111111111"]) assert.equal(agencyDashboardPath(p, name, manage), false, p);
      }
  });

  console.log(`\n${passed} checks passed`);
})().catch((e) => { console.error(e); process.exit(1); });
