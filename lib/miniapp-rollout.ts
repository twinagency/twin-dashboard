// Pure computation for the Mini App rollout readiness board (app/miniapp-rollout)
// and the per-clone readiness script (scripts/miniapp-readiness.ts). No Supabase
// import here on purpose, same reasoning as lib/api-sim.ts: the status logic is
// asserted against fixture rows in scripts/check-miniapp-rollout.ts without a
// database, and the page/script layer is just plumbing that fetches rows and
// calls these functions.
//
// Reference clone: Alanna Pow (6ca0782d-b5cf-433d-8329-f3ef7ec5f011). Her
// creator_catalogue_settings row + 4 enabled bundles are the "fully on" shape
// every other clone is compared against.

export type Chip = "green" | "amber" | "red";

export const ALLOWED_BUNDLE_THEMES = ["Anal", "Titty", "BG", "GG", "Solo", "Gangbang"] as const;
export type BundleTheme = (typeof ALLOWED_BUNDLE_THEMES)[number];

const BUNDLE_TITLE_RE = new RegExp(`^(${ALLOWED_BUNDLE_THEMES.join("|")}) (Photos|Videos)$`);

export function bundleTitleAllowed(title: string): boolean {
  return BUNDLE_TITLE_RE.test(title.trim());
}

// ---- Mini App live -----------------------------------------------------

export type CatalogueSettingsRow = {
  enabled?: boolean | null;
  mini_app_url?: string | null;
  checkout_mode?: string | null;
  ton_wallet_address?: string | null;
  ton_star_usd?: number | null;
  ton_nanoton_per_star?: number | null;
  ton_discount_percent?: number | null;
} | null;

export type MiniAppLiveStatus = { chip: Chip; label: string };

export function miniAppLiveStatus(settings: CatalogueSettingsRow, safeMiniAppUrl: (v: unknown) => string | null): MiniAppLiveStatus {
  if (!settings) return { chip: "red", label: "Not set up" };
  const hasUrl = !!safeMiniAppUrl(settings.mini_app_url);
  const invoiceMode = settings.checkout_mode === "invoice";
  if (settings.enabled && hasUrl && invoiceMode) return { chip: "green", label: "Live" };
  const missing: string[] = [];
  if (!settings.enabled) missing.push("disabled");
  if (!hasUrl) missing.push("no mini app url");
  if (!invoiceMode) missing.push("checkout mode");
  return { chip: settings.enabled || hasUrl ? "amber" : "red", label: missing.join(", ") || "Not set up" };
}

// ---- TON --------------------------------------------------------------

export type TonStatus = { chip: Chip; label: string };

export function tonStatus(settings: CatalogueSettingsRow): TonStatus {
  if (!settings) return { chip: "red", label: "Not set up" };
  const hasWallet = typeof settings.ton_wallet_address === "string" && settings.ton_wallet_address.trim().length > 0;
  const hasRate = (typeof settings.ton_star_usd === "number" && settings.ton_star_usd > 0) ||
    (typeof settings.ton_nanoton_per_star === "number" && settings.ton_nanoton_per_star > 0);
  const hasDiscount = typeof settings.ton_discount_percent === "number" && settings.ton_discount_percent > 0;
  if (hasWallet && hasRate && hasDiscount) return { chip: "green", label: `${settings.ton_discount_percent}% off` };
  if (hasWallet || hasRate) return { chip: "amber", label: !hasWallet ? "no wallet" : !hasRate ? "no rate" : "no discount" };
  return { chip: "red", label: "Not set up" };
}

// ---- Chat checkout route (independent of Mini App readiness) ------------

export function sellViaMiniAppStatus(clone: { sell_via_mini_app?: boolean | null } | null): { chip: Chip; label: string } {
  if (!clone || clone.sell_via_mini_app == null) return { chip: "amber", label: "Unknown" };
  return clone.sell_via_mini_app
    ? { chip: "green", label: "Mini App" }
    : { chip: "green", label: "Native chat" };
}

// ---- Media readiness ----------------------------------------------------

export type MediaCounts = {
  total: number;
  captioned: number;
  previewed: number;
  compressed: number; // has originals/<path> backup, per task definition
  oversizeVideos: number; // videos over 20MB at current storage_path
};

export function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

export function pctChip(p: number, total: number): Chip {
  if (total === 0) return "red";
  if (p >= 90) return "green";
  if (p >= 50) return "amber";
  return "red";
}

export type MediaReadiness = {
  captionPct: number; captionChip: Chip;
  previewPct: number; previewChip: Chip;
  compressedPct: number; compressedChip: Chip;
  oversizeVideos: number; oversizeChip: Chip;
};

export function mediaReadiness(counts: MediaCounts): MediaReadiness {
  const captionPct = pct(counts.captioned, counts.total);
  const previewPct = pct(counts.previewed, counts.total);
  const compressedPct = pct(counts.compressed, counts.total);
  return {
    captionPct, captionChip: pctChip(captionPct, counts.total),
    previewPct, previewChip: pctChip(previewPct, counts.total),
    compressedPct, compressedChip: pctChip(compressedPct, counts.total),
    oversizeVideos: counts.oversizeVideos,
    oversizeChip: counts.oversizeVideos === 0 ? "green" : counts.oversizeVideos <= 3 ? "amber" : "red",
  };
}

// ---- Bundles --------------------------------------------------------------

export type BundleRow = {
  id: string;
  title: string;
  enabled: boolean;
  photo_ids: string[];
  price_stars: number;
  regular_stars: number;
};

export type BundleValidator = (row: BundleRow) => boolean; // true = valid

export type BundlesStatus = {
  enabledCount: number;
  enabledAllowedCount: number;
  invalidEnabledCount: number;
  chip: Chip;
};

export function bundlesStatus(bundles: BundleRow[], isValid: BundleValidator): BundlesStatus {
  const enabled = bundles.filter((b) => b.enabled);
  const enabledAllowed = enabled.filter((b) => bundleTitleAllowed(b.title));
  const invalid = enabled.filter((b) => !isValid(b));
  const chip: Chip = enabledAllowed.length === 0 ? "red" : invalid.length > 0 ? "amber" : "green";
  return {
    enabledCount: enabled.length,
    enabledAllowedCount: enabledAllowed.length,
    invalidEnabledCount: invalid.length,
    chip,
  };
}

// ---- Prices -----------------------------------------------------------

export type PriceStats = { min: number; avg: number; max: number; count: number } | null;

export function priceStats(values: number[]): PriceStats {
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  return { min, avg, max, count: values.length };
}

// ---- Overall "fully on" rollup -------------------------------------------

export type CloneRollout = {
  miniApp: MiniAppLiveStatus;
  ton: TonStatus;
  sellViaMiniApp: { chip: Chip; label: string };
  media: MediaReadiness;
  bundles: BundlesStatus;
};

export function isFullyOn(row: CloneRollout): boolean {
  return row.miniApp.chip === "green" &&
    row.ton.chip === "green" &&
    row.bundles.chip !== "red" &&
    row.media.captionChip !== "red" &&
    row.media.previewChip !== "red" &&
    row.media.compressedChip !== "red";
}
