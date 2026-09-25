// lib/mtproto/tests/check-bundle-results.ts
//
// Run: npm run test:bundle-results
//
// The bundle-on-reply results panel's numbers. Pure aggregation plus the real
// loader against the in-memory FakeDb: eligible vs refused, sent vs failed with
// reasons, purchase matching (duplicate ledger rows must not count twice,
// wrong price / before send / other fan must not count), conversion, stars,
// and the "tables not there yet" and read-only guarantees.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { __setMtDbForTest } from "../db";
import { FakeDb } from "./fake-db";
import { dedupeLedger, loadBundleResults, matchPurchases, summarizeBundleResults, type BundleSendDbRow, type LedgerTx } from "../bundle-results";

let passed = 0;
const failures: string[] = [];
async function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  try { await fn(); passed++; } catch (e) { failures.push(`${name}\n      ${e instanceof Error ? e.message : String(e)}`); }
}
const eq = (a: unknown, b: unknown, what: string) => { if (a !== b) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };

const CLONE = "6ca0782d-b5cf-433d-8329-f3ef7ec5f011";
const OTHER = "22222222-2222-4222-8222-222222222222";
const creators = [{ id: CLONE, name: "Alanna Pow" }, { id: OTHER, name: "Other" }];

let n = 0;
const send = (tg: number, state: BundleSendDbRow["state"], o: Partial<BundleSendDbRow> = {}): BundleSendDbRow => ({
  id: `s${++n}`, clone_id: CLONE, telegram_id: tg, state, error: null, star_price: 500, trigger_source: "reply",
  reply_classification: "none", created_at: "2026-09-26T10:00:00Z", sent_at: state === "sent" ? "2026-09-26T10:05:00Z" : null, ...o,
});
let tx = 0;
const charge = (tg: number, o: Partial<LedgerTx> = {}): LedgerTx => ({
  id: `t${++tx}`, clone_id: CLONE, telegram_id: tg, kind: "media", feature: "bundle", amount_stars: 500,
  invoice_payload: null, paid_at: "2026-09-26T11:00:00Z", created_at: "2026-09-26T11:00:01Z", ...o,
});
const cfg = { clone_id: CLONE, enabled: true, bundle_id: "b1", caption: "unlock it", star_price: 500, delay_seconds: 30, allow_uncertain: false, enabled_at: "2026-09-26T00:00:00Z" };

