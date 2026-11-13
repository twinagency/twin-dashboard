// Regression guard (G03, new in this PR; REVIEW.md invariant 7 "Money": no default). lib/onlyfans/plan-c.ts accepted an offer part
// whose price came without a currency, or in a currency the backend never sends (it only sends USD: twin-onlyfans-backend
// service/conversation_engine/approval.py:53 `CURRENCY = 'USD'`, :159). Such a draft is refused, not shown with a guessed currency.
import assert from "node:assert/strict";
import test from "node:test";
import { parsePlanCDraft } from "../../lib/onlyfans/plan-c";
import { MOCK_ACCOUNT, parsedDraft, seedOffer } from "./plan-c-fixtures";

const withCurrency = (currency: unknown) => { const raw = seedOffer(); (raw.parts[1] as Record<string, unknown>).currency = currency; return raw; };

test("control: an offer part priced in USD parses with currency USD", () => {
  assert.equal(parsedDraft(withCurrency("USD")).offer?.currency, "USD");
});

for (const currency of [null, undefined, "", "usd", "EUR"])
  test(`an offer part with currency ${JSON.stringify(currency)} is refused`, () => {
    assert.equal(parsePlanCDraft(withCurrency(currency), MOCK_ACCOUNT), null);
  });
