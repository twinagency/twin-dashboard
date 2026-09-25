// lib/mtproto/tests/check-bundle-results.ts
//
// Run: npm run test:bundle-results
//
// The bundle-on-reply results panel's numbers, multi-flow. Pure aggregation
// plus the real loader against the in-memory FakeDb: eligible vs refused vs
// flow-gated, sent vs failed with reasons, exact Part 1 / Part 2 purchase
// attribution via video_sequence_entitlements (not price/time guessing), two
// flows on the same creator staying separate, conversion, stars, and the
// "tables not there yet" and read-only guarantees.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { __setMtDbForTest } from "../db";
import { FakeDb } from "./fake-db";
import {
  loadBundleResults, reasonLabel, summarizeBundleResults,
  type BundleConfigRow, type BundleSendDbRow, type EntitlementRow, type PartRow,
} from "../bundle-results";

let passed = 0;
const failures: string[] = [];
async function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  try { await fn(); passed++; } catch (e) { failures.push(`${name}\n      ${e instanceof Error ? e.message : String(e)}`); }
}
const eq = (a: unknown, b: unknown, what: string) => { if (a !== b) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };

const CLONE = "6ca0782d-b5cf-433d-8329-f3ef7ec5f011";
const OTHER = "22222222-2222-4222-8222-222222222222";
const creators = [{ id: CLONE, name: "Alanna Pow" }, { id: OTHER, name: "Other" }];

const FLOW_A = "f1f1f1f1-f1f1-41f1-81f1-f1f1f1f1f1f1";
const FLOW_B = "f2f2f2f2-f2f2-42f2-82f2-f2f2f2f2f2f2";
const REV_A = "11111111-1111-4111-8111-111111111111";
const REV_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const P1_A = "p1a"; const P2_A = "p2a";
const P1_B = "p1b"; const P2_B = "p2b";

const cfg = (over: Partial<BundleConfigRow> = {}): BundleConfigRow => ({
  id: FLOW_A, clone_id: CLONE, flow_key: "joi-on-bed", name: "JOI", enabled: true, priority: 100, audience: "campaign_repliers",
  min_gap_hours: 24, sequence_id: "seq-a", caption: "unlock it", part1_star_price: 320, part2_star_price: 480,
  delay_seconds: 30, allow_uncertain: false, enabled_at: "2026-09-26T00:00:00Z", ...over,
});

let n = 0;
const send = (tg: number, state: BundleSendDbRow["state"], o: Partial<BundleSendDbRow> = {}): BundleSendDbRow => ({
  id: `s${++n}`, clone_id: CLONE, flow_id: FLOW_A, user_id: `u${tg}`, telegram_id: tg, sequence_id: "seq-a",
  revision_id: state === "sent" ? REV_A : null, state, error: null, trigger_source: "reply",
  reply_classification: "none", created_at: "2026-09-26T10:00:00Z", sent_at: state === "sent" ? "2026-09-26T10:05:00Z" : null, ...o,
});

const PARTS: PartRow[] = [
  { id: P1_A, revision_id: REV_A, position: 1, price_stars: 320 },
  { id: P2_A, revision_id: REV_A, position: 2, price_stars: 480 },
  { id: P1_B, revision_id: REV_B, position: 1, price_stars: 700 },
  { id: P2_B, revision_id: REV_B, position: 2, price_stars: 700 }, // same price as part 1 on purpose
];

const ent = (userId: string, partId: string, stars: number, revoked: string | null = null): EntitlementRow =>
  ({ user_id: userId, part_id: partId, price_stars_paid: stars, revoked_at: revoked });

