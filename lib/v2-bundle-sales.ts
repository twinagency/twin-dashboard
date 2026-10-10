// Twin V2 bundle cards in the Revenue sales list. V2 sells one creator-made bundle as ONE paid-media card and freezes what was quoted in
// public.v2_bundle_offers (migration 20261011000000 in the bot repo). Live Twin's reconciler writes the bundle id (media_id) and the offer id
// (v2_offer_id) with the charge, so a sale can name the real bundle, the exact number of files and the Stars quoted, even after the creator
// edited or deleted the bundle. Nothing here guesses: a charge without an offer id is left to the existing matching, and a missing table
// or column (migration not applied yet) simply means "no V2 bundle information".
export type V2BundleSale = {
  offerId: string;
  bundleId: string | null;
  name: string | null;
  files: number | null;
  quotedStars: number | null;
  storedStars: number | null;
};
type TxRef = { id: string; media_id: string | null; v2_offer_id: string | null };
type OfferRow = { id: string; bundle_id: string | null; bundle_name: string | null; manifest: unknown; quoted_stars: number | null; stored_stars: number | null };

/** Pure join of the charges' own offer ids with the offer records. */
export function joinV2BundleSales(txs: TxRef[], offers: OfferRow[]): Map<string, V2BundleSale> {
  const byId = new Map(offers.map((o) => [String(o.id).toLowerCase(), o]));
  const out = new Map<string, V2BundleSale>();
  for (const t of txs) {
    if (!t.v2_offer_id) continue;
    const o = byId.get(String(t.v2_offer_id).toLowerCase());
    out.set(t.id, {
      offerId: String(t.v2_offer_id).toLowerCase(),
      // the product is what the charge itself says; the offer record only fills in what was quoted
      bundleId: t.media_id ?? o?.bundle_id ?? null,
      name: o?.bundle_name ?? null,
      files: o && Array.isArray(o.manifest) ? o.manifest.length : null,
      quotedStars: o?.quoted_stars ?? null,
      storedStars: o?.stored_stars ?? null,
    });
  }
  return out;
}

export const v2BundleLabel = (s: V2BundleSale) => `${s.name || "Bundle"}${s.files ? ` · ${s.files} files` : ""}`;

type Db = { from: (t: string) => any };
/** Bounded (the ids of the latest sales only). Never throws: before the migration both reads fail and the map is empty. */
export async function loadV2BundleSales(db: Db, chargeIds: string[]): Promise<Map<string, V2BundleSale>> {
  if (!chargeIds.length) return new Map();
  try {
    const tx = await db.from("star_transactions").select("id,media_id,v2_offer_id").in("id", chargeIds.slice(0, 300)).not("v2_offer_id", "is", null);
    if (tx.error || !Array.isArray(tx.data) || !tx.data.length) return new Map();
    const ids = [...new Set((tx.data as TxRef[]).map((t) => t.v2_offer_id as string))];
    const off = await db.from("v2_bundle_offers").select("id,bundle_id,bundle_name,manifest,quoted_stars,stored_stars").in("id", ids);
    return joinV2BundleSales(tx.data as TxRef[], !off.error && Array.isArray(off.data) ? (off.data as OfferRow[]) : []);
  } catch {
    return new Map();
  }
}
