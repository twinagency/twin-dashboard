import assert from "node:assert/strict";
import { withoutCreatorPurchaseHistory } from "../lib/creator-dashboard-privacy";

const buyer = { name: "Private Buyer Fixture", username: "private_buyer_fixture", telegramId: 987654321, stars: 777, purchases: 2 };
const payload = {
  period: "1M",
  recent: [{ buyerName: buyer.name, username: buyer.username, telegramId: buyer.telegramId, stars: 777, paidAt: "2026-10-01T00:00:00Z" }],
  totals: { stars: 2100, sales: 3, buyers: 2 },
  series: [{ bucket: "Oct 1", own: 2100 }],
  balance: { totalBalanceStars: 1400 },
  analytics: {
    whaleFans: [buyer],
    topWeeklySpenders: [buyer],
    totals: { revenueStars: 2100, sales: 3, buyers: 2 },
    byFeature: [{ key: "photo", stars: 2100, sales: 3 }],
    buyerConversion: { activeChatters: 10, activeChatBuyers: 2, activeChatBuyerRate: 0.2 },
    weeklySpenderSummary: { stars: 2100, buyers: 2, purchases: 3 },
  },
};
const before = JSON.stringify(payload);
for (const access of [{ kind: "creator", readOnly: true }, { kind: "creator", readOnly: false }]) {
  const result = withoutCreatorPurchaseHistory(payload, access);
  assert.deepEqual(result.recent, []);
  assert.deepEqual(result.analytics.whaleFans, []);
  assert.deepEqual(result.analytics.topWeeklySpenders, []);
  for (const field of ["totals", "series", "balance"] as const) assert.deepEqual(result[field], payload[field]);
  for (const field of ["totals", "byFeature", "buyerConversion", "weeklySpenderSummary"] as const) assert.deepEqual(result.analytics[field], payload.analytics[field]);
  assert.doesNotMatch(JSON.stringify(result), /Private Buyer Fixture|private_buyer_fixture|987654321|paidAt/);
  assert.equal(JSON.stringify(payload), before, "Creator projection must not mutate shared cache data");
}
for (const access of [null, { kind: "agency" }, { kind: "admin" }]) {
  assert.strictEqual(withoutCreatorPurchaseHistory(payload, access), payload);
  assert.equal(JSON.stringify(payload), before);
}
console.log("CREATOR PRIVACY PASSED: no buyer identities or individual purchases, aggregate earnings intact, shared cache unchanged.");
