// Offline only: temporary fabricated Cat presentation data. Never touches a
// production account, ledger, payment provider, database or Telegram API.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import {
  CAT_DEMO_ACTIVE_USERS_30D,
  CAT_DEMO_BUYERS_30D,
  CAT_DEMO_KIND,
  CAT_DEMO_MESSAGES_30D,
  CAT_DEMO_PURCHASES_30D,
  catDemoData,
  catDemoInsight,
} from "../lib/cat-demo-data.ts";
import {
  CAT_DEMO_30D_STARS,
  CAT_DEMO_CLONE_ID,
  CAT_DEMO_LIFETIME_STARS,
  CAT_DEMO_QUERY_VALUE,
  CAT_PRESENTATION_QUERY_KEY,
  isCatDemoRequest,
} from "../lib/cat-demo-policy.ts";
import { AUD_PER_USD, fmtMoney, starsToMoneyRate } from "../lib/money.ts";
import { withDashboardAccess } from "../lib/dashboard-access.ts";
import { GET as revenueGET } from "../app/api/dashboard/route.ts";

const now = Date.parse("2026-09-12T03:00:00Z");
const sumStars = rows => rows.reduce((sum, row) => sum + row.stars, 0);

assert.equal(AUD_PER_USD, 1.4, "The presentation target is defined at the dashboard's fixed A$ rate");
assert.equal(fmtMoney(starsToMoneyRate(CAT_DEMO_30D_STARS, "AUD", 1.4), "AUD"), "A$129,384.00");
assert.equal(fmtMoney(starsToMoneyRate(CAT_DEMO_LIFETIME_STARS, "AUD", 1.4), "AUD"), "A$129,384.00");

const month = catDemoData("1M", undefined, now);
assert.equal(month.demo, true);
assert.equal(month.demoKind, CAT_DEMO_KIND);
assert.equal(month.clones.length, 1);
assert.equal(month.clones[0].id, CAT_DEMO_CLONE_ID);
assert.equal(month.clones[0].name, "Cat");
assert.equal(month.totals.stars, CAT_DEMO_30D_STARS);
assert.equal(month.balance.lifetimeStars, CAT_DEMO_LIFETIME_STARS);
assert.equal(month.totals.activeUsers, CAT_DEMO_ACTIVE_USERS_30D);
assert.equal(month.totals.buyers, CAT_DEMO_BUYERS_30D);
assert.equal(month.totals.sales, CAT_DEMO_PURCHASES_30D);
assert.equal(month.totals.messages, CAT_DEMO_MESSAGES_30D);
assert.ok([
  month.totals.stars,
  month.totals.activeUsers,
  month.totals.buyers,
  month.totals.sales,
  month.totals.messages,
  month.balance.lifetimeStars,
  month.balance.totalBalanceStars,
].every(value => value > 0), "Every first-month headline figure is positive");
assert.equal(month.analytics.totals.buyers, month.totals.buyers, "Analytics and headline use the same period buyer cohort");
assert.equal(month.totals.buyers / month.totals.activeUsers, 0.17, "30-day users-to-buyers conversion is exactly 17%");
assert.equal(month.analytics.buyerConversion.activeChatBuyerRate, 0.17);
assert.equal(month.analytics.buyerConversion.lifetimeBuyerRate, 0.17);
assert.equal(month.analytics.funnel.buyerPct, 0.17);
assert.ok(month.totals.sales >= month.totals.buyers, "A buyer can make one or more purchases");
assert.ok(month.totals.messages >= month.totals.activeUsers, "An active user sends at least one message");
assert.ok(month.totals.newFans <= month.totals.activeUsers);

assert.equal(month.totals.stars, month.analytics.totals.revenueStars);
assert.equal(month.totals.stars, sumStars(month.analytics.byFeature));
assert.equal(month.totals.stars, sumStars(month.analytics.byKind));
assert.equal(month.totals.stars, sumStars(month.analytics.byHour));
assert.equal(month.totals.stars, sumStars(month.analytics.byDow));
assert.equal(month.totals.stars, month.series.reduce((sum, row) => sum + row[CAT_DEMO_CLONE_ID], 0));
const monthDailyStars = month.series.map(row => row[CAT_DEMO_CLONE_ID]);
assert.equal(monthDailyStars[0], 0, "The first-month chart begins at the A$0 launch baseline");
assert.ok(monthDailyStars.every(value => value >= 0), "Daily revenue never drops below A$0");
const rises = monthDailyStars.slice(1).filter((value, index) => value > monthDailyStars[index]).length;
const dips = monthDailyStars.slice(1).filter((value, index) => value < monthDailyStars[index]).length;
assert.ok(rises >= 7 && dips >= 7, "The month contains believable rises and pull-backs");
const average = values => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
assert.ok(
  average(monthDailyStars.slice(-7)) > average(monthDailyStars.slice(1, 8)),
  "The final week is stronger than the first paying week without growing in a straight line",
);
assert.notEqual(monthDailyStars.at(-1), Math.max(...monthDailyStars), "The final day is not an artificial all-time peak");
const twoWeeks = catDemoData("2W", undefined, now);
const oneWeek = catDemoData("1W", undefined, now);
const oneDay = catDemoData("1D", undefined, now);
assert.equal(twoWeeks.totals.stars, monthDailyStars.slice(-twoWeeks.series.length).reduce((sum, value) => sum + value, 0));
assert.equal(oneWeek.totals.stars, monthDailyStars.slice(-oneWeek.series.length).reduce((sum, value) => sum + value, 0));
assert.equal(oneDay.totals.stars, monthDailyStars.at(-1));
assert.equal(month.totals.sales, month.analytics.byFeature.reduce((sum, row) => sum + row.sales, 0));
assert.equal(month.analytics.totals.fans, month.analytics.byTier.reduce((sum, row) => sum + row.users, 0));
assert.equal(CAT_DEMO_LIFETIME_STARS, sumStars(month.analytics.byTier));
assert.ok(month.recent.every(row => row.cloneId === CAT_DEMO_CLONE_ID && row.cloneName === "Cat" && row.telegramId === null));
assert.ok(month.analytics.whaleFans.every(row => row.cloneId === CAT_DEMO_CLONE_ID && row.cloneName === "Cat" && row.telegramId === null));
assert.ok(month.analytics.topWeeklySpenders.every(row => row.cloneId === CAT_DEMO_CLONE_ID && row.cloneName === "Cat" && row.telegramId === null));

