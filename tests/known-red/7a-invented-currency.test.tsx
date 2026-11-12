// KNOWN RED (W1 lane 7a finding 17, LOW, docs/review/W1/preview-plan-c-status-ui.md; REVIEW.md inv 7 "Money: manual
// agency prices only ... no default"). PlanCConsole.tsx:7 `currency ?? "USD"` invents a currency when the backend gave a
// price without one; the lane 1 parser lets it through (plan-c.ts optionalCurrency: null is accepted). The operator then
// approves "USD 5.00" for a card whose currency nobody stated. Design-neutral: a parser refusal (the draft list reads as
// unavailable) or a "currency unknown" label both go green. Team's Claude owns the fix.
// Not wired into npm scripts. Offline: 7a-harness (jsdom, the typed Plan C mock behind the real client and proxy). No network.
import assert from "node:assert/strict";
import test from "node:test";
import { seedOffer, type RawPart } from "../contracts/plan-c-mock-backend";
import { mountConsole, text } from "./7a-harness";

const offerWith = (currency: string | null) => {
  const draft = seedOffer();
  draft.parts = draft.parts.map((part): RawPart => part.action === "offer" ? { ...part, price_cents: 500, currency } : part);
  return draft;
};

test("finding 17: control: an offer part priced 500 in USD shows USD 5.00", async () => {
  await mountConsole({ drafts: [offerWith("USD")] });
  assert.match(text(), /USD 5\.00/);
});

test("finding 17: an offer part priced 500 with no currency does not show an invented USD 5.00", async () => {
  await mountConsole({ drafts: [offerWith(null)] });
  assert.doesNotMatch(text(), /USD 5\.00/, "a price without a currency is shown as USD (invented currency)");
});
