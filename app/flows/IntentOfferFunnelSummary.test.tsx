import { strict as assert } from "node:assert";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import IntentOfferFunnelSummary from "./IntentOfferFunnelSummary";
import {
  countIntentExperimentAssignments,
  summarizeIntentOfferEvents,
  type IntentExperimentAssignmentRow,
  type IntentOfferEventRow,
} from "@/lib/intent-offer-analytics";

const events: IntentOfferEventRow[] = [
  { id: "1", attempt_id: "a", clone_id: "c", event_type: "attempted", variant: "v2", price_stars: null, block_reason: null, created_at: "2026-09-07T00:00:00Z" },
  { id: "2", attempt_id: "a", clone_id: "c", event_type: "delivered", variant: "v2", price_stars: 299, block_reason: null, created_at: "2026-09-07T00:00:01Z" },
  { id: "3", attempt_id: "a", clone_id: "c", event_type: "purchased", variant: "v2", price_stars: 299, block_reason: null, created_at: "2026-09-07T00:02:00Z" },
  { id: "4", attempt_id: "b", clone_id: "c", event_type: "attempted", variant: "v2", price_stars: null, block_reason: null, created_at: "2026-09-07T00:03:00Z" },
  { id: "5", attempt_id: "b", clone_id: "c", event_type: "blocked", variant: "v2", price_stars: null, block_reason: "cooldown_active", created_at: "2026-09-07T00:03:01Z" },
  { id: "6", attempt_id: "z", clone_id: "c", event_type: "attempted", variant: "control", price_stars: null, block_reason: null, created_at: "2026-09-07T00:04:00Z" },
];
const assignments: IntentExperimentAssignmentRow[] = [
  { clone_id: "c", user_id: "u1", variant: "v2", assigned_at: "2026-09-07T00:00:00Z" },
  { clone_id: "c", user_id: "u2", variant: "control", assigned_at: "2026-09-07T00:00:00Z" },
];

test("rolls up distinct V2 lifecycle stages and purchased Stars", () => {
  const summary = summarizeIntentOfferEvents(events, "v2");
  assert.equal(summary.attempted, 2);
  assert.equal(summary.delivered, 1);
  assert.equal(summary.blocked, 1);
  assert.equal(summary.purchased, 1);
  assert.equal(summary.deliveryRate, 50);
  assert.equal(summary.purchaseRate, 100);
  assert.equal(summary.stars, 299);
  assert.deepEqual(summary.blockReasons, [{ reason: "cooldown_active", count: 1 }]);
});

test("does not double count a duplicate stage for the same attempt", () => {
  const duplicate = { ...events[2], id: "duplicate" };
  const summary = summarizeIntentOfferEvents([...events, duplicate], "v2");
  assert.equal(summary.purchased, 1);
  assert.equal(summary.stars, 299);
});

test("counts stable fan assignments once per creator and fan", () => {
  assert.equal(countIntentExperimentAssignments([...assignments, assignments[0]], "v2"), 1);
  assert.equal(countIntentExperimentAssignments(assignments, "control"), 1);
});

test("renders both fan variants, rates, Stars and block reasons", () => {
  const html = renderToStaticMarkup(
    <IntentOfferFunnelSummary events={events} assignments={assignments} hasV2Creators windowLabel="Since V2 enrollment" />,
  );
  assert.match(html, /50\/50 fan split/);
  assert.match(html, />Attempted</);
  assert.match(html, />Assigned fans</);
  assert.match(html, />Delivered</);
  assert.match(html, />Blocked</);
  assert.match(html, />Purchased</);
  assert.match(html, />V2</);
  assert.match(html, />Control</);
  assert.match(html, />50\.0%|>50%/);
  assert.match(html, /299⭐/);
  assert.match(html, /cooldown active/);
});

test("fails gracefully when analytics are unavailable or empty", () => {
  const unavailable = renderToStaticMarkup(
    <IntentOfferFunnelSummary events={[]} assignments={[]} hasV2Creators unavailable windowLabel="Since V2 enrollment" />,
  );
  assert.match(unavailable, /temporarily unavailable/);

  const empty = renderToStaticMarkup(
    <IntentOfferFunnelSummary events={[]} assignments={[]} hasV2Creators windowLabel="Since V2 enrollment" />,
  );
  assert.match(empty, /No V2 offer events/);
});

test("keeps fan assignment counts visible before the first offer event", () => {
  const html = renderToStaticMarkup(
    <IntentOfferFunnelSummary events={[]} assignments={assignments} hasV2Creators windowLabel="Since V2 enrollment" />,
  );
  assert.match(html, /Fan assignments are live/);
  assert.match(html, />Assigned fans</);
});