const lifetime = catDemoData("ALL", undefined, now);
assert.equal(lifetime.totals.stars, CAT_DEMO_LIFETIME_STARS);
assert.equal(lifetime.totals.stars, month.totals.stars, "Month one has no revenue history before the first 30 days");
assert.equal(lifetime.balance.lifetimeStars, CAT_DEMO_LIFETIME_STARS);
assert.deepEqual(month, catDemoData("1M", undefined, now), "Refresh is deterministic at the same time");
const insight = catDemoInsight("2026-09-11", now);
assert.equal(insight.byClone.length, 1);
assert.equal(insight.byClone[0].key, CAT_DEMO_CLONE_ID);
assert.equal(insight.byClone[0].label, "Cat");
assert.equal(insight.totals.stars, sumStars(insight.byFeature));
assert.match(insight.summary.detail, /first four weeks/i);
assert.equal(insight.comparison.sampleDays, 28);
assert.doesNotMatch(`${insight.summary.headline} ${insight.summary.detail} ${insight.comparison.scopeLabel}`, /\bdemo\b/i);

const query = value => new URLSearchParams(value);
const internal = null;
const scopedCreator = { cloneIds: [CAT_DEMO_CLONE_ID] };
assert.equal(isCatDemoRequest(query(`${CAT_PRESENTATION_QUERY_KEY}=${CAT_DEMO_QUERY_VALUE}`), internal, CAT_DEMO_CLONE_ID), true);
assert.equal(isCatDemoRequest(query(""), internal, CAT_DEMO_CLONE_ID), false);
assert.equal(isCatDemoRequest(query("view=other"), internal, CAT_DEMO_CLONE_ID), false);
assert.equal(isCatDemoRequest(query("view=cat&view=cat"), internal, CAT_DEMO_CLONE_ID), false);
assert.equal(isCatDemoRequest(query("view=cat"), internal, "another-clone"), false);
assert.equal(isCatDemoRequest(query("view=cat"), scopedCreator, CAT_DEMO_CLONE_ID), false, "Scoped creator/agency access never receives fabricated figures");
assert.equal(isCatDemoRequest(query("view=cat"), undefined, CAT_DEMO_CLONE_ID), false);

const source = readFileSync("lib/cat-demo-data.ts", "utf8");
assert.doesNotMatch(source, /\b(?:fetch|serviceClient|supabaseAdmin)\s*\(/);
assert.doesNotMatch(source, /\.from\(\s*["'`]|\.rpc\(|\.insert\(|\.update\(|\.upsert\(/);

const originalFetch = globalThis.fetch;
let networkCalls = 0;
globalThis.fetch = async () => {
  networkCalls += 1;
  throw new Error("Cat presentation endpoint attempted an external request");
};
try {
  const request = new NextRequest(
    `https://dashboard.tgaiclone.xyz/api/dashboard?period=1M&clone=${CAT_DEMO_CLONE_ID}&${CAT_PRESENTATION_QUERY_KEY}=${CAT_DEMO_QUERY_VALUE}`,
  );
  const response = await withDashboardAccess(null, () => revenueGET(request));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-data-mode"), "cat-presentation-demo");
  assert.match(response.headers.get("cache-control") || "", /no-store/);
  const payload = await response.json();
  assert.equal(payload.demo, true);
  assert.equal(payload.demoKind, CAT_DEMO_KIND);
  assert.equal(payload.totals.stars, CAT_DEMO_30D_STARS);
  assert.equal(payload.totals.activeUsers, CAT_DEMO_ACTIVE_USERS_30D);
  assert.equal(payload.totals.buyers, CAT_DEMO_BUYERS_30D);
  assert.equal(networkCalls, 0, "Early return does not read live rollups, Telegram or financial services");
} finally {
  globalThis.fetch = originalFetch;
}

console.log("CAT DEMO PASSED: A$129,384 at 1.4 AUD/USD, exact 17% active conversion, coherent ledger totals, internal-admin-only exact-clone gating, and no live financial reads.");
