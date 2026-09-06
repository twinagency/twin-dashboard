import { strict as assert } from "node:assert";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ConversionCohortStatus, {
  effectiveConversionDial,
  formatEnrollmentDateTime,
} from "./ConversionCohortStatus";

const ENROLLED_AT = "2026-09-06T04:30:00.000Z";

function render(overrides: Partial<Parameters<typeof ConversionCohortStatus>[0]> = {}) {
  return renderToStaticMarkup(
    <ConversionCohortStatus
      newSystemEnabled={true}
      enrolledAt={ENROLLED_AT}
      step1AfterMessages={3}
      step2AfterMessages={4}
      intentFallbackOfferAfterMessages={5}
      intentMaxIgnoredOffers={2}
      {...overrides}
    />,
  );
}

test("shows the New System cohort and its saved conversion timing", () => {
  const html = render();

  assert.match(html, /data-cohort="new-system"/);
  assert.match(html, />New System</);
  assert.match(html, new RegExp(`dateTime="${ENROLLED_AT}"`));
  assert.match(html, />Enrolled [^<]*2026[^<]*(?:am|pm)[^<]*</i);
  assert.match(html, />After 3 messages</);
  assert.match(html, />After 4 messages</);
  assert.match(html, />After 5 messages</);
  assert.match(html, />After 2 ignored offers</);
  assert.doesNotMatch(html, /<(?:input|select|button)\b/);
});

test("shows Control as not enrolled even if stale timestamp metadata exists", () => {
  const html = render({ newSystemEnabled: false, enrolledAt: ENROLLED_AT });

  assert.match(html, /data-cohort="control"/);
  assert.match(html, />Control</);
  assert.match(html, /old system \(control\)/);
  assert.match(html, />Not enrolled</);
  assert.doesNotMatch(html, /<time\b/);
});

test("renders runtime defaults and deliberate zero-value off switches", () => {
  assert.equal(effectiveConversionDial(null, 8), 8);
  assert.equal(effectiveConversionDial(Number.NaN, 8), 8);
  assert.equal(effectiveConversionDial(-1, 8), 8);
  assert.equal(effectiveConversionDial(5.8, 8), 5);
  assert.match(formatEnrollmentDateTime(ENROLLED_AT) ?? "", /2026/);
  assert.equal(formatEnrollmentDateTime("not-a-date"), null);

  const defaults = render({
    step1AfterMessages: null,
    step2AfterMessages: null,
    intentFallbackOfferAfterMessages: null,
    intentMaxIgnoredOffers: null,
  });
  assert.match(defaults, />Not configured</);
  assert.match(defaults, />After 8 messages</);
  assert.match(defaults, />After 2 ignored offers</);

  const disabled = render({
    intentFallbackOfferAfterMessages: 0,
    intentMaxIgnoredOffers: 0,
  });
  assert.match(disabled, />Disabled</);
  assert.match(disabled, />No cap</);
});

test("keeps a New System assignment truthful when enrollment metadata is unavailable", () => {
  const html = render({ enrolledAt: null });

  assert.match(html, />New System</);
  assert.match(html, />Enrollment date unavailable</);
  assert.doesNotMatch(html, />Not enrolled</);
});