async function main() {
  await check("dedupe collapses one charge recorded twice under different ids", () => {
    eq(dedupeLedger([charge(1), charge(1, { id: "dupe", created_at: "2026-09-28T00:00:00Z" })]).length, 1, "rows");
    eq(dedupeLedger([charge(1), charge(1, { paid_at: "2026-09-26T11:00:05Z" })]).length, 2, "different second is a different charge");
  });

  await check("a duplicated charge is counted once (money)", () => {
    const sends = [send(1, "sent")];
    const m = matchPurchases(sends, [charge(1), charge(1, { id: "dupe" })]);
    eq(m.size, 1, "matched sends");
    eq(m.get(sends[0].id)!.stars, 500, "stars");
    const r = summarizeBundleResults(creators, [cfg], sends, [charge(1), charge(1, { id: "dupe" })]);
    eq(r.totals.stars, 500, "stars total (not 1000)");
    eq(r.totals.purchases, 1, "purchases");
  });

  await check("does not match: wrong price, before send, other fan, too late, refund, non-bundle feature", () => {
    const s = [send(1, "sent")];
    eq(matchPurchases(s, [charge(1, { amount_stars: 400 })]).size, 0, "wrong price");
    eq(matchPurchases(s, [charge(1, { paid_at: "2026-09-26T09:00:00Z" })]).size, 0, "before the send");
    eq(matchPurchases(s, [charge(2)]).size, 0, "other fan");
    eq(matchPurchases(s, [charge(1, { paid_at: "2026-10-20T11:00:00Z" })]).size, 0, "outside the window");
    eq(matchPurchases(s, [charge(1, { amount_stars: -500 })]).size, 0, "refund");
    eq(matchPurchases(s, [charge(1, { invoice_payload: "refund" })]).size, 0, "refund payload");
    eq(matchPurchases(s, [charge(1, { feature: "photo" })]).size, 0, "a photo purchase");
    eq(matchPurchases([send(1, "failed")], [charge(1)]).size, 0, "a send that never went out");
  });

  await check("one charge serves one send only", () => {
    const a = send(1, "sent");
    const b = send(1, "sent", { sent_at: "2026-09-26T10:30:00Z" });
    eq(matchPurchases([a, b], [charge(1)]).size, 1, "matches");
  });

  await check("per-creator numbers: eligible, refused, sent, failed with reasons, gated, conversion, recent", () => {
    const sends = [
      send(1, "sent"), send(2, "sent"), send(3, "sent", { trigger_source: "backfill" }), send(4, "sent"),
      send(5, "failed", { error: "PHOTO_INVALID_DIMENSIONS" }), send(6, "failed", { error: "PHOTO_INVALID_DIMENSIONS" }),
      send(7, "uncertain", { error: "socket hang up" }),
      send(8, "pending"),
      send(9, "skipped", { error: "gate_outside_window" }),
      send(10, "skipped", { error: "negative:complaint:profanity_off" }),
      send(11, "skipped", { error: "negative:opt_out:stop_contacting_me" }),
      send(12, "skipped", { error: "opted_out" }),
    ];
    const ledger = [charge(1), charge(2), charge(2, { id: "dupe" }), charge(99)];
    const r = summarizeBundleResults(creators, [cfg], sends, ledger);
    const c = r.clones[0];
    eq(c.replies, 12, "replies");
    eq(c.negative, 3, "negative (refused)");
    eq(c.eligible, 9, "eligible");
    eq(c.sent, 4, "sent");
    eq(c.sentByBackfill, 1, "sent by backfill");
    eq(c.sentByReply, 3, "sent by reply");
    eq(c.failed, 2, "failed");
    eq(c.uncertain, 1, "uncertain");
    eq(c.pending, 1, "pending");
    eq(c.gated, 1, "gated");
    eq(c.purchases, 2, "purchases");
    eq(c.stars, 1000, "stars");
    eq(c.conversion, 0.5, "conversion = 2 buyers / 4 sent");
    eq(c.failureReasons[0].reason, "PHOTO_INVALID_DIMENSIONS", "top reason");
    eq(c.failureReasons[0].count, 2, "top reason count");
    eq(c.failureReasons.some((f) => /negative|opt_out/.test(f.reason)), false, "refused replies are not listed as failures");
    eq(c.recent.length, 12, "recent list");
    eq(c.recent.find((x) => x.telegramId === 1)!.boughtStars, 500, "recent shows the purchase");
  });

  await check("fleet totals add up across creators and conversion is null with nothing sent", () => {
    const sends = [send(1, "sent"), send(2, "sent", { clone_id: OTHER })];
    const r = summarizeBundleResults(creators, [cfg], sends, [charge(1), charge(2, { clone_id: OTHER })]);
    eq(r.totals.sent, 2, "sent");
    eq(r.totals.purchases, 2, "purchases");
    eq(summarizeBundleResults(creators, [cfg], [send(1, "pending")], []).totals.conversion, null, "null conversion");
  });

  await check("placeholder config is flagged so the UI can say 'needs setup'", () => {
    const r = summarizeBundleResults(creators, [{ ...cfg, enabled: false, bundle_id: null, caption: "TODO: caption not decided yet" }], [], []);
    eq(r.clones[0].config!.placeholder, true, "placeholder");
    eq(r.clones[0].config!.enabled, false, "enabled");
  });

  await check("loader (FakeDb): reads configs, sends and only the ledger it needs", async () => {
    const db = new FakeDb();
    db.seed("bundle_push_config", [cfg]);
    db.seed("bundle_push_sends", [send(1, "sent"), send(2, "failed", { error: "boom" })]);
    db.seed("star_transactions", [charge(1), charge(1, { id: "dupe" }), charge(2), charge(1, { clone_id: OTHER, id: "x" })]);
    __setMtDbForTest(db);
    const r = await loadBundleResults(creators);
    eq(r.available, true, "available");
    eq(r.truncated, false, "truncated");
    eq(r.totals.sent, 1, "sent");
    eq(r.totals.purchases, 1, "purchases (duplicate ignored)");
    eq(r.totals.stars, 500, "stars");
    eq(r.totals.failed, 1, "failed");
    __setMtDbForTest(null);
  });

  await check("loader: tables not created yet reads as 'not set up', not an error or zeros", async () => {
    const db = new FakeDb();
    db.fail("bundle_push_config", "select", { message: 'relation "public.bundle_push_config" does not exist', code: "42P01" });
    __setMtDbForTest(db);
    const r = await loadBundleResults(creators);
    eq(r.available, false, "available");
    eq(r.error, null, "error");
    __setMtDbForTest(null);
  });

  await check("loader: an unreadable send table is reported, never shown as zero sends", async () => {
    const db = new FakeDb();
    db.seed("bundle_push_config", [cfg]);
    db.fail("bundle_push_sends", "select", { message: "statement timeout", code: "57014" });
    __setMtDbForTest(db);
    const r = await loadBundleResults(creators);
    eq(r.available, true, "available");
    eq(typeof r.error, "string", "error is reported");
    __setMtDbForTest(null);
  });

  await check("READ ONLY: the results module and panel never write or call a send", () => {
    const src = readFileSync(fileURLToPath(new URL("../bundle-results.ts", import.meta.url)), "utf8").replace(/\/\/.*$/gm, "");
    for (const bad of [".insert(", ".update(", ".upsert(", ".delete(", ".rpc(", "fetch("]) if (src.includes(bad)) throw new Error(`bundle-results.ts contains ${bad}`);
    const ui = readFileSync(fileURLToPath(new URL("../../../components/mtproto/BundleResultsPanel.tsx", import.meta.url)), "utf8");
    if (/"use client"|onClick|<form|action=/.test(ui)) throw new Error("the panel must stay a read-only server component");
  });

  const total = passed + failures.length;
  if (failures.length) {
    console.error(`\n  ${failures.length} of ${total} CHECKS FAILED\n`);
    for (const f of failures) console.error(`  ✗ ${f}\n`);
    process.exit(1);
  }
  console.log(`\n  ALL ${total} CHECKS PASSED (bundle results)\n`);
}
main().catch((e) => { console.error(e); process.exit(1); });
