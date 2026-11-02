// Pure fixture tests for lib/miniapp-rollout.ts, the status computation behind
// app/miniapp-rollout/page.tsx and scripts/miniapp-readiness.ts. No database:
// same reasoning as scripts/check-public-api.ts and lib/api-sim.ts, so this
// runs offline and fast.
import { strict as assert } from "node:assert";
import {
  ALLOWED_BUNDLE_THEMES,
  bundleTitleAllowed,
  bundlesStatus,
  isFullyOn,
  mediaReadiness,
  miniAppLiveStatus,
  pct,
  pctChip,
  priceStats,
  sellViaMiniAppStatus,
  tonStatus,
  type BundleRow,
  type CloneRollout,
} from "@/lib/miniapp-rollout";
import { safeMiniAppUrl } from "@/lib/catalogue-core";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`PASS  ${name}`);
}

// ---- bundle theme titles ----

check("allowed bundle themes match exactly the six named themes", () => {
  assert.deepEqual([...ALLOWED_BUNDLE_THEMES], ["Anal", "Titty", "BG", "GG", "Solo", "Gangbang"]);
});

check("bundleTitleAllowed accepts only '<Theme> Photos' / '<Theme> Videos'", () => {
  assert.equal(bundleTitleAllowed("Titty Photos"), true);
  assert.equal(bundleTitleAllowed("Gangbang Videos"), true);
  assert.equal(bundleTitleAllowed("Anal Photos"), true);
  assert.equal(bundleTitleAllowed("Topless In Bed"), false, "a hand-picked bundle title is not an allowed theme");
  assert.equal(bundleTitleAllowed("titty photos"), false, "case must match exactly");
  assert.equal(bundleTitleAllowed("Titty Photos Extra"), false, "no trailing text");
  assert.equal(bundleTitleAllowed("BG Photos"), true);
});

// ---- Mini App live status ----

const VALID_URL = "https://t.me/alannapow_bot?startapp=x";

check("miniAppLiveStatus is green only when enabled + valid url + invoice checkout", () => {
  const status = miniAppLiveStatus(
    { enabled: true, mini_app_url: VALID_URL, checkout_mode: "invoice" },
    safeMiniAppUrl,
  );
  assert.equal(status.chip, "green");
});

check("miniAppLiveStatus is red with no settings row at all", () => {
  assert.equal(miniAppLiveStatus(null, safeMiniAppUrl).chip, "red");
});

check("miniAppLiveStatus is amber when partly configured", () => {
  const status = miniAppLiveStatus({ enabled: true, mini_app_url: null, checkout_mode: "invoice" }, safeMiniAppUrl);
  assert.equal(status.chip, "amber");
  assert.match(status.label, /no mini app url/);
});

check("miniAppLiveStatus rejects a non t.me url", () => {
  const status = miniAppLiveStatus({ enabled: true, mini_app_url: "https://evil.example/?startapp=1", checkout_mode: "invoice" }, safeMiniAppUrl);
  assert.notEqual(status.chip, "green");
});

// ---- TON status ----

check("tonStatus is green only with wallet + rate + discount", () => {
  assert.equal(tonStatus({ ton_wallet_address: "UQ...", ton_star_usd: 0.02, ton_discount_percent: 50 }).chip, "green");
  assert.equal(tonStatus({ ton_wallet_address: "UQ...", ton_nanoton_per_star: 12121212, ton_discount_percent: 10 }).chip, "green");
});

check("tonStatus is red with no wallet and no rate", () => {
  assert.equal(tonStatus({}).chip, "red");
  assert.equal(tonStatus(null).chip, "red");
});

check("tonStatus is amber when only some pieces are set", () => {
  assert.equal(tonStatus({ ton_wallet_address: "UQ..." }).chip, "amber");
});

// ---- sell via mini app ----

check("chat checkout status names both intentional routes without marking native chat incomplete", () => {
  assert.deepEqual(sellViaMiniAppStatus({ sell_via_mini_app: true }), { chip: "green", label: "Mini App" });
  assert.deepEqual(sellViaMiniAppStatus({ sell_via_mini_app: false }), { chip: "green", label: "Native chat" });
  assert.deepEqual(sellViaMiniAppStatus({ sell_via_mini_app: null }), { chip: "amber", label: "Unknown" });
  assert.deepEqual(sellViaMiniAppStatus(null), { chip: "amber", label: "Unknown" });
});