async function main() {
  await check("reasonLabel: blank reads as 'no reason recorded', long text is capped", () => {
    eq(reasonLabel(null), "no reason recorded", "null");
    eq(reasonLabel("  "), "no reason recorded", "blank");
    eq(reasonLabel("x".repeat(200)).length, 90, "capped");
  });

  await check("exact entitlement attribution: buying Part 1 does not count as Part 2, even at the same price", () => {
    const sends = [send(1, "sent")];
    const r = summarizeBundleResults(creators, [cfg()], sends, PARTS, [ent("u1", P1_A, 320)]);
    const f = r.clones[0].flows[0];
    eq(f.part1Purchases, 1, "part1");
    eq(f.part2Purchases, 0, "part2");
    eq(f.stars, 320, "stars");
  });

  await check("both parts bought, sums correctly, and a same-priced Part 1/2 pair never collides", () => {
    // flow B's Part 1 and Part 2 share a price (700); attribution is by part id, not price.
    const sendsB = [send(2, "sent", { flow_id: FLOW_B, revision_id: REV_B, user_id: "u2" })];
    const r = summarizeBundleResults(creators, [cfg({ id: FLOW_B, flow_key: "second", sequence_id: "seq-b" })], sendsB, PARTS, [ent("u2", P1_B, 700), ent("u2", P2_B, 700)]);
    const f = r.clones[0].flows[0];
    eq(f.part1Purchases, 1, "part1");
    eq(f.part2Purchases, 1, "part2");
    eq(f.stars, 1400, "stars: both counted, no collision");
  });

  await check("a revoked entitlement (refund) does not count", () => {
    const sends = [send(1, "sent")];
    const r = summarizeBundleResults(creators, [cfg()], sends, PARTS, [ent("u1", P1_A, 320, "2026-09-27T00:00:00Z")]);
    eq(r.clones[0].flows[0].part1Purchases, 0, "refunded part1 not counted");
  });

  await check("another fan's entitlement never attributes to this send", () => {
    const sends = [send(1, "sent")];
    const r = summarizeBundleResults(creators, [cfg()], sends, PARTS, [ent("u999", P1_A, 320)]);
    eq(r.clones[0].flows[0].part1Purchases, 0, "not this fan");
  });

  await check("per-flow numbers: eligible, refused, flow-gated, sent, failed with reasons, gated, conversion, recent", () => {
    const sends = [
      send(1, "sent"), send(2, "sent"), send(3, "sent", { trigger_source: "backfill" }), send(4, "sent"),
      send(5, "failed", { error: "wrong file identifier" }), send(6, "failed", { error: "wrong file identifier" }),
      send(7, "uncertain", { error: "socket hang up" }),
      send(8, "pending"),
      send(9, "skipped", { error: "gate_outside_window" }),
      send(10, "skipped", { error: "negative:complaint:profanity_off" }),
      send(11, "skipped", { error: "negative:opt_out:stop_contacting_me" }),
      send(12, "skipped", { error: "opted_out" }),
      send(13, "skipped", { error: "other_flow_recent" }),
      send(14, "skipped", { error: "already_has_flow" }),
      send(15, "skipped", { error: "other_flow_in_flight" }),
    ];
    const entitlements = [ent("u1", P1_A, 320), ent("u2", P1_A, 320), ent("u2", P2_A, 480)];
    const r = summarizeBundleResults(creators, [cfg()], sends, PARTS, entitlements);
    const f = r.clones[0].flows[0];
    eq(f.replies, 15, "replies");
    eq(f.negative, 3, "negative (refused)");
    eq(f.flowGated, 3, "flow-gated (multi-flow rules)");
    eq(f.eligible, 9, "eligible (excludes negative and flow-gated)");
    eq(f.previewsSent, 4, "previews sent");
    eq(f.sentByBackfill, 1, "sent by backfill");
    eq(f.sentByReply, 3, "sent by reply");
    eq(f.failed, 2, "failed");
    eq(f.uncertain, 1, "uncertain");
    eq(f.pending, 1, "pending");
    eq(f.gated, 1, "gated (fan safety gate, e.g. outside window)");
    eq(f.part1Purchases, 2, "part1 purchases");
    eq(f.part2Purchases, 1, "part2 purchases");
    eq(f.stars, 320 + 320 + 480, "stars");
    eq(f.conversion, (2 + 1) / (2 * 4), "conversion = purchases / (2*previewsSent)");
    eq(f.failureReasons[0].reason, "wrong file identifier", "top reason");
    eq(f.failureReasons[0].count, 2, "top reason count");
    eq(f.failureReasons.some((x) => /negative|opt_out|other_flow|already_has_flow/.test(x.reason)), false, "refused/flow-gated replies are not listed as failures");
    eq(f.recent.length, 9, "recent list excludes negative and flow-gated rows (= eligible count)");
    eq(f.recent.find((x) => x.telegramId === 2)!.part1Bought, 320, "recent shows part1 purchase");
    eq(f.recent.find((x) => x.telegramId === 2)!.part2Bought, 480, "recent shows part2 purchase");
  });

  await check("two flows on the same creator stay separate and roll up into the clone total", () => {
    const sendsA = [send(1, "sent")];
    const sendsB = [send(2, "sent", { flow_id: FLOW_B, revision_id: REV_B, user_id: "u2" })];
    const r = summarizeBundleResults(
      creators,
      [cfg(), cfg({ id: FLOW_B, flow_key: "second", sequence_id: "seq-b", priority: 200 })],
      [...sendsA, ...sendsB],
      PARTS,
      [ent("u1", P1_A, 320), ent("u2", P1_B, 700)],
    );
    const c = r.clones.find((x) => x.cloneId === CLONE)!;
    eq(c.flows.length, 2, "two flows");
    eq(c.previewsSent, 2, "clone total previews");
    eq(c.purchases, 2, "clone total purchases");
    eq(c.stars, 1020, "clone total stars");
  });

  await check("fleet totals add up across creators and conversion is null with nothing sent", () => {
    const sends = [send(1, "sent"), send(2, "sent", { clone_id: OTHER, flow_id: FLOW_A })];
    const cfgOther = cfg({ clone_id: OTHER });
    const r = summarizeBundleResults(creators, [cfg(), cfgOther], sends, PARTS, [ent("u1", P1_A, 320), ent("u2", P1_A, 320)]);
    eq(r.totals.previewsSent, 2, "previews sent");
    eq(r.totals.part1Purchases, 2, "part1 purchases");
    eq(summarizeBundleResults(creators, [cfg()], [send(1, "pending")], PARTS, []).totals.conversion, null, "null conversion");
  });

  await check("placeholder flow is flagged so the UI can say 'needs setup'", () => {
    const r = summarizeBundleResults(creators, [cfg({ enabled: false, sequence_id: null, caption: "TODO: caption not decided yet", part1_star_price: null, part2_star_price: null })], [], PARTS, []);
    eq(r.clones[0].flows[0].placeholder, true, "placeholder");
    eq(r.clones[0].flows[0].enabled, false, "enabled");
  });
  await check("a real sequence/prices with a TODO-personalise caption is still a placeholder", () => {
    const r = summarizeBundleResults(creators, [cfg({ caption: "TODO-personalise: hey baby" })], [], PARTS, []);
    eq(r.clones[0].flows[0].placeholder, true, "still placeholder");
  });

  await check("loader (FakeDb): reads configs, sends, and only the parts/entitlements the sends need", async () => {
    const db = new FakeDb();
    db.seed("bundle_push_config", [cfg()]);
    db.seed("bundle_push_sends", [send(1, "sent"), send(2, "failed", { error: "boom" })]);
    db.seed("video_sequence_parts", PARTS);
    db.seed("video_sequence_entitlements", [ent("u1", P1_A, 320), ent("u1", P2_A, 480), ent("u999", P1_B, 700)]);
    __setMtDbForTest(db);
    const r = await loadBundleResults(creators);
    eq(r.available, true, "available");
    eq(r.truncated, false, "truncated");
    eq(r.totals.previewsSent, 1, "previews sent");
    eq(r.totals.part1Purchases, 1, "part1 purchases (only u1's revision A entitlements considered)");
    eq(r.totals.part2Purchases, 1, "part2 purchases");
    eq(r.totals.stars, 800, "stars");
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
    db.seed("bundle_push_config", [cfg()]);
    db.fail("bundle_push_sends", "select", { message: "statement timeout", code: "57014" });
    __setMtDbForTest(db);
    const r = await loadBundleResults(creators);
    eq(r.available, true, "available");
    eq(typeof r.error, "string", "error is reported");
    __setMtDbForTest(null);
  });

  await check("loader: no sends at all reads no entitlements (nothing to bound the read by)", async () => {
    const db = new FakeDb();
    db.seed("bundle_push_config", [cfg()]);
    db.seed("bundle_push_sends", []);
    db.seed("video_sequence_entitlements", [ent("u1", P1_A, 320)]);
    __setMtDbForTest(db);
    const r = await loadBundleResults(creators);
    eq(r.totals.part1Purchases, 0, "no purchases counted");
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
