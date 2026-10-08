// Offline checks for the AI Models admin page helpers (lib/ai-models.ts) and the T-Social earnings / bot-send roll-ups.
import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { PERSONA_FIELDS, ageFrom, cleanText, showBlocker, slugify, uploadKind, validEmojis, validPrice, validatePersona } from "@/lib/ai-models";
import { buildEarnings, parseVipPostId } from "@/lib/tsocial-earnings";
import { groupSends, reconstructDeliveries, VIP_DELIVERY_TEXT } from "@/lib/tsocial-sends";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) { await fn(); passed++; console.log(`PASS  ${name}`); }
const NOW = new Date("2026-10-08T00:00:00Z");

(async () => {
  await check("persona fields reuse the Bot V2 variable names", () => {
    const v2 = readFileSync("../twin-sexbot/src/girls/template.ts", "utf8");
    for (const f of PERSONA_FIELDS) assert.ok(new RegExp(`\\b${f.key}: string`).test(v2), `${f.key} is a V2 GirlVars name`);
    assert.equal(new Set(PERSONA_FIELDS.map((f) => f.key)).size, PERSONA_FIELDS.length);
  });
  await check("adult only: under 18, future and fake dates refused, exactly 18 allowed", () => {
    assert.equal(ageFrom("2008-10-08", NOW), 18);
    assert.equal(ageFrom("2008-10-09", NOW), 17);
    assert.equal(ageFrom("2026-02-30", NOW), null);
    assert.equal(ageFrom("nope", NOW), null);
    const base = { name: "Luna" };
    assert.equal(validatePersona({ ...base, BIRTH_DATE: "2008-10-09" }, NOW).ok, false);
    assert.equal(validatePersona({ ...base, BIRTH_DATE: "2030-01-01" }, NOW).ok, false);
    assert.equal(validatePersona({ ...base, BIRTH_DATE: "2008-10-08" }, NOW).ok, true);
    assert.equal(validatePersona({ ...base }, NOW).ok, true, "draft without a date is allowed");
  });
  await check("persona: name required, dashes become commas, lengths capped, emojis format, NAME var set", () => {
    assert.equal(validatePersona({ name: "  " }, NOW).ok, false);
    const r = validatePersona({ name: "Luna", about: "hi — there", PERSONALITY: "x".repeat(900), EMOJIS: "sometimes: 😉😈", consent_note: "" }, NOW);
    assert.ok(r.ok); if (!r.ok) return;
    assert.equal(r.about, "hi, there"); assert.equal(r.vars.PERSONALITY.length, 500); assert.equal(r.vars.NAME, "Luna"); assert.equal(r.consent, "fictional");
    assert.equal(validatePersona({ name: "L", EMOJIS: "lots" }, NOW).ok, false);
    assert.ok(validEmojis("none") && validEmojis("often: 😈") && !validEmojis("rare: abc") && !validEmojis(""));
    assert.equal(cleanText("a–b", 10), "a, b");
  });
  await check("slug, price and upload type rules", () => {
    assert.equal(slugify("  Lúna Rose!! "), "luna-rose");
    for (const bad of [0, -1, 1.5, "abc", "", 10_001, null]) assert.equal(validPrice(bad), null, String(bad));
    assert.equal(validPrice("250"), 250);
    assert.equal(uploadKind("image/png", "a.png")?.kind, "photo");
    assert.equal(uploadKind("video/quicktime", "a.mov")?.kind, "video");
    assert.equal(uploadKind("application/pdf", "a.pdf"), null);
    assert.equal(uploadKind("image/svg+xml", "a.svg"), null);
  });
  await check("show in T-Social needs an adult birth date and one approved free pic with a public copy", () => {
    const free = { status: "approved", access: "free", public_path: "m/1.jpg" };
    assert.ok(showBlocker({}, [free], NOW));
    assert.ok(showBlocker({ BIRTH_DATE: "2000-01-01" }, [], NOW));
    assert.ok(showBlocker({ BIRTH_DATE: "2000-01-01" }, [{ ...free, access: "locked" }, { ...free, status: "pending" }, { ...free, public_path: null }], NOW));
    assert.equal(showBlocker({ BIRTH_DATE: "2000-01-01" }, [free], NOW), null);
  });

  const P = "11111111-1111-4111-8111-111111111111", Q = "22222222-2222-4222-8222-222222222222";
  const pay = (o: Record<string, unknown>) => ({ id: String(Math.random()), tg_user_id: 1, method: "stars", amount: 100, currency: "XTR", status: "paid", payload: `vip_${P}_1_aa`, created_at: "2026-10-03T10:00:00Z", ...o }) as never;
  const base = { tonOrders: [], aiPurchases: [], postOwner: new Map([[P, "acc1"], [Q, "acc2"]]), accountName: new Map([["acc1", "Kyla"], ["acc2", "Dan"]]), modelName: new Map([["m1", "Luna"]]), testIds: new Set([9]), starUsd: 0.013 };
  await check("earnings: paid only, by creator, by day (Sydney), pending and refunded kept out, test accounts split", () => {
    assert.equal(parseVipPostId(`vip_${P}_1_aa`), P); assert.equal(parseVipPostId("ts_1_aa"), null);
    const e = buildEarnings({ ...base, payments: [
      pay({ amount: 1000 }), pay({ amount: 500, tg_user_id: 2 }), pay({ amount: 700, payload: `vip_${Q}_1_bb`, tg_user_id: 9, created_at: "2026-10-03T15:00:00Z" }),
      pay({ amount: 2000, status: "pending" }), pay({ amount: 300, status: "refunded" }), pay({ amount: 50, payload: "ts_1_cc" }),
      pay({ method: "ton", currency: "TON", amount: 1.5, payload: `vip_${P}_3_dd`, tg_user_id: 3 }),
    ] as never });
    assert.equal(e.stars, 2250); assert.equal(e.ton, 1.5); assert.equal(e.count, 5); assert.equal(e.buyers, 4);
    assert.equal(e.refundedStars, 300); assert.deepEqual(e.unpaid, { count: 1, stars: 2000 });
    assert.equal(e.testStars, 700); assert.equal(e.testCount, 1);
    assert.deepEqual(e.byCreator.map((c) => [c.name, c.stars]), [["Kyla", 1500], ["Dan", 700], ["Posting plans (T-Social itself)", 50]]);
    assert.equal(e.byCreator.find((c) => c.name === "Kyla")!.ton, 1.5);
    assert.deepEqual(e.byDay.map((d) => d.day), ["2026-10-04", "2026-10-03"], "15:00Z is 01:00 next day in Sydney");
    assert.equal(e.usd, 2250 * 0.013);
    assert.equal(e.bySource.vip.stars, 2200); assert.equal(e.bySource.plans.stars, 50);
  });
  await check("earnings: TON orders, AI purchases net of refunds, empty input is all zeros", () => {
    const e = buildEarnings({ ...base, payments: [], tonOrders: [{ payload: "tu_1", post_id: P, tg_user_id: 5, amount_nano: 100_000_000, cut_nano: 0, status: "paid", created_at: "2026-10-01T00:00:00Z" }, { payload: "tu_2", post_id: P, tg_user_id: 5, amount_nano: 9, cut_nano: 0, status: "pending", created_at: "2026-10-01T00:00:00Z" }] as never,
      aiPurchases: [{ id: "c1", type: "purchase", model_id: "m1", telegram_id: 7, image_id: "i", stars: 250, paid_at: "2026-10-05T00:00:00Z" }, { id: "c2", type: "purchase", model_id: "m1", telegram_id: 8, image_id: "i", stars: 400, paid_at: "2026-10-05T00:00:00Z" }, { id: "c2", type: "refund", model_id: "m1", telegram_id: 8, image_id: "i", stars: 400, paid_at: "2026-10-06T00:00:00Z" }] });
    assert.equal(e.ton, 0.1); assert.equal(e.stars, 250); assert.equal(e.refundedStars, 400); assert.equal(e.bySource.ai.count, 1);
    assert.ok(e.byCreator.some((c) => c.name === "Luna (AI)" && c.stars === 250));
    const z = buildEarnings({ ...base, payments: [] });
    assert.deepEqual([z.stars, z.ton, z.count, z.byDay.length, z.firstPaid], [0, 0, 0, 0, null]);
  });
  await check("bot sends: threads per fan, newest first; VIP deliveries rebuilt from unlocks and dropped once a real log exists", () => {
    const items = new Map([[P, [{ type: "photo" }, { type: "photo" }, { type: "video" }]]]);
    const unlocks = [{ post_id: P, tg_user_id: 1, delivered_at: "2026-10-03T04:00:00Z" }, { post_id: P, tg_user_id: 2, delivered_at: "2026-10-04T04:00:00Z" }, { post_id: P, tg_user_id: 3, delivered_at: null }, { post_id: Q, tg_user_id: 4, delivered_at: "2026-10-04T05:00:00Z" }];
    const rec = reconstructDeliveries(unlocks, items, []);
    assert.equal(rec.length, 4, "two buyers x (text + media); no delivery time = skipped; unknown post = skipped");
    assert.equal(rec[0].text, VIP_DELIVERY_TEXT(3)); assert.deepEqual(rec[1].media.map((m) => m.type), ["photo", "photo", "video"]);
    const real = [{ id: 1, at: "2026-10-04T04:00:30Z", tg_user_id: 2, method: "sendMessage", text: VIP_DELIVERY_TEXT(3), media: null, ok: true, error: null }, { id: 2, at: "2026-10-04T04:00:31Z", tg_user_id: 2, method: "sendMediaGroup", text: null, media: [{ type: "photo" }], ok: false, error: "telegram sendMediaGroup 400" }];
    const rec2 = reconstructDeliveries(unlocks, items, real);
    assert.equal(rec2.filter((b) => b.tg === 2).length, 0, "real log wins over the rebuilt one");
    const t = groupSends(real, rec2);
    assert.deepEqual(t.map((x) => x.tg), [2, 1]);
    assert.equal(t[0].failed, 1); assert.deepEqual(t[0].bubbles.map((b) => b.reconstructed), [false, false]);
    assert.equal(groupSends([], []).length, 0);
  });
  await check("T-Social pages are admin only and AI Models actions are guarded", () => {
    const sidebar = readFileSync("components/Sidebar.tsx", "utf8");
    const admin = sidebar.slice(sidebar.indexOf("const ADMIN_LINKS"), sidebar.indexOf("const TETHER_SIDEBAR_THEME"));
    for (const href of ["/tsocial", "/ai-models"]) assert.ok(admin.includes(`href: "${href}"`), `${href} is in ADMIN_LINKS`);
    for (const f of ["app/tsocial/page.tsx", "app/tsocial/earnings/page.tsx", "app/tsocial/bot-sends/page.tsx", "app/ai-models/page.tsx", "app/ai-models/[id]/page.tsx"])
      assert.match(readFileSync(f, "utf8"), /if \(\(await getDashboardAccess\(\)\) !== null\) notFound\(\)/, `${f} 404s for agency and creator sessions`);
    const src = readFileSync("app/ai-models/actions.ts", "utf8");
    const fns = src.match(/export async function \w+/g) ?? [];
    assert.ok(fns.length >= 8);
    assert.equal((src.match(/await guardDashboardAction\(/g) ?? []).length, fns.length, "every action starts with the guard");
    assert.equal((src.match(/await requireAdmin\(\)/g) ?? []).length, fns.length, "every action requires an admin session");
    assert.ok(!/[–—]/.test(readdirSync("app/ai-models").map((f) => (f.endsWith(".tsx") || f.endsWith(".ts") ? readFileSync(`app/ai-models/${f}`, "utf8") : "")).join("")), "no dashes in UI copy");
  });
  console.log(`\n${passed} checks passed`);
})().catch((e) => { console.error(e); process.exit(1); });