// ---- pct / chip thresholds ----

check("pct and pctChip thresholds", () => {
  assert.equal(pct(0, 0), 0);
  assert.equal(pct(5, 10), 50);
  assert.equal(pctChip(95, 10), "green");
  assert.equal(pctChip(60, 10), "amber");
  assert.equal(pctChip(10, 10), "red");
  assert.equal(pctChip(100, 0), "red", "zero items is never green, there is nothing ready");
});

check("mediaReadiness rolls up caption/preview/compression/oversize", () => {
  const readiness = mediaReadiness({ total: 10, captioned: 10, previewed: 9, compressed: 2, oversizeVideos: 1 });
  assert.equal(readiness.captionChip, "green");
  assert.equal(readiness.previewChip, "green");
  assert.equal(readiness.compressedChip, "red");
  assert.equal(readiness.oversizeChip, "amber");
});

// ---- bundles ----

function bundle(partial: Partial<BundleRow>): BundleRow {
  return { id: "b1", title: "Titty Photos", enabled: true, photo_ids: ["a", "b"], price_stars: 100, regular_stars: 150, ...partial };
}

check("bundlesStatus counts enabled bundles from allowed themes and flags invalid ones", () => {
  const valid = () => true;
  const invalid = () => false;
  const bundles = [bundle({}), bundle({ id: "b2", title: "Some Custom Set" }), bundle({ id: "b3", enabled: false })];
  const status = bundlesStatus(bundles, valid);
  assert.equal(status.enabledCount, 2);
  assert.equal(status.enabledAllowedCount, 1, "the custom-titled bundle does not count toward the allowed-theme total");
  assert.equal(status.chip, "green");

  const statusInvalid = bundlesStatus(bundles, invalid);
  assert.equal(statusInvalid.chip, "amber", "an allowed-theme bundle exists but fails validation");

  const statusNone = bundlesStatus([bundle({ enabled: false })], valid);
  assert.equal(statusNone.chip, "red", "no enabled allowed-theme bundle at all");
});

// ---- prices ----

check("priceStats returns null for no paid items and min/avg/max otherwise", () => {
  assert.equal(priceStats([]), null);
  const stats = priceStats([100, 200, 300]);
  assert.deepEqual(stats, { min: 100, avg: 200, max: 300, count: 3 });
});

// ---- overall rollup ----

function fullyOnRollout(): CloneRollout {
  return {
    miniApp: { chip: "green", label: "Live" },
    ton: { chip: "green", label: "50% off" },
    sellViaMiniApp: { chip: "green", label: "On" },
    media: { captionPct: 100, captionChip: "green", previewPct: 100, previewChip: "green", compressedPct: 100, compressedChip: "green", oversizeVideos: 0, oversizeChip: "green" },
    bundles: { enabledCount: 4, enabledAllowedCount: 4, invalidEnabledCount: 0, chip: "green" },
  };
}

check("isFullyOn depends on catalogue readiness, independently of chat checkout", () => {
  assert.equal(isFullyOn(fullyOnRollout()), true);
  const nativeChat = fullyOnRollout();
  nativeChat.sellViaMiniApp = sellViaMiniAppStatus({ sell_via_mini_app: false });
  assert.equal(isFullyOn(nativeChat), true, "native chat checkout must not block Mini App readiness");
  const unknownChat = fullyOnRollout();
  unknownChat.sellViaMiniApp = sellViaMiniAppStatus(null);
  assert.equal(isFullyOn(unknownChat), true, "unknown chat route does not change catalogue readiness");
  const missingTon = fullyOnRollout();
  missingTon.ton = { chip: "red", label: "Not set up" };
  assert.equal(isFullyOn(missingTon), false);
  const amberBundles = fullyOnRollout();
  amberBundles.bundles = { ...amberBundles.bundles, chip: "amber" };
  assert.equal(isFullyOn(amberBundles), true, "amber bundles (some invalid) does not block fully-on, only red does");
});

console.log(`\n${passed} checks passed.`);
