// KNOWN RED (W4 lib-dashboard-data-plus2 F20, F21, F23, docs/review/W4/lib-dashboard-data-plus2.md): lib/dashboard-data.ts
// getDashboard turns a failed read into a plausible page.
// F20: the clones read drops its error (`.then((r) => r.data)`), so revenue renders against an empty fleet with 200.
// F21: getOverviewConversion's deliberate "refusing to publish a partial conversion rate" error is swallowed to `null`
//      (`.catch(() => null)`), with no error field next to it (rankings beside it gets `rankingsError`). Any shape of
//      report passes: an error on any path naming conversion, the refusal text anywhere in the payload, or a rejection.
// F23: `hasFeature = !probe.error`: a 504 timeout on the one-row feature probe silently reads the legacy columns, so `feature`
//      is nulled and a video sale renders as kind "media".
// Real supabase-js against the in-memory PostgREST fake at fetch (tests/support/postgrest-wire.ts, dashboard routes in tests/support/dashboard-wire.ts); any other host
// throws, any unmodelled request answers 599 and crashes the test (plain Error, not a red). Team's Claude owns the fix.
// Intended runner: init.sh's known-red loop; not wired yet: orchestrator item.
import assert from "node:assert/strict";
import { test } from "node:test";
import { NOW, pgError, rowsReply, useWire, type WireRequest } from "../support/postgrest-wire";
import { CLONE_A, dashboardSale, serveDashboardDefaults, statementTimeout } from "../support/dashboard-wire";
import { A } from "../support/ids";
import { outcomeOf } from "../support/outcome";
import { getDashboard } from "../../lib/dashboard-data";

const LEDGER = Array.from({ length: 5 }, (_, i) => dashboardSale(i, "2026-11-10T00:00:00Z", A));
const wire = useWire((w) => serveDashboardDefaults(w, [CLONE_A], LEDGER));
const selects = (r: WireRequest) => (r.url.searchParams.get("select") ?? "").split(",");
/** The one-row "does the feature column exist" probe. */
const isFeatureProbe = (r: WireRequest) => selects(r).includes("feature") && r.url.searchParams.get("limit") === "1" && !r.url.searchParams.has("offset");

/** A reported error: anything but null/undefined/false/""/{}/[]. */
const present = (v: unknown) =>
  v !== null && v !== undefined && v !== false && v !== "" && !(typeof v === "object" && Object.keys(v as object).length === 0);
/** The refusal getOverviewConversion throws (lib/analytics-data.ts) or the 57014 under it, as text anywhere in the payload. */
const REFUSAL_TEXT = /refusing to publish a partial|revenue_active_chat_buyers failed|57014|statement timeout/i;
/**
 * True when a conversion failure is reported in any shape: a present value on any path that names both "conversion"
 * and "error" (`overviewConversionError`, `overviewErrors.conversion`, `overview.conversion.error`,
 * `overviewConversion: { ok: false, error }`), or the refusal's text anywhere in the payload.
 */
function conversionErrorVisible(d: unknown): boolean {
  const walk = (v: unknown, path: string): boolean => {
    if (/conversion/i.test(path) && /error/i.test(path) && present(v)) return true;
    return !!v && typeof v === "object" && Object.entries(v as object).some(([k, x]) => walk(x, `${path}.${k}`));
  };
  return walk(d, "") || REFUSAL_TEXT.test(JSON.stringify(d) ?? "");
}

test("control: the clones read succeeds and the page lists the clone with its 5 stars", async () => {
  const d = await getDashboard("1W", undefined, NOW, null);
  assert.deepEqual(d.clones.map((c) => [c.id, c.stars]), [[A, 5]]);
  assert.equal(d.totals.stars, 5);
});

test("F20 a failed clones read fails the dashboard instead of rendering revenue against an empty fleet", async () => {
  wire.on("GET /rest/v1/clones", statementTimeout);
  const outcome = await outcomeOf(getDashboard("1W", undefined, NOW, null));
  assert.ok(outcome instanceof Error, outcome instanceof Error ? "" : `resolved with clones.length ${outcome.clones.length}, totals.stars ${outcome.totals.stars}`);
});

test("control: summary mode publishes the conversion object when both conversion RPCs answer", async () => {
  wire.on("POST /rest/v1/rpc/revenue_messaged_fans", () => ({ body: 4 }));
  wire.on("POST /rest/v1/rpc/revenue_active_chat_buyers", () => ({ body: 2 }));
  const d = await getDashboard("1W", undefined, NOW, null, { overviewCloneId: A });
  assert.equal(d.overviewConversion?.activeChatters, 4);
  assert.equal(d.overviewConversion?.activeChatBuyers, 2);
});

test("F21 a refused conversion (57014 on revenue_active_chat_buyers) is reported, not silently null", async () => {
  wire.on("POST /rest/v1/rpc/revenue_messaged_fans", () => ({ body: 4 }));
  wire.on("POST /rest/v1/rpc/revenue_active_chat_buyers", statementTimeout);
  const outcome = await outcomeOf(getDashboard("1W", undefined, NOW, null, { overviewCloneId: A }));
  if (outcome instanceof Error) return; // failing the whole read is also a visible failure
  assert.ok(
    conversionErrorVisible(outcome),
    `resolved with overviewConversion ${JSON.stringify(outcome.overviewConversion)} and no conversion error field (keys: ${Object.keys(outcome).join(",")})`,
  );
});

const VIDEO_SALE = { ...dashboardSale(0, "2026-11-10T00:00:00Z", A), kind: "media", feature: "video" };

test("control: a 42703 on the feature probe still publishes the ledger (pre-024 fallback)", async () => {
  const pages = rowsReply([VIDEO_SALE]);
  wire.on("GET /rest/v1/star_transactions", (req) =>
    isFeatureProbe(req) ? pgError(400, "42703", "column star_transactions.feature does not exist") : pages(req));
  const d = await getDashboard("1W", undefined, NOW, null);
  assert.equal(d.totals.stars, 1);
  assert.equal(d.recent.length, 1);
});

test("F23 a 504 timeout on the feature probe does not silently drop the feature column (video sale stays a video)", async () => {
  const pages = rowsReply([VIDEO_SALE]);
  wire.on("GET /rest/v1/star_transactions", (req) =>
    isFeatureProbe(req) ? pgError(504, "PGRST000", "upstream request timeout") : pages(req));
  const outcome = await outcomeOf(getDashboard("1W", undefined, NOW, null));
  if (outcome instanceof Error) return; // refusing the read is a correct fix too
  assert.equal(outcome.recent[0]?.kind, "video", `recent[0].kind ${outcome.recent[0]?.kind}: the paged read used the legacy columns`);
});
