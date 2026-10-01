// Offline checks for T-Social (lib/tsocial.ts, middleware public paths, agency policy).
// No database: the feed loader gets a fake db object.
import { strict as assert } from "node:assert";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { agencyDashboardPath } from "@/lib/agency-policy";
import { corsHeaders, loadFeed, parseEventBody, rateLimited, tablesMissing, verifiedTelegramId, type TsocialDb } from "@/lib/tsocial";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`PASS  ${name}`);
}

const TOKEN = "123456:TEST-TOKEN-NOT-REAL";
function sign(token: string, fields: Record<string, string>): string {
  const p = new URLSearchParams(fields);
  const check = [...p.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  p.set("hash", createHmac("sha256", secret).update(check).digest("hex"));
  return p.toString();
}
const fields = () => ({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: 4242, first_name: "T" }), query_id: "AAA" });

// Fake supabase query builder: filters on eq/in, resolves to {data,error,count}.
function fakeDb(tables: Record<string, Record<string, unknown>[]>): TsocialDb {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      let head = false;
      const q: any = {
        select: (_c: string, opts?: { head?: boolean }) => { head = !!opts?.head; return q; },
        eq: (c: string, v: unknown) => { rows = rows.filter((r) => r[c] === v); return q; },
        in: (c: string, vs: unknown[]) => { rows = rows.filter((r) => vs.includes(r[c])); return q; },
        then: (res: (v: unknown) => unknown) => res({ data: head ? null : rows, error: null, count: rows.length }),
      };
      return q;
    },
  };
}

(async () => {
  await check("initData: good hash accepted", () => {
    assert.equal(verifiedTelegramId(sign(TOKEN, fields()), TOKEN), 4242);
  });
  await check("initData: tampered, wrong token, garbage rejected", () => {
    const good = sign(TOKEN, fields());
    assert.equal(verifiedTelegramId(good.replace("4242", "9999"), TOKEN), null);
    assert.equal(verifiedTelegramId(good, "999:OTHER"), null);
    assert.equal(verifiedTelegramId("hash=abc", TOKEN), null);
    assert.equal(verifiedTelegramId("", TOKEN), null);
    assert.equal(verifiedTelegramId(undefined, TOKEN), null);
  });
  await check("initData: missing token -> unverified", () => {
    const good = sign(TOKEN, fields());
    assert.equal(verifiedTelegramId(good, null), null);
    assert.equal(verifiedTelegramId(good, ""), null);
  });
  await check("event body parsing", () => {
    assert.equal(parseEventBody({ kind: "nope", initData: "" }), null);
    assert.equal(parseEventBody(null), null);
    const e = parseEventBody({ kind: "view", initData: "x", cloneSlug: "dan-dangler", postId: "a2067286-86af-4677-baf1-6c2e6edede3d" });
    assert.deepEqual(e, { kind: "view", initData: "x", cloneSlug: "dan-dangler", postId: "a2067286-86af-4677-baf1-6c2e6edede3d" });
    assert.equal(parseEventBody({ kind: "open", cloneSlug: "Bad Slug!", postId: "nope" })!.cloneSlug, null);
  });
  await check("rate limit: 60/min per IP then blocked, resets", () => {
    const t = 1_000_000;
    for (let i = 0; i < 60; i++) assert.equal(rateLimited("1.1.1.1", t), false);
    assert.equal(rateLimited("1.1.1.1", t), true);
    assert.equal(rateLimited("2.2.2.2", t), false);
    assert.equal(rateLimited("1.1.1.1", t + 61_000), false);
  });
  await check("cors limited to the CloudFront origin", () => {
    assert.equal(corsHeaders()["Access-Control-Allow-Origin"], "https://dsygeknm080dt.cloudfront.net");
  });
  await check("feed projection: allowed fields only, enabled rows only", async () => {
    const A = "aaaaaaaa-0000-4000-8000-000000000001", B = "bbbbbbbb-0000-4000-8000-000000000002", C = "cccccccc-0000-4000-8000-000000000003";
    const db = fakeDb({
      tsocial_creators: [
        { clone_id: A, enabled: true, sort: 1, display_name: null },
        { clone_id: B, enabled: false, sort: 0, display_name: null },
        { clone_id: C, enabled: true, sort: 0, display_name: "Shown As" },
      ],
      clones: [
        { id: A, slug: "a-girl", name: "A Girl", business_username: "agirl", bot_token: "SECRET", status: "active" },
        { id: B, slug: "b-girl", name: "B Girl", business_username: "bgirl", bot_token: "SECRET" },
        { id: C, slug: "c-girl", name: "C Girl", business_username: "cgirl", bot_token: "SECRET" },
      ],
      users: [{ id: "u1", clone_id: A }, { id: "u2", clone_id: A }, { id: "u3", clone_id: C }],
      tsocial_posts: [
        { id: "p1", clone_id: A, type: "video", src: "media/a-girl/p1.mp4", poster: "media/a-girl/p1.jpg", enabled: true, sort: 1 },
        { id: "p2", clone_id: A, type: "photo", src: "media/a-girl/p2.jpg", poster: null, enabled: true, sort: 0 },
        { id: "p3", clone_id: A, type: "photo", src: "media/a-girl/p3.jpg", poster: null, enabled: false, sort: 2 },
        { id: "p4", clone_id: B, type: "photo", src: "media/b-girl/p4.jpg", poster: null, enabled: true, sort: 0 },
      ],
    });
    const feed = await loadFeed(db);
    assert.deepEqual(feed.creators, [
      { slug: "c-girl", name: "Shown As", username: "cgirl", avatar: "media/c-girl/avatar.jpg", fans: 1 },
      { slug: "a-girl", name: "A Girl", username: "agirl", avatar: "media/a-girl/avatar.jpg", fans: 2 },
    ]);
    assert.deepEqual(feed.posts, [
      { id: "p2", type: "photo", src: "media/a-girl/p2.jpg", creator: "a-girl" },
      { id: "p1", type: "video", src: "media/a-girl/p1.mp4", poster: "media/a-girl/p1.jpg", creator: "a-girl" },
    ]);
    assert.ok(!JSON.stringify(feed).includes("SECRET"));
    assert.ok(!JSON.stringify(feed).includes("bot_token"));
  });
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
    await check("middleware: public feed and event pass without login", async () => {
      const f = await mw("/api/tsocial/feed");
      assert.equal(f.status, 200); assert.ok(!f.headers.get("location"));
      const e = await mw("/api/tsocial/event", "POST");
      assert.equal(e.status, 200); assert.ok(!e.headers.get("location"));
      assert.equal((await mw("/api/tsocial/event", "OPTIONS")).status, 200);
    });
    await check("middleware: wrong method / server action / sibling paths still blocked", async () => {
      assert.equal((await mw("/api/tsocial/feed", "POST")).status, 403);
      assert.equal((await mw("/api/tsocial/event", "GET")).status, 403);
      assert.equal((await mw("/api/tsocial/feed", "GET", { "next-action": "x" })).status, 403);
      for (const p of ["/api/tsocial/other", "/api/tsocial/feed/x", "/api/tsocial"]) {
        const r = await mw(p);
        assert.ok(r.status === 307 || r.status === 308, `${p} -> ${r.status}`);
        assert.match(r.headers.get("location") ?? "", /\/twin/);
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
